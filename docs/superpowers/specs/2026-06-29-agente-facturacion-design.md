# Diseño: Agente de Facturación Electrónica por WhatsApp

**Fecha:** 2026-06-29  
**Estado:** Aprobado por usuario  
**Proyecto:** `agente-facturacion`

---

## 1. Resumen ejecutivo

SaaS multi-tenant que permite a profesionales de salud independientes (psicólogos, médicos, nutricionistas, etc.) emitir facturas electrónicas AFIP desde WhatsApp en menos de 2 minutos, sin acceder a ningún portal externo. El profesional escribe en lenguaje natural ("facturale a María García consulta de ayer $15.000") y el sistema extrae los datos, confirma, emite ante AFIP y envía el PDF por WhatsApp.

---

## 2. Decisiones de arquitectura

| Decisión | Elección | Motivo |
|---|---|---|
| Arquitectura | Multi-tenant SaaS | Múltiples profesionales independientes con datos aislados |
| Canal WhatsApp MVP | Twilio | Setup inmediato, sin aprobación Meta |
| Canal WhatsApp v2 | Meta Cloud API | Número propio por profesional |
| NLP | GPT-4o-mini | Buen soporte español, precio competitivo, function calling |
| Dashboard | NestJS + React SPA (Vite) | Un solo repo, un solo deploy |
| Deploy | Railway | PostgreSQL incluido, deploy desde GitHub |

---

## 3. Arquitectura general

```
┌─────────────────────────────────────────────────────────┐
│                    Railway (1 servicio)                  │
│                                                         │
│  ┌──────────────┐    ┌───────────────────────────────┐  │
│  │  React SPA   │    │        NestJS App              │  │
│  │  (Vite build)│◄───│  /api/*  →  REST API          │  │
│  │  Dashboard   │    │  /webhook → WhatsApp handler  │  │
│  └──────────────┘    │  /static → sirve React        │  │
│                      └───────────┬───────────────────┘  │
│                                  │                       │
│                      ┌───────────▼───────────┐          │
│                      │   PostgreSQL (Railway) │          │
│                      └───────────────────────┘          │
└─────────────────────────────────────────────────────────┘
         │                    │                │
    ┌────▼────┐          ┌────▼────┐     ┌────▼────┐
    │ Twilio  │          │ OpenAI  │     │  AFIP   │
    │WhatsApp │          │GPT-4o-m │     │  WSFE   │
    └─────────┘          └─────────┘     └─────────┘
```

**Multi-tenancy:** row-level isolation. Cada entidad tiene FK a `professionals`. Sin schemas separados por tenant.

**WhatsApp Gateway abstraído:** interfaz `IWhatsAppGateway` con `sendMessage()` y `sendDocument()`. `TwilioGateway` implementa hoy; `MetaCloudGateway` implementará en v2 sin cambios en el resto del sistema.

---

## 4. Módulos NestJS

```
agente-facturacion/
├── src/
│   ├── modules/
│   │   ├── auth/               # JWT + registro/login profesionales
│   │   ├── professionals/      # Perfil, CUIT, certificados AFIP
│   │   ├── patients/           # CRUD pacientes por profesional
│   │   ├── invoices/           # Historial y emisión de facturas
│   │   ├── conversations/      # Máquina de estados del bot
│   │   ├── whatsapp/           # Gateway + webhook Twilio
│   │   ├── nlp/                # GPT-4o-mini extracción de datos
│   │   ├── afip/               # SDK AFIP, emisión comprobantes
│   │   └── pdf/                # Generación PDF de facturas
│   ├── common/
│   │   ├── guards/             # JwtAuthGuard, TwilioSignatureGuard
│   │   ├── decorators/         # @CurrentProfessional()
│   │   └── interfaces/         # IWhatsAppGateway
│   ├── config/                 # database.config, afip.config
│   └── main.ts
├── client/                     # React + Vite (dashboard)
│   ├── src/
│   │   ├── pages/              # Login, Dashboard, Pacientes, Facturas, Config
│   │   └── components/
│   └── vite.config.ts
├── docker-compose.yml
├── .env.example
└── package.json
```

**Responsabilidades por módulo:**

| Módulo | Responsabilidad |
|---|---|
| `conversations` | Orquesta el flujo: recibe mensaje → consulta estado → llama NLP → emite respuesta |
| `whatsapp` | Solo I/O: recibe webhook, valida firma Twilio, llama gateway para enviar |
| `nlp` | Recibe texto libre → devuelve `{ patientName, amount, date, type, confidence }` |
| `afip` | Recibe datos de factura → devuelve `{ cae, caeVencimiento, numeroComprobante }` |
| `pdf` | Recibe datos completos → genera PDF en memoria → devuelve Buffer |

El `ConversationService` es el director de orquesta. Los demás módulos son servicios puros sin conocimiento del flujo.

---

## 5. Base de datos

```sql
-- Profesionales (tenants)
professionals
├── id (uuid, PK)
├── email (unique)
├── password_hash
├── full_name
├── cuit (unique)
├── punto_venta (int)
├── invoice_type (enum: B, C)
├── afip_cert (text, encrypted AES-256-GCM)
├── afip_key (text, encrypted AES-256-GCM)
├── afip_env (enum: testing, prod)
├── twilio_phone (unique)
├── whatsapp_number
└── created_at

-- Pacientes (por profesional)
patients
├── id (uuid, PK)
├── professional_id (FK → professionals)
├── full_name
├── dni
├── cuit (nullable)
├── email (nullable)
├── phone (nullable)
└── created_at

-- Sesiones de conversación WhatsApp
sessions
├── id (uuid, PK)
├── professional_id (FK)
├── patient_phone
├── state (enum: IDLE, COLLECTING, CONFIRMING, PROCESSING)
├── context (jsonb)        -- datos parciales del flujo
└── updated_at             -- TTL: > 30min → reset a IDLE

-- Facturas emitidas
invoices
├── id (uuid, PK)
├── professional_id (FK)
├── patient_id (FK → patients)
├── numero_comprobante (int)
├── tipo (enum: B, C)
├── importe (decimal 10,2)
├── fecha_servicio (date)
├── cae (varchar)
├── cae_vencimiento (date)
├── status (enum: EMITTED, PENDING, FAILED)
└── emitted_at

-- Tipos de prestación con importe sugerido
consultation_types
├── id (uuid, PK)
├── professional_id (FK)
├── name
└── default_amount (decimal)
```

**Decisiones de diseño:**
- `sessions.context` es JSONB — almacena datos parciales sin columnas fijas
- `afip_cert` y `afip_key` cifrados en DB (AES-256-GCM). No se guardan en filesystem (Railway no tiene volúmenes persistentes)
- `invoices.status` permite reintentos automáticos para facturas PENDING
- PDFs se generan en memoria como Buffer: se envían por WhatsApp directamente y se regeneran desde los datos de la factura cuando el profesional los descarga desde el dashboard. Sin almacenamiento en disco.
- Cron job limpia sesiones inactivas > 30 minutos (reset a IDLE)

---

## 6. Flujo conversacional

### Máquina de estados

```
IDLE ──► COLLECTING ──► CONFIRMING ──► PROCESSING ──► IDLE
  ▲                                          │
  └──────────── error / cancelar ────────────┘
```

### Happy path

```
👤 "facturale a María García consulta de ayer 15000"

🤖 "Entendido. Confirmá antes de emitir:
   👤 Paciente: María García
   📅 Fecha: 28/06/2026
   💰 Importe: $15.000
   🧾 Tipo: Factura B
   ¿Emito la factura? Respondé *sí* o *no*"

👤 "sí"

🤖 "⏳ Emitiendo en AFIP..."

🤖 "✅ Factura emitida correctamente
   N° 00001-00000042
   CAE: 74539682547123
   Vence: 08/07/2026
   Te mando el PDF ahora 👇"
[PDF adjunto]
```

### Extracción NLP

GPT-4o-mini recibe el texto del profesional más la fecha actual y devuelve JSON estructurado:

```json
{
  "patientName": "María García",
  "amount": 15000,
  "date": "2026-06-28",
  "consultationType": "consulta",
  "confidence": "high"
}
```

Si `confidence === "low"`, el bot solicita confirmación campo por campo en lugar del resumen directo.

### Manejo de errores

| Situación | Respuesta |
|---|---|
| Paciente no encontrado | Ofrece agregar al paciente solicitando DNI |
| AFIP no disponible | Guarda como PENDING, reintenta automáticamente cada 15min |
| Timeout AFIP (>10s) | Reintentos x2 con backoff exponencial, luego PENDING |
| Mensaje no entendido | Sugiere formato: "facturale a [nombre], $[monto]" |
| `/cancelar` | Reset a IDLE con confirmación |

### Comandos especiales
`/ayuda`, `/historial`, `/cancelar`, `/pacientes`

---

## 7. Integración AFIP

**Ciclo de emisión:**
1. Descifrar certificado del profesional desde DB
2. Inicializar SDK con CUIT + cert + key + env (testing/prod)
3. Obtener último número de comprobante (`getLastVoucher`)
4. Construir objeto de factura (Concepto: 2 = Servicios)
5. Llamar WSFE (`createNextVoucher`)
6. Retornar `{ cae, caeVencimiento, numeroComprobante }`

**Tipos de comprobante:**
- Factura B → `CbteTipo: 6` (monotributistas, consumidor final)
- Factura C → `CbteTipo: 11` (exentos)

**Errores AFIP específicos:**

| Código | Significado | Acción |
|---|---|---|
| `10016` | Certificado inválido | Notificar al profesional |
| `10043` | Número duplicado | Reintentar con siguiente número |
| Timeout | Sin respuesta | Reintentar x2, luego PENDING |
| `600-699` | Errores de negocio | Log + mensaje descriptivo |

**Entornos:** `AFIP_ENV=testing` para homologación. Los nuevos profesionales arrancan en testing hasta confirmar configuración.

---

## 8. Dashboard web y autenticación

### Onboarding de nuevo profesional

1. Registro: email + password + nombre + CUIT
2. Config AFIP: upload `.crt` + `.key` + punto de venta
3. Config WhatsApp: registrar número de celular
4. Test homologación: emitir factura de prueba desde dashboard
5. Activar producción: toggle `afipEnv → prod`

### Páginas React

| Ruta | Contenido |
|---|---|
| `/login` | Email + password, JWT en localStorage |
| `/dashboard` | Resumen del mes, últimas 5 facturas |
| `/config` | CUIT, punto de venta, tipo factura, certificados, número WhatsApp |
| `/patients` | Tabla de pacientes, alta manual, búsqueda |
| `/invoices` | Historial completo, filtros, descarga PDF |
| `/test` | Emitir factura de prueba en homologación |

### Auth
- `POST /api/auth/register` → JWT
- `POST /api/auth/login` → JWT
- Expiración: 7 días (refresh token en v2)

### Seguridad
- Certificados AFIP: cifrados AES-256-GCM antes de persistir en DB
- Webhook Twilio: `TwilioSignatureGuard` valida HMAC-SHA1 en cada request
- Identificación del profesional en webhook: por `To` number del mensaje entrante

---

## 9. Variables de entorno

```env
# Base de datos
DATABASE_URL=postgresql://...

# JWT
JWT_SECRET=

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# OpenAI
OPENAI_API_KEY=

# Cifrado de certificados AFIP
ENCRYPTION_KEY=                    # 32 bytes hex

# App
PORT=3000
NODE_ENV=production
```

---

## 10. Roadmap — 4 sprints de 2 semanas

| Sprint | Nombre | Entregable |
|---|---|---|
| 1 | Infraestructura base | NestJS + DB + Auth + webhook Twilio funcionando |
| 2 | Bot conversacional | Flujo completo de conversación con NLP + pacientes |
| 3 | Integración AFIP | Emisión real de facturas en homologación |
| 4 | PDF + Dashboard + Deploy | Sistema completo en Railway con dashboard funcional |

---

## 11. Riesgos principales

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| AFIP homologación inestable | Alta | Cron de reintentos + facturas PENDING |
| Certificados AFIP mal configurados | Alta | Test obligatorio en homologación antes de activar producción |
| Twilio bloquea número por spam | Media | Rate limiting + logs de uso por profesional |
| GPT-4o-mini extrae datos incorrectos | Media | Confidence score + confirmación siempre antes de emitir |
| Railway sin filesystem persistente | Baja | Certificados en DB cifrados, PDFs generados en memoria bajo demanda |
