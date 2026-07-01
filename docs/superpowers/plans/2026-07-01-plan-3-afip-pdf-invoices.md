# AFIP + PDF + Invoices — Implementation Plan (3/4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emitir facturas reales contra AFIP (WSFE), persistirlas con estados EMITTED/PENDING/FAILED, generar el PDF en memoria y entregarlo por WhatsApp y por el dashboard.

**Architecture:** `InvoicesService` implementa `IInvoiceEmitter` y reemplaza al stub del Plan 2 — el `ConversationService` no cambia su contrato. `AfipService` encapsula el SDK (`@afipsdk/afip.js`) y no conoce la persistencia. `PdfService` genera Buffers con pdfkit (sin filesystem). Un cron reintenta las PENDING cada 15 min. El PDF viaja a WhatsApp como URL firmada (JWT corto) porque Twilio requiere `mediaUrl` público.

**Tech Stack:** `@afipsdk/afip.js` 1.2.3, `pdfkit` 0.19.1, NestJS Schedule, JWT para links firmados.

---

## Estructura de archivos

```
src/
├── modules/
│   ├── afip/
│   │   ├── afip.module.ts
│   │   ├── afip.service.ts          # SDK AFIP: emite comprobante, sin DB
│   │   └── afip.service.spec.ts
│   ├── pdf/
│   │   ├── pdf.module.ts
│   │   ├── pdf.service.ts           # datos → Buffer PDF (pdfkit)
│   │   └── pdf.service.spec.ts
│   └── invoices/
│       ├── invoice.entity.ts
│       ├── invoices.module.ts
│       ├── invoices.service.ts      # implementa IInvoiceEmitter, persiste
│       ├── invoices.controller.ts   # GET /invoices, GET :id/pdf, público firmado
│       └── invoices.cron.ts         # reintento PENDING cada 15 min
```

**Cambios sobre Plan 2:**
- `EmittedInvoice` gana `status: 'EMITTED' | 'PENDING'`, `invoiceId` y `pdfUrl?`.
- `ConversationsModule` reemplaza `InvoiceEmitterStub` por `InvoicesService` (se borra el stub).
- `ConversationService`: maneja el caso PENDING (AFIP caído) y envía el PDF con `sendDocument`.
- Env nueva: `APP_URL` (base pública para links de PDF).

---

## Task 1: Dependencias + env

- [ ] `npm install @afipsdk/afip.js pdfkit` y `npm install -D @types/pdfkit`
- [ ] Agregar a `.env` y `.env.example`:

```env
# URL pública de la app (links de PDF para WhatsApp)
APP_URL=http://localhost:3000
```

---

## Task 2: Entidad Invoice

**Files:** Create `src/modules/invoices/invoice.entity.ts`

- [ ] **Step 1: Crear la entidad**

```typescript
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Professional } from '../professionals/professional.entity';
import { Patient } from '../patients/patient.entity';

export type InvoiceStatus = 'EMITTED' | 'PENDING' | 'FAILED';

/**
 * Factura emitida (o pendiente de emisión si AFIP no estaba disponible).
 * El PDF no se persiste: se regenera desde estos datos bajo demanda.
 */
@Entity('invoices')
@Index(['professionalId', 'status'])
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'professional_id' })
  professionalId: string;

  @ManyToOne(() => Professional, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional: Professional;

  @Column({ name: 'patient_id' })
  patientId: string;

  @ManyToOne(() => Patient, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  @Column({ name: 'numero_comprobante', nullable: true })
  numeroComprobante: number;

  @Column({ type: 'enum', enum: ['B', 'C'] })
  tipo: 'B' | 'C';

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  importe: string;

  @Column({ name: 'fecha_servicio', type: 'date' })
  fechaServicio: string;

  @Column({ nullable: true })
  cae: string;

  @Column({ name: 'cae_vencimiento', type: 'date', nullable: true })
  caeVencimiento: string;

  @Column({ type: 'enum', enum: ['EMITTED', 'PENDING', 'FAILED'], default: 'PENDING' })
  status: InvoiceStatus;

  @CreateDateColumn({ name: 'emitted_at' })
  emittedAt: Date;
}
```

---

## Task 3: AfipService (TDD)

**Files:** Create `afip.service.ts`, `afip.service.spec.ts`, `afip.module.ts`

- [ ] **Step 1: Test unitario con SDK mockeado** — verifica: número siguiente a `getLastVoucher`, mapeo B→6 / C→11, retorno `{cae, caeVencimiento, numeroComprobante}`, y que errores de conexión se reintentan y luego lanzan `AfipUnavailableError`.

- [ ] **Step 2: Implementación**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import Afip from '@afipsdk/afip.js';

export class AfipUnavailableError extends Error {}

export interface AfipEmitInput {
  cuit: string;
  cert: string;          // PEM descifrado
  key: string;           // PEM descifrado
  production: boolean;
  puntoVenta: number;
  tipo: 'B' | 'C';
  amount: number;
  serviceDate: string;   // yyyy-mm-dd
}

export interface AfipEmitResult {
  cae: string;
  caeVencimiento: string;
  numeroComprobante: number;
}

const CBTE_TIPO: Record<'B' | 'C', number> = { B: 6, C: 11 };
const MAX_RETRIES = 2;

/**
 * Encapsula el SDK de AFIP (WSFE). Sin estado ni persistencia:
 * recibe credenciales descifradas y devuelve el resultado de la emisión.
 * Concepto 2 = Servicios. DocTipo 99/DocNro 0 = consumidor final.
 */
@Injectable()
export class AfipService {
  private readonly logger = new Logger(AfipService.name);

  async emitVoucher(input: AfipEmitInput): Promise<AfipEmitResult> {
    const afip = new Afip({
      CUIT: Number(input.cuit),
      cert: input.cert,
      key: input.key,
      production: input.production,
    });
    const cbteTipo = CBTE_TIPO[input.tipo];

    return this.withRetries(async () => {
      const last: number = await afip.ElectronicBilling.getLastVoucher(
        input.puntoVenta, cbteTipo,
      );
      const numero = last + 1;
      const serviceDateNum = Number(input.serviceDate.replace(/-/g, ''));
      const todayNum = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''));

      const voucher = {
        CantReg: 1,
        PtoVta: input.puntoVenta,
        CbteTipo: cbteTipo,
        Concepto: 2, // Servicios
        DocTipo: 99, DocNro: 0, // Consumidor final
        CondicionIVAReceptorId: 5, // Consumidor final
        CbteDesde: numero, CbteHasta: numero,
        CbteFch: todayNum,
        FchServDesde: serviceDateNum, FchServHasta: serviceDateNum,
        FchVtoPago: todayNum,
        ImpTotal: input.amount, ImpTotConc: 0, ImpNeto: input.amount,
        ImpOpEx: 0, ImpIVA: 0, ImpTrib: 0,
        MonId: 'PES', MonCotiz: 1,
      };
      const res = await afip.ElectronicBilling.createVoucher(voucher);
      return { cae: res.CAE, caeVencimiento: res.CAEFchVto, numeroComprobante: numero };
    });
  }

  /** Reintenta errores de conexión/timeout con backoff; al agotar lanza AfipUnavailableError. */
  private async withRetries<T>(fn: () => Promise<T>): Promise<T> { /* ... */ }
}
```

- [ ] **Step 3: `afip.module.ts`** — provee y exporta `AfipService`.
- [ ] **Step 4: Tests PASS.**

---

## Task 4: PdfService (TDD)

- [ ] **Step 1: Test** — el Buffer resultante empieza con `%PDF`.
- [ ] **Step 2: Implementación** — `generateInvoicePdf(data): Promise<Buffer>` con pdfkit: encabezado del profesional, tipo/número, paciente, fecha de servicio, importe, CAE y vencimiento.
- [ ] **Step 3: `pdf.module.ts`** — provee y exporta `PdfService`.

---

## Task 5: InvoicesService — implementa IInvoiceEmitter

- [ ] **Step 1: Extender `EmittedInvoice`** en `invoice-emitter.interface.ts`:

```typescript
export interface EmittedInvoice {
  status: 'EMITTED' | 'PENDING';
  invoiceId: string;
  cae?: string;
  caeVencimiento?: string;
  numeroComprobante?: number;
  pdfUrl?: string;
}
```

- [ ] **Step 2: Implementar `InvoicesService`**:
  - `emit(input)`: carga profesional con `addSelect` de cert/key → descifra → `AfipService.emitVoucher` → guarda EMITTED con `pdfUrl` firmado. Si `AfipUnavailableError` → guarda PENDING y lo informa.
  - `retryPending()`: reintenta todas las PENDING (usado por el cron).
  - `findAll(professionalId, filtros)`, `findOne`, `buildPdf(invoice)`.
  - `signPdfToken(invoiceId)` / `verifyPdfToken(token)` con JwtService (expira 7d, payload `{ sub: invoiceId, purpose: 'pdf' }`).

- [ ] **Step 3: `invoices.controller.ts`**:
  - `GET /invoices` (JWT) — lista con filtro opcional `status`.
  - `GET /invoices/:id/pdf` (JWT) — descarga desde dashboard.
  - `GET /invoices/:id/public-pdf?token=` (sin guard) — para `mediaUrl` de Twilio; valida token firmado.

- [ ] **Step 4: `invoices.cron.ts`** — `@Cron` cada 15 min llama `retryPending()`.

- [ ] **Step 5: `invoices.module.ts`** — importa Afip/Pdf/JwtModule (vía AuthModule export), exporta `InvoicesService`.

---

## Task 6: Integrar con el bot (reemplazo del stub)

- [ ] **Step 1:** `ConversationsModule`: importar `InvoicesModule`, proveer `INVOICE_EMITTER` con `useExisting: InvoicesService`. Borrar `invoice-emitter.stub.ts`.
- [ ] **Step 2:** `ConversationService.handleConfirmation`:
  - envolver `emit` en try/catch (error → mensaje de error + reset),
  - si `status === 'PENDING'` → avisar "AFIP no disponible, la emito automáticamente apenas vuelva",
  - si EMITTED → mensaje con CAE + `sendDocument(pdfUrl)` si existe.
- [ ] **Step 3:** Actualizar `conversation.service.spec.ts` al nuevo contrato (mock devuelve `status: 'EMITTED'`, caso PENDING nuevo).

---

## Task 7: Tests e2e de invoices

- [ ] `test/invoices.e2e-spec.ts`: registrar profesional + paciente, insertar factura EMITTED por SQL, verificar `GET /invoices` lista 1, `GET /invoices/:id/pdf` responde `application/pdf` y el body empieza con `%PDF`, y `GET .../public-pdf?token=` con token inválido → 401.

---

## Verificación final

- [ ] `npm test` y `npm run test:e2e` → todo PASS.
- [ ] App arranca; Swagger muestra Invoices.

---

## Siguiente paso: Plan 4/4 — Dashboard React + deploy Railway
