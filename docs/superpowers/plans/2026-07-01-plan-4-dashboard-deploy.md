# Dashboard React + Deploy — Implementation Plan (4/4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Panel web React (Vite) servido como estáticos por NestJS, con onboarding completo del profesional, y configuración de deploy para Railway.

**Architecture:** SPA en `client/` (React 18 + React Router + fetch nativo, JWT en localStorage). En dev corre con Vite dev server + proxy `/api` → :3000. En producción, `@nestjs/serve-static` sirve `client/dist` (solo cuando `NODE_ENV=production`; en dev y en tests no se registra, así la suite no depende del build del cliente). Sin librerías de estado ni UI kits: fetch wrapper + CSS propio (YAGNI).

**Tech Stack:** Vite 6, React 18, react-router-dom 7, @nestjs/serve-static.

---

## Estructura de archivos

```
client/
├── package.json
├── vite.config.ts            # proxy /api en dev
├── tsconfig.json
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx               # router + guard de auth
    ├── api.ts                # fetch wrapper con JWT
    ├── styles.css
    ├── components/Layout.tsx # nav lateral + logout
    └── pages/
        ├── Login.tsx         # login + registro (toggle)
        ├── Dashboard.tsx     # resumen del mes + últimas 5 facturas
        ├── Config.tsx        # perfil + upload certificados AFIP
        ├── Patients.tsx      # tabla + alta + búsqueda + borrar
        ├── Invoices.tsx      # historial + filtro + descarga PDF
        └── TestInvoice.tsx   # emitir factura de prueba (homologación)
src/
└── (backend) POST /api/invoices/emit  # emisión manual desde el panel
railway.json                  # build + start commands
```

---

## Task 1: Endpoint de emisión manual (backend, TDD)

El panel necesita emitir facturas de prueba (página `/test`) y eventualmente manuales. El bot ya usa `InvoicesService.emit`; solo falta exponerlo por REST.

- [ ] **Step 1:** `loadProfessionalWithSecrets` lanza `BadRequestException` (no `Error` genérico) cuando falta config AFIP → el panel recibe 400 con mensaje claro.
- [ ] **Step 2:** e2e en `test/invoices.e2e-spec.ts`: `POST /api/invoices/emit` sin config AFIP → 400; sin token → 401.
- [ ] **Step 3:** DTO `EmitInvoiceDto { patientId, amount, serviceDate }` + `POST /invoices/emit` en el controller (JWT), delega en `InvoicesService.emit`.

## Task 2: Scaffold del cliente Vite

- [ ] `client/package.json`, `vite.config.ts` (proxy `/api` → localhost:3000), `tsconfig.json`, `index.html`, `src/main.tsx`, `src/styles.css`.
- [ ] `npm install` dentro de `client/`.

## Task 3: Infraestructura del SPA

- [ ] `src/api.ts`: wrapper de fetch — agrega `Authorization: Bearer`, parsea errores de Nest (`message`), helper `downloadPdf` (blob). `saveToken/clearToken/hasToken` en localStorage.
- [ ] `src/App.tsx`: rutas `/login` pública; `/`, `/config`, `/patients`, `/invoices`, `/test` protegidas (redirect a login si no hay token) dentro de `Layout`.
- [ ] `src/components/Layout.tsx`: nav + logout.

## Task 4: Páginas

- [ ] `Login.tsx`: toggle login/registro; guarda token y redirige.
- [ ] `Dashboard.tsx`: `GET /invoices` → total facturado del mes, cantidad, últimas 5.
- [ ] `Config.tsx`: `GET/PATCH /professionals/me` + form multipart a `POST /professionals/me/afip-config`.
- [ ] `Patients.tsx`: lista con búsqueda (`?search=`), alta y borrado.
- [ ] `Invoices.tsx`: tabla con filtro por status + botón "PDF" (blob download autenticado).
- [ ] `TestInvoice.tsx`: selector de paciente + monto + fecha → `POST /invoices/emit`; muestra CAE o error. Aviso de que usa el entorno configurado (`afipEnv`).

## Task 5: Servir estáticos desde NestJS + deploy

- [ ] `npm install @nestjs/serve-static` (raíz).
- [ ] `AppModule`: registrar `ServeStaticModule.forRoot({ rootPath: client/dist, exclude: ['/api/{*path}', '/docs/{*path}'] })` **solo si `NODE_ENV === 'production'`**.
- [ ] Scripts raíz: `"build:client": "cd client && npm ci && npm run build"`, `"build:all": "npm run build && npm run build:client"`.
- [ ] `railway.json`: `buildCommand: npm run build:all`, `startCommand: npm run start:prod`.
- [ ] `.gitignore`: agregar `client/dist` y `client/node_modules`.

## Verificación final

- [ ] `npm run test:e2e` y `npm test` → PASS (el ServeStatic condicional no afecta tests).
- [ ] `cd client && npm run build` → build OK.
- [ ] Dev manual: `npm run start:dev` + `cd client && npm run dev` → login, alta de paciente, listado de facturas.
