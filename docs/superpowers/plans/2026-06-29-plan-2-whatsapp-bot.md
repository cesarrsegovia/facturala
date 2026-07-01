# WhatsApp Bot Core — Implementation Plan (2/4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recibir mensajes de WhatsApp (Twilio), extraer datos de facturación con GPT-4o-mini, orquestar la conversación con una máquina de estados y gestionar pacientes.

**Architecture:** `ConversationService` es el director de orquesta. Los módulos satélite (`whatsapp`, `nlp`, `patients`, la emisión de facturas) son servicios puros que no conocen el flujo. La emisión real de AFIP llega en el Plan 3; acá se define la interfaz `IInvoiceEmitter` con un stub, para que el flujo sea testeable de punta a punta sin AFIP. El gateway de WhatsApp está detrás de `IWhatsAppGateway` (hoy Twilio, mañana Meta).

**Tech Stack:** NestJS 11, TypeORM, `openai` SDK (GPT-4o-mini), `twilio` SDK, class-validator. Interfaces con injection tokens (regla `di-use-interfaces-tokens`).

---

## Estructura de archivos

```
src/
├── common/
│   ├── interfaces/
│   │   ├── whatsapp-gateway.interface.ts    # IWhatsAppGateway + token
│   │   └── invoice-emitter.interface.ts     # IInvoiceEmitter + token (Plan 3 lo implementa)
│   └── guards/
│       └── twilio-signature.guard.ts
├── modules/
│   ├── patients/
│   │   ├── patient.entity.ts
│   │   ├── patients.module.ts
│   │   ├── patients.service.ts
│   │   ├── patients.controller.ts
│   │   └── dto/{create-patient.dto.ts, update-patient.dto.ts}
│   ├── consultation-types/
│   │   ├── consultation-type.entity.ts
│   │   └── consultation-types.module.ts
│   ├── sessions/
│   │   ├── session.entity.ts
│   │   ├── sessions.module.ts
│   │   └── sessions.service.ts
│   ├── nlp/
│   │   ├── nlp.module.ts
│   │   ├── nlp.service.ts
│   │   └── dto/extracted-invoice.interface.ts
│   ├── whatsapp/
│   │   ├── whatsapp.module.ts
│   │   ├── whatsapp.controller.ts
│   │   └── twilio.gateway.ts
│   └── conversations/
│       ├── conversations.module.ts
│       ├── conversation.service.ts
│       └── invoice-emitter.stub.ts
```

---

## Task 1: Instalar dependencias

**Files:** `package.json`

- [ ] **Step 1: Instalar SDKs**

```bash
npm install openai twilio
```

- [ ] **Step 2: Agregar variables al `.env` y `.env.example`**

```env
OPENAI_MODEL=gpt-4o-mini
```

(Las demás — `OPENAI_API_KEY`, `TWILIO_*` — ya están en el `.env.example` del Plan 1.)

---

## Task 2: Entidad Patient + CRUD

**Files:**
- Create: `src/modules/patients/patient.entity.ts`
- Create: `src/modules/patients/dto/create-patient.dto.ts`
- Create: `src/modules/patients/dto/update-patient.dto.ts`
- Create: `src/modules/patients/patients.service.ts`
- Create: `src/modules/patients/patients.controller.ts`
- Create: `src/modules/patients/patients.module.ts`
- Create: `test/patients.e2e-spec.ts`

- [ ] **Step 1: Escribir `test/patients.e2e-spec.ts` (falla)**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

describe('Patients (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    dataSource = moduleFixture.get(DataSource);
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'pat-owner@test.com', password: 'securepass123', fullName: 'Dr. Owner', cuit: '20444444444' });
    token = res.body.token;
  });

  afterAll(async () => {
    await dataSource.query('TRUNCATE TABLE patients CASCADE');
    await dataSource.query('TRUNCATE TABLE professionals CASCADE');
    await app.close();
  });

  it('crea un paciente y lo lista', async () => {
    const create = await request(app.getHttpServer())
      .post('/api/patients')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'María García', dni: '30111222' });
    expect(create.status).toBe(201);
    expect(create.body.id).toBeDefined();

    const list = await request(app.getHttpServer())
      .get('/api/patients')
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].fullName).toBe('María García');
  });

  it('busca pacientes por nombre', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/patients?search=garc')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('retorna 401 sin token', async () => {
    const res = await request(app.getHttpServer()).get('/api/patients');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm run test:e2e -- --testPathPattern=patients`
Expected: FAIL — "Cannot POST /api/patients"

- [ ] **Step 3: Crear `patient.entity.ts`**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Professional } from '../professionals/professional.entity';

/**
 * Paciente de un profesional. Aislado por `professionalId` (multi-tenant).
 */
@Entity('patients')
@Index(['professionalId', 'fullName'])
export class Patient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'professional_id' })
  professionalId: string;

  @ManyToOne(() => Professional, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional: Professional;

  @Column({ name: 'full_name' })
  fullName: string;

  @Column({ nullable: true })
  dni: string;

  @Column({ nullable: true })
  cuit: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

- [ ] **Step 4: Crear DTOs**

`dto/create-patient.dto.ts`:
```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePatientDto {
  @ApiProperty({ example: 'María García' })
  @IsString()
  @MinLength(2)
  fullName: string;

  @ApiPropertyOptional({ example: '30111222' })
  @IsOptional()
  @IsString()
  dni?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cuit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;
}
```

`dto/update-patient.dto.ts`:
```typescript
import { PartialType } from '@nestjs/swagger';
import { CreatePatientDto } from './create-patient.dto';

export class UpdatePatientDto extends PartialType(CreatePatientDto) {}
```

- [ ] **Step 5: Crear `patients.service.ts`**

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Patient } from './patient.entity';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

/**
 * CRUD de pacientes, siempre acotado al `professionalId` (aislamiento tenant).
 */
@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient)
    private readonly repo: Repository<Patient>,
  ) {}

  create(professionalId: string, dto: CreatePatientDto): Promise<Patient> {
    const patient = this.repo.create({ ...dto, professionalId });
    return this.repo.save(patient);
  }

  findAll(professionalId: string, search?: string): Promise<Patient[]> {
    return this.repo.find({
      where: {
        professionalId,
        ...(search ? { fullName: ILike(`%${search}%`) } : {}),
      },
      order: { fullName: 'ASC' },
    });
  }

  async findOne(professionalId: string, id: string): Promise<Patient> {
    const patient = await this.repo.findOne({ where: { id, professionalId } });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  /**
   * Busca por nombre (case-insensitive). Devuelve null si no hay match único claro.
   * Usado por el bot para resolver "facturale a María".
   */
  async findByName(professionalId: string, name: string): Promise<Patient | null> {
    const matches = await this.repo.find({
      where: { professionalId, fullName: ILike(`%${name}%`) },
      take: 2,
    });
    return matches.length === 1 ? matches[0] : null;
  }

  async update(professionalId: string, id: string, dto: UpdatePatientDto): Promise<Patient> {
    await this.findOne(professionalId, id);
    await this.repo.update({ id, professionalId }, dto);
    return this.findOne(professionalId, id);
  }

  async remove(professionalId: string, id: string): Promise<void> {
    const result = await this.repo.delete({ id, professionalId });
    if (!result.affected) throw new NotFoundException('Patient not found');
  }
}
```

- [ ] **Step 6: Crear `patients.controller.ts`**

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentProfessional } from '../../common/decorators/current-professional.decorator';
import { Professional } from '../professionals/professional.entity';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

@ApiTags('Patients')
@ApiBearerAuth()
@Controller('patients')
@UseGuards(JwtAuthGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  create(@CurrentProfessional() pro: Professional, @Body() dto: CreatePatientDto) {
    return this.patientsService.create(pro.id, dto);
  }

  @Get()
  findAll(@CurrentProfessional() pro: Professional, @Query('search') search?: string) {
    return this.patientsService.findAll(pro.id, search);
  }

  @Get(':id')
  findOne(@CurrentProfessional() pro: Professional, @Param('id') id: string) {
    return this.patientsService.findOne(pro.id, id);
  }

  @Patch(':id')
  update(
    @CurrentProfessional() pro: Professional,
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patientsService.update(pro.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentProfessional() pro: Professional, @Param('id') id: string) {
    return this.patientsService.remove(pro.id, id);
  }
}
```

- [ ] **Step 7: Crear `patients.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Patient } from './patient.entity';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Patient])],
  providers: [PatientsService],
  controllers: [PatientsController],
  exports: [PatientsService],
})
export class PatientsModule {}
```

- [ ] **Step 8: Registrar `PatientsModule` en `app.module.ts`** (agregar al array `imports`).

- [ ] **Step 9: Correr tests** — `npm run test:e2e -- --testPathPattern=patients` → PASS.

---

## Task 3: Entidad ConsultationType

**Files:**
- Create: `src/modules/consultation-types/consultation-type.entity.ts`
- Create: `src/modules/consultation-types/consultation-types.module.ts`

- [ ] **Step 1: Crear `consultation-type.entity.ts`**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Professional } from '../professionals/professional.entity';

/**
 * Tipo de prestación con importe sugerido (ej. "Consulta" → $15000).
 */
@Entity('consultation_types')
export class ConsultationType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'professional_id' })
  professionalId: string;

  @ManyToOne(() => Professional, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional: Professional;

  @Column()
  name: string;

  @Column({ name: 'default_amount', type: 'decimal', precision: 10, scale: 2 })
  defaultAmount: string;
}
```

- [ ] **Step 2: Crear `consultation-types.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsultationType } from './consultation-type.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ConsultationType])],
  exports: [TypeOrmModule],
})
export class ConsultationTypesModule {}
```

- [ ] **Step 3: Registrar en `app.module.ts`.**

- [ ] **Step 4: Reiniciar app y verificar tabla `consultation_types` creada.**

---

## Task 4: Entidad Session + SessionsService

**Files:**
- Create: `src/modules/sessions/session.entity.ts`
- Create: `src/modules/sessions/sessions.service.ts`
- Create: `src/modules/sessions/sessions.module.ts`

- [ ] **Step 1: Crear `session.entity.ts`**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type ConversationState =
  | 'IDLE'
  | 'COLLECTING'
  | 'CONFIRMING'
  | 'PROCESSING';

/**
 * Estado de una conversación de WhatsApp por (profesional, teléfono del paciente).
 * `context` (JSONB) guarda datos parciales del flujo sin columnas fijas.
 */
@Entity('sessions')
@Index(['professionalId', 'patientPhone'], { unique: true })
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'professional_id' })
  professionalId: string;

  @Column({ name: 'patient_phone' })
  patientPhone: string;

  @Column({
    type: 'enum',
    enum: ['IDLE', 'COLLECTING', 'CONFIRMING', 'PROCESSING'],
    default: 'IDLE',
  })
  state: ConversationState;

  @Column({ type: 'jsonb', default: {} })
  context: Record<string, unknown>;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

- [ ] **Step 2: Crear `sessions.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { ConversationState, Session } from './session.entity';

const STALE_MINUTES = 30;

/**
 * Persistencia del estado conversacional. Crea la sesión si no existe.
 */
@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(Session)
    private readonly repo: Repository<Session>,
  ) {}

  async getOrCreate(professionalId: string, patientPhone: string): Promise<Session> {
    let session = await this.repo.findOne({ where: { professionalId, patientPhone } });
    if (!session) {
      session = this.repo.create({ professionalId, patientPhone, state: 'IDLE', context: {} });
      session = await this.repo.save(session);
    }
    return session;
  }

  update(
    id: string,
    state: ConversationState,
    context: Record<string, unknown>,
  ): Promise<Session> {
    return this.repo.save({ id, state, context });
  }

  reset(id: string): Promise<Session> {
    return this.repo.save({ id, state: 'IDLE' as ConversationState, context: {} });
  }

  /** Resetea sesiones inactivas (> 30 min) a IDLE. Llamado por cron. */
  async resetStale(): Promise<number> {
    const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000);
    const stale = await this.repo.find({
      where: { updatedAt: LessThan(cutoff) },
    });
    for (const s of stale) {
      if (s.state !== 'IDLE') await this.reset(s.id);
    }
    return stale.length;
  }
}
```

> Nota: `Date.now()` está permitido en código de la app; solo está prohibido en scripts de Workflow.

- [ ] **Step 3: Crear `sessions.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from './session.entity';
import { SessionsService } from './sessions.service';

@Module({
  imports: [TypeOrmModule.forFeature([Session])],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
```

- [ ] **Step 4: Registrar en `app.module.ts`.**

---

## Task 5: IWhatsAppGateway + TwilioGateway

**Files:**
- Create: `src/common/interfaces/whatsapp-gateway.interface.ts`
- Create: `src/modules/whatsapp/twilio.gateway.ts`

- [ ] **Step 1: Crear la interfaz + token de inyección**

`src/common/interfaces/whatsapp-gateway.interface.ts`:
```typescript
/** Token de inyección para IWhatsAppGateway (regla di-use-interfaces-tokens). */
export const WHATSAPP_GATEWAY = Symbol('WHATSAPP_GATEWAY');

/**
 * Abstracción del canal de mensajería. Hoy Twilio; mañana Meta Cloud API.
 * El resto del sistema depende de esta interfaz, no de Twilio.
 */
export interface IWhatsAppGateway {
  sendMessage(to: string, body: string): Promise<void>;
  sendDocument(to: string, mediaUrl: string, caption?: string): Promise<void>;
}
```

- [ ] **Step 2: Crear `twilio.gateway.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';
import { IWhatsAppGateway } from '../../common/interfaces/whatsapp-gateway.interface';

/**
 * Implementación de IWhatsAppGateway sobre Twilio WhatsApp.
 */
@Injectable()
export class TwilioGateway implements IWhatsAppGateway {
  private readonly logger = new Logger(TwilioGateway.name);
  private readonly client: Twilio;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.client = new Twilio(
      this.config.getOrThrow<string>('TWILIO_ACCOUNT_SID'),
      this.config.getOrThrow<string>('TWILIO_AUTH_TOKEN'),
    );
    this.from = this.config.getOrThrow<string>('TWILIO_WHATSAPP_FROM');
  }

  async sendMessage(to: string, body: string): Promise<void> {
    await this.client.messages.create({ from: this.from, to: this.normalize(to), body });
  }

  async sendDocument(to: string, mediaUrl: string, caption?: string): Promise<void> {
    await this.client.messages.create({
      from: this.from,
      to: this.normalize(to),
      body: caption,
      mediaUrl: [mediaUrl],
    });
  }

  private normalize(to: string): string {
    return to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  }
}
```

---

## Task 6: TwilioSignatureGuard

**Files:** `src/common/guards/twilio-signature.guard.ts`

- [ ] **Step 1: Crear el guard**

```typescript
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validateRequest } from 'twilio';
import { Request } from 'express';

/**
 * Valida la firma HMAC-SHA1 `X-Twilio-Signature` de cada webhook entrante.
 * Rechaza requests que no provienen de Twilio.
 */
@Injectable()
export class TwilioSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const signature = req.header('X-Twilio-Signature') ?? '';
    const authToken = this.config.getOrThrow<string>('TWILIO_AUTH_TOKEN');
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    const valid = validateRequest(authToken, signature, url, req.body as Record<string, string>);
    if (!valid) throw new UnauthorizedException('Invalid Twilio signature');
    return true;
  }
}
```

> Nota de testing: en e2e este guard se sobrescribe con `.overrideGuard(TwilioSignatureGuard).useValue({ canActivate: () => true })`.

---

## Task 7: NlpModule — extracción con GPT-4o-mini

**Files:**
- Create: `src/modules/nlp/dto/extracted-invoice.interface.ts`
- Create: `src/modules/nlp/nlp.service.ts`
- Create: `src/modules/nlp/nlp.module.ts`
- Create: `src/modules/nlp/nlp.service.spec.ts`

- [ ] **Step 1: Crear la interfaz del resultado**

`dto/extracted-invoice.interface.ts`:
```typescript
export interface ExtractedInvoice {
  patientName: string | null;
  amount: number | null;
  date: string | null; // ISO yyyy-mm-dd
  consultationType: string | null;
  confidence: 'high' | 'low';
}
```

- [ ] **Step 2: Escribir el test unitario (falla) — `nlp.service.spec.ts`**

```typescript
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NlpService } from './nlp.service';

const mockCreate = jest.fn();
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: (...args: unknown[]) => mockCreate(...args) } },
  })),
}));

describe('NlpService', () => {
  let service: NlpService;

  beforeEach(async () => {
    mockCreate.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [
        NlpService,
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => 'sk-test', get: () => 'gpt-4o-mini' },
        },
      ],
    }).compile();
    service = moduleRef.get(NlpService);
  });

  it('parsea el JSON estructurado devuelto por el modelo', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              patientName: 'María García',
              amount: 15000,
              date: '2026-06-28',
              consultationType: 'consulta',
              confidence: 'high',
            }),
          },
        },
      ],
    });

    const result = await service.extractInvoiceData('facturale a María García consulta de ayer 15000', '2026-06-29');
    expect(result.patientName).toBe('María García');
    expect(result.amount).toBe(15000);
    expect(result.confidence).toBe('high');
  });

  it('devuelve confidence low si el modelo no puede extraer', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ patientName: null, amount: null, date: null, consultationType: null, confidence: 'low' }) } }],
    });
    const result = await service.extractInvoiceData('hola', '2026-06-29');
    expect(result.confidence).toBe('low');
  });
});
```

- [ ] **Step 3: Correr y verificar que falla** — `npm test -- nlp.service`

- [ ] **Step 4: Crear `nlp.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ExtractedInvoice } from './dto/extracted-invoice.interface';

const SYSTEM_PROMPT = `Sos un asistente que extrae datos de facturación de mensajes en español rioplatense.
Devolvé SOLO un JSON con: patientName (string|null), amount (number|null, sin separadores),
date (yyyy-mm-dd|null), consultationType (string|null), confidence ("high"|"low").
Interpretá fechas relativas ("ayer", "hoy") respecto de la fecha actual provista.
Si falta algún dato clave (nombre o monto), usá confidence "low".`;

/**
 * Extrae datos estructurados de facturación desde texto libre usando GPT-4o-mini.
 */
@Injectable()
export class NlpService {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({ apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY') });
    this.model = this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';
  }

  async extractInvoiceData(message: string, currentDate: string): Promise<ExtractedInvoice> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Fecha actual: ${currentDate}\nMensaje: ${message}` },
      ],
    });
    const content = completion.choices[0]?.message?.content ?? '{}';
    return this.parse(content);
  }

  private parse(content: string): ExtractedInvoice {
    try {
      const raw = JSON.parse(content) as Partial<ExtractedInvoice>;
      return {
        patientName: raw.patientName ?? null,
        amount: typeof raw.amount === 'number' ? raw.amount : null,
        date: raw.date ?? null,
        consultationType: raw.consultationType ?? null,
        confidence: raw.confidence === 'high' ? 'high' : 'low',
      };
    } catch {
      return { patientName: null, amount: null, date: null, consultationType: null, confidence: 'low' };
    }
  }
}
```

- [ ] **Step 5: Crear `nlp.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { NlpService } from './nlp.service';

@Module({
  providers: [NlpService],
  exports: [NlpService],
})
export class NlpModule {}
```

- [ ] **Step 6: Correr test** — `npm test -- nlp.service` → PASS.

---

## Task 8: IInvoiceEmitter (interfaz + stub)

**Files:**
- Create: `src/common/interfaces/invoice-emitter.interface.ts`
- Create: `src/modules/conversations/invoice-emitter.stub.ts`

- [ ] **Step 1: Crear la interfaz + token**

```typescript
export const INVOICE_EMITTER = Symbol('INVOICE_EMITTER');

export interface EmitInvoiceInput {
  professionalId: string;
  patientId: string;
  amount: number;
  serviceDate: string;
}

export interface EmittedInvoice {
  cae: string;
  caeVencimiento: string;
  numeroComprobante: number;
}

/**
 * Emite una factura. Plan 2 usa un stub; Plan 3 lo implementa contra AFIP.
 */
export interface IInvoiceEmitter {
  emit(input: EmitInvoiceInput): Promise<EmittedInvoice>;
}
```

- [ ] **Step 2: Crear el stub**

```typescript
import { Injectable } from '@nestjs/common';
import { EmitInvoiceInput, EmittedInvoice, IInvoiceEmitter } from '../../common/interfaces/invoice-emitter.interface';

/**
 * Stub de emisión para el Plan 2: devuelve un CAE ficticio sin llamar a AFIP.
 * Permite testear el flujo conversacional completo. Se reemplaza en el Plan 3.
 */
@Injectable()
export class InvoiceEmitterStub implements IInvoiceEmitter {
  emit(_input: EmitInvoiceInput): Promise<EmittedInvoice> {
    return Promise.resolve({
      cae: '00000000000000',
      caeVencimiento: '2099-12-31',
      numeroComprobante: 1,
    });
  }
}
```

---

## Task 9: ConversationService — máquina de estados

**Files:**
- Create: `src/modules/conversations/conversation.service.ts`
- Create: `src/modules/conversations/conversation.service.spec.ts`
- Create: `src/modules/conversations/conversations.module.ts`

- [ ] **Step 1: Escribir el test unitario (falla)**

`conversation.service.spec.ts` — cubre: mensaje inicial → CONFIRMING, "sí" → emite y vuelve a IDLE, "/cancelar" → IDLE.

```typescript
import { Test } from '@nestjs/testing';
import { ConversationService } from './conversation.service';
import { SessionsService } from '../sessions/sessions.service';
import { NlpService } from '../nlp/nlp.service';
import { PatientsService } from '../patients/patients.service';
import { WHATSAPP_GATEWAY } from '../../common/interfaces/whatsapp-gateway.interface';
import { INVOICE_EMITTER } from '../../common/interfaces/invoice-emitter.interface';

describe('ConversationService', () => {
  let service: ConversationService;
  const send = jest.fn();
  const emit = jest.fn();
  let sessionState: any;

  const sessions = {
    getOrCreate: jest.fn(async () => sessionState),
    update: jest.fn(async (_id, state, context) => { sessionState = { ...sessionState, state, context }; return sessionState; }),
    reset: jest.fn(async () => { sessionState = { ...sessionState, state: 'IDLE', context: {} }; return sessionState; }),
  };
  const nlp = { extractInvoiceData: jest.fn() };
  const patients = { findByName: jest.fn() };

  beforeEach(async () => {
    send.mockReset(); emit.mockReset();
    sessionState = { id: 's1', professionalId: 'p1', patientPhone: '+549111', state: 'IDLE', context: {} };
    Object.values(sessions).forEach((f: any) => f.mockClear?.());
    nlp.extractInvoiceData.mockReset(); patients.findByName.mockReset();
    emit.mockResolvedValue({ cae: '123', caeVencimiento: '2026-07-08', numeroComprobante: 42 });

    const moduleRef = await Test.createTestingModule({
      providers: [
        ConversationService,
        { provide: SessionsService, useValue: sessions },
        { provide: NlpService, useValue: nlp },
        { provide: PatientsService, useValue: patients },
        { provide: WHATSAPP_GATEWAY, useValue: { sendMessage: send, sendDocument: jest.fn() } },
        { provide: INVOICE_EMITTER, useValue: { emit } },
      ],
    }).compile();
    service = moduleRef.get(ConversationService);
  });

  it('desde IDLE con datos claros pasa a CONFIRMING y pide confirmación', async () => {
    nlp.extractInvoiceData.mockResolvedValue({ patientName: 'María García', amount: 15000, date: '2026-06-28', consultationType: 'consulta', confidence: 'high' });
    patients.findByName.mockResolvedValue({ id: 'pat1', fullName: 'María García' });

    await service.handleMessage('p1', '+549111', 'facturale a María García 15000', '2026-06-29');

    expect(sessions.update).toHaveBeenCalledWith('s1', 'CONFIRMING', expect.objectContaining({ patientId: 'pat1', amount: 15000 }));
    expect(send).toHaveBeenCalledWith('+549111', expect.stringContaining('Confirmá'));
  });

  it('en CONFIRMING con "sí" emite y vuelve a IDLE', async () => {
    sessionState = { id: 's1', professionalId: 'p1', patientPhone: '+549111', state: 'CONFIRMING', context: { patientId: 'pat1', patientName: 'María García', amount: 15000, date: '2026-06-28' } };
    await service.handleMessage('p1', '+549111', 'sí', '2026-06-29');
    expect(emit).toHaveBeenCalled();
    expect(sessions.reset).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('+549111', expect.stringContaining('CAE'));
  });

  it('"/cancelar" resetea a IDLE', async () => {
    sessionState.state = 'CONFIRMING';
    await service.handleMessage('p1', '+549111', '/cancelar', '2026-06-29');
    expect(sessions.reset).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla** — `npm test -- conversation.service`

- [ ] **Step 3: Crear `conversation.service.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { SessionsService } from '../sessions/sessions.service';
import { NlpService } from '../nlp/nlp.service';
import { PatientsService } from '../patients/patients.service';
import {
  IWhatsAppGateway,
  WHATSAPP_GATEWAY,
} from '../../common/interfaces/whatsapp-gateway.interface';
import {
  IInvoiceEmitter,
  INVOICE_EMITTER,
} from '../../common/interfaces/invoice-emitter.interface';

const AFFIRMATIVE = ['si', 'sí', 'dale', 'ok', 'confirmo'];

/**
 * Orquesta la conversación de facturación con una máquina de estados
 * IDLE → COLLECTING → CONFIRMING → PROCESSING → IDLE.
 * Delega en servicios puros (NLP, pacientes, gateway, emisor).
 */
@Injectable()
export class ConversationService {
  constructor(
    private readonly sessions: SessionsService,
    private readonly nlp: NlpService,
    private readonly patients: PatientsService,
    @Inject(WHATSAPP_GATEWAY) private readonly whatsapp: IWhatsAppGateway,
    @Inject(INVOICE_EMITTER) private readonly emitter: IInvoiceEmitter,
  ) {}

  async handleMessage(
    professionalId: string,
    patientPhone: string,
    text: string,
    currentDate: string,
  ): Promise<void> {
    const session = await this.sessions.getOrCreate(professionalId, patientPhone);
    const normalized = text.trim().toLowerCase();

    if (normalized === '/cancelar') {
      await this.sessions.reset(session.id);
      await this.whatsapp.sendMessage(patientPhone, 'Listo, cancelé la operación. 👍');
      return;
    }

    if (session.state === 'CONFIRMING') {
      await this.handleConfirmation(session, patientPhone, normalized);
      return;
    }

    await this.startCollection(session, professionalId, patientPhone, text, currentDate);
  }

  private async startCollection(
    session: { id: string },
    professionalId: string,
    patientPhone: string,
    text: string,
    currentDate: string,
  ): Promise<void> {
    const extracted = await this.nlp.extractInvoiceData(text, currentDate);

    if (extracted.confidence === 'low' || !extracted.patientName || !extracted.amount) {
      await this.whatsapp.sendMessage(
        patientPhone,
        'No pude entender bien. Probá: "facturale a [nombre], $[monto]".',
      );
      return;
    }

    const patient = await this.patients.findByName(professionalId, extracted.patientName);
    if (!patient) {
      await this.whatsapp.sendMessage(
        patientPhone,
        `No encontré a "${extracted.patientName}". Agregalo desde el panel o pasame su DNI.`,
      );
      return;
    }

    const context = {
      patientId: patient.id,
      patientName: patient.fullName,
      amount: extracted.amount,
      date: extracted.date ?? currentDate,
    };
    await this.sessions.update(session.id, 'CONFIRMING', context);
    await this.whatsapp.sendMessage(patientPhone, this.confirmationText(context));
  }

  private async handleConfirmation(
    session: { id: string; professionalId: string; context: Record<string, unknown> },
    patientPhone: string,
    normalized: string,
  ): Promise<void> {
    if (!AFFIRMATIVE.includes(normalized)) {
      await this.sessions.reset(session.id);
      await this.whatsapp.sendMessage(patientPhone, 'Ok, no emito nada. Escribime cuando quieras. 👍');
      return;
    }

    await this.whatsapp.sendMessage(patientPhone, '⏳ Emitiendo la factura...');
    const ctx = session.context as { patientId: string; amount: number; date: string };
    const result = await this.emitter.emit({
      professionalId: session.professionalId,
      patientId: ctx.patientId,
      amount: ctx.amount,
      serviceDate: ctx.date,
    });
    await this.sessions.reset(session.id);
    await this.whatsapp.sendMessage(
      patientPhone,
      `✅ Factura emitida\nN° ${result.numeroComprobante}\nCAE: ${result.cae}\nVence: ${result.caeVencimiento}`,
    );
  }

  private confirmationText(ctx: { patientName: string; amount: number; date: string }): string {
    return [
      'Confirmá antes de emitir:',
      `👤 Paciente: ${ctx.patientName}`,
      `📅 Fecha: ${ctx.date}`,
      `💰 Importe: $${ctx.amount}`,
      '¿Emito la factura? Respondé *sí* o *no*',
    ].join('\n');
  }
}
```

- [ ] **Step 4: Crear `conversations.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { NlpModule } from '../nlp/nlp.module';
import { PatientsModule } from '../patients/patients.module';
import { ConversationService } from './conversation.service';
import { InvoiceEmitterStub } from './invoice-emitter.stub';
import { INVOICE_EMITTER } from '../../common/interfaces/invoice-emitter.interface';

@Module({
  imports: [SessionsModule, NlpModule, PatientsModule],
  providers: [
    ConversationService,
    { provide: INVOICE_EMITTER, useClass: InvoiceEmitterStub },
  ],
  exports: [ConversationService],
})
export class ConversationsModule {}
```

- [ ] **Step 5: Correr test** — `npm test -- conversation.service` → PASS.

---

## Task 10: WhatsAppModule — webhook + gateway

**Files:**
- Create: `src/modules/whatsapp/whatsapp.controller.ts`
- Create: `src/modules/whatsapp/whatsapp.module.ts`
- Create: `test/whatsapp.e2e-spec.ts`

- [ ] **Step 1: Escribir el test e2e (falla)** — postea un webhook simulando Twilio (guard sobrescrito) y espera 200/204.

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { TwilioSignatureGuard } from '../src/common/guards/twilio-signature.guard';
import { WHATSAPP_GATEWAY } from '../src/common/interfaces/whatsapp-gateway.interface';

describe('WhatsApp webhook (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const sent: Array<{ to: string; body: string }> = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(TwilioSignatureGuard).useValue({ canActivate: () => true })
      .overrideProvider(WHATSAPP_GATEWAY).useValue({
        sendMessage: (to: string, body: string) => { sent.push({ to, body }); return Promise.resolve(); },
        sendDocument: () => Promise.resolve(),
      })
      .compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    dataSource = moduleFixture.get(DataSource);

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'wa@test.com', password: 'securepass123', fullName: 'Dr. Wa', cuit: '20555555555' });
    await dataSource.query(
      `UPDATE professionals SET twilio_phone = 'whatsapp:+14155238886' WHERE email = 'wa@test.com'`,
    );
  });

  afterAll(async () => {
    await dataSource.query('TRUNCATE TABLE sessions CASCADE');
    await dataSource.query('TRUNCATE TABLE professionals CASCADE');
    await app.close();
  });

  it('procesa un mensaje entrante y responde por el gateway', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/webhook/whatsapp')
      .type('form')
      .send({ From: 'whatsapp:+5491100000000', To: 'whatsapp:+14155238886', Body: 'hola' });
    expect([200, 204]).toContain(res.status);
    expect(sent.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Crear `whatsapp.controller.ts`**

```typescript
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TwilioSignatureGuard } from '../../common/guards/twilio-signature.guard';
import { ConversationService } from '../conversations/conversation.service';
import { Professional } from '../professionals/professional.entity';

interface TwilioWebhookBody {
  From: string;
  To: string;
  Body: string;
}

/**
 * Recibe webhooks de Twilio WhatsApp. Identifica al profesional por el número `To`
 * y delega en ConversationService. No contiene lógica de negocio.
 */
@ApiExcludeController()
@Controller('webhook')
export class WhatsAppController {
  constructor(
    private readonly conversations: ConversationService,
    @InjectRepository(Professional)
    private readonly professionalsRepo: Repository<Professional>,
  ) {}

  @Post('whatsapp')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(TwilioSignatureGuard)
  async handle(@Body() body: TwilioWebhookBody): Promise<void> {
    const professional = await this.professionalsRepo.findOne({
      where: { twilioPhone: body.To },
    });
    if (!professional) return; // número no asociado a ningún profesional

    const currentDate = new Date().toISOString().slice(0, 10);
    await this.conversations.handleMessage(professional.id, body.From, body.Body, currentDate);
  }
}
```

- [ ] **Step 3: Crear `whatsapp.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationsModule } from '../conversations/conversations.module';
import { Professional } from '../professionals/professional.entity';
import { WhatsAppController } from './whatsapp.controller';
import { TwilioGateway } from './twilio.gateway';
import { WHATSAPP_GATEWAY } from '../../common/interfaces/whatsapp-gateway.interface';

@Module({
  imports: [ConversationsModule, TypeOrmModule.forFeature([Professional])],
  controllers: [WhatsAppController],
  providers: [{ provide: WHATSAPP_GATEWAY, useClass: TwilioGateway }],
  exports: [WHATSAPP_GATEWAY],
})
export class WhatsAppModule {}
```

> El `WHATSAPP_GATEWAY` se provee acá y `ConversationsModule` lo consume. Como `ConversationService` lo inyecta por token y vive en otro módulo, hay que exponerlo: registrar el provider `WHATSAPP_GATEWAY` en un módulo compartido o proveerlo en `ConversationsModule`. **Decisión:** mover el provider `WHATSAPP_GATEWAY` a `ConversationsModule` (junto a `INVOICE_EMITTER`) y que `WhatsAppModule` solo tenga el controller. Ajustar en Step 4.

- [ ] **Step 4: Reubicar el gateway en `ConversationsModule`**

En `conversations.module.ts`, agregar el provider del gateway y exportarlo:
```typescript
import { TwilioGateway } from '../whatsapp/twilio.gateway';
import { WHATSAPP_GATEWAY } from '../../common/interfaces/whatsapp-gateway.interface';
// ...
  providers: [
    ConversationService,
    { provide: INVOICE_EMITTER, useClass: InvoiceEmitterStub },
    { provide: WHATSAPP_GATEWAY, useClass: TwilioGateway },
  ],
  exports: [ConversationService, WHATSAPP_GATEWAY],
```
Y `whatsapp.module.ts` queda sin el provider del gateway (solo controller + ConversationsModule + repo Professional).

- [ ] **Step 5: Registrar `WhatsAppModule` en `app.module.ts`.**

- [ ] **Step 6: Correr test** — `npm run test:e2e -- --testPathPattern=whatsapp` → PASS.

---

## Task 11: Cron de reseteo de sesiones inactivas

**Files:**
- Modify: `src/app.module.ts` (ScheduleModule.forRoot())
- Create: `src/modules/sessions/sessions.cron.ts`
- Modify: `src/modules/sessions/sessions.module.ts`

- [ ] **Step 1: Habilitar ScheduleModule** en `app.module.ts`:
```typescript
import { ScheduleModule } from '@nestjs/schedule';
// en imports: ScheduleModule.forRoot(),
```

- [ ] **Step 2: Crear `sessions.cron.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SessionsService } from './sessions.service';

/**
 * Resetea a IDLE las sesiones inactivas > 30 min (evita conversaciones colgadas).
 */
@Injectable()
export class SessionsCron {
  private readonly logger = new Logger(SessionsCron.name);
  constructor(private readonly sessions: SessionsService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleStaleSessions(): Promise<void> {
    const count = await this.sessions.resetStale();
    if (count) this.logger.log(`Sesiones revisadas por inactividad: ${count}`);
  }
}
```

- [ ] **Step 3: Registrar `SessionsCron`** como provider en `sessions.module.ts`.

- [ ] **Step 4: Reiniciar app** y verificar que arranca sin errores de scheduling.

---

## Verificación final del Plan 2

- [ ] `npm test` → todos los unit tests (nlp, conversation) PASS.
- [ ] `npm run test:e2e` → auth + professionals + patients + whatsapp PASS.
- [ ] App arranca con `npm run start:dev` sin errores.
- [ ] Swagger en `/docs` muestra los endpoints de Patients.

---

## Siguiente paso: Plan 3/4 — AFIP + PDF + Invoices

- `AfipModule` con `@afipsdk/afip.js` implementando `IInvoiceEmitter` (reemplaza el stub).
- `Invoice` entity + persistencia con estados EMITTED/PENDING/FAILED.
- `PdfModule` generando el comprobante en memoria (Buffer).
- Cron de reintento para facturas PENDING (cada 15 min).
