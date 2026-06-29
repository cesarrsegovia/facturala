# Foundation & Auth — Implementation Plan (1/4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inicializar el proyecto NestJS con PostgreSQL, autenticación JWT, endpoints de perfil para profesionales y upload cifrado de certificados AFIP.

**Architecture:** NestJS monolito con TypeORM + PostgreSQL. Row-level multi-tenancy (cada entidad FK a `professionals`). AES-256-GCM para certificados AFIP en DB. Sin filesystem: Railway no tiene volúmenes persistentes.

**Tech Stack:** NestJS 10, TypeORM 0.3, PostgreSQL 15, @nestjs/jwt, passport-jwt, bcryptjs, class-validator, multer (memory storage), Node.js crypto built-in.

---

## Estructura de archivos

```
agente-facturacion/
├── src/
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── dto/
│   │   │   │   ├── register.dto.ts
│   │   │   │   └── login.dto.ts
│   │   │   └── strategies/
│   │   │       └── jwt.strategy.ts
│   │   └── professionals/
│   │       ├── professionals.module.ts
│   │       ├── professionals.controller.ts
│   │       ├── professionals.service.ts
│   │       ├── professional.entity.ts
│   │       └── dto/
│   │           ├── update-professional.dto.ts
│   │           └── update-afip-config.dto.ts
│   ├── common/
│   │   ├── guards/
│   │   │   └── jwt-auth.guard.ts
│   │   ├── decorators/
│   │   │   └── current-professional.decorator.ts
│   │   └── services/
│   │       └── encryption.service.ts
│   ├── config/
│   │   └── database.config.ts
│   ├── app.module.ts
│   └── main.ts
├── test/
│   ├── auth.e2e-spec.ts
│   └── professionals.e2e-spec.ts
├── docker-compose.yml
├── .env.example
└── package.json
```

---

## Task 1: Inicializar proyecto NestJS e instalar dependencias

**Files:**
- Create: `agente-facturacion/` (via nest new)
- Create: `src/main.ts` (modificar el generado)
- Create: `.env.example`
- Create: `docker-compose.yml`

- [ ] **Step 1: Crear proyecto NestJS**

```bash
nest new agente-facturacion --package-manager npm --skip-git
cd agente-facturacion
```

- [ ] **Step 2: Instalar dependencias**

```bash
npm install @nestjs/typeorm typeorm pg @nestjs/config
npm install @nestjs/jwt @nestjs/passport passport passport-jwt
npm install bcryptjs class-validator class-transformer
npm install @nestjs/platform-express multer @nestjs/schedule
npm install -D @types/passport-jwt @types/bcryptjs @types/multer supertest @types/supertest
```

- [ ] **Step 3: Reemplazar `src/main.ts`**

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

- [ ] **Step 4: Crear `.env.example`**

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/agente_facturacion
JWT_SECRET=change_me_to_a_long_random_string_at_least_32_chars
ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
OPENAI_API_KEY=sk-...
PORT=3000
NODE_ENV=development
```

- [ ] **Step 5: Crear `.env` para desarrollo local**

```bash
cp .env.example .env
```

Generar ENCRYPTION_KEY real (64 chars hex = 32 bytes):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Pegar el resultado en `.env` como `ENCRYPTION_KEY=<output>`.
Cambiar también `JWT_SECRET` por un string largo aleatorio.

- [ ] **Step 6: Crear `docker-compose.yml`**

```yaml
version: '3.8'
services:
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: agente_facturacion
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

- [ ] **Step 7: Levantar PostgreSQL**

```bash
docker compose up -d
```

Expected: `Container agente-facturacion-db-1 Started`

- [ ] **Step 8: Verificar que la app arranca**

```bash
npm run start:dev
```

Expected: `Application is running on: http://localhost:3000`

- [ ] **Step 9: Commit inicial**

```bash
git init
git add .
git commit -m "chore: initialize NestJS project with dependencies"
```

---

## Task 2: Configuración TypeORM + AppModule base

**Files:**
- Create: `src/config/database.config.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Crear `src/config/database.config.ts`**

```typescript
import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export default registerAs('database', (): TypeOrmModuleOptions => ({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  synchronize: process.env.NODE_ENV !== 'production',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
}));
```

- [ ] **Step 2: Reemplazar `src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import databaseConfig from './config/database.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => config.get('database'),
    }),
  ],
})
export class AppModule {}
```

- [ ] **Step 3: Reiniciar y verificar conexión a DB**

```bash
npm run start:dev
```

Expected: arranca sin errores de conexión TypeORM.

- [ ] **Step 4: Commit**

```bash
git add src/config/database.config.ts src/app.module.ts
git commit -m "chore: configure TypeORM with PostgreSQL"
```

---

## Task 3: Entidad Professional

**Files:**
- Create: `src/modules/professionals/professional.entity.ts`
- Create: `src/modules/professionals/professionals.module.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Crear `src/modules/professionals/professional.entity.ts`**

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('professionals')
export class Professional {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash', select: false })
  passwordHash: string;

  @Column({ name: 'full_name' })
  fullName: string;

  @Column({ unique: true })
  cuit: string;

  @Column({ name: 'punto_venta', nullable: true })
  puntoVenta: number;

  @Column({ name: 'invoice_type', type: 'enum', enum: ['B', 'C'], default: 'B' })
  invoiceType: 'B' | 'C';

  @Column({ name: 'afip_cert', nullable: true, select: false })
  afipCert: string;

  @Column({ name: 'afip_key', nullable: true, select: false })
  afipKey: string;

  @Column({
    name: 'afip_env',
    type: 'enum',
    enum: ['testing', 'prod'],
    default: 'testing',
  })
  afipEnv: 'testing' | 'prod';

  @Column({ name: 'twilio_phone', nullable: true, unique: true })
  twilioPhone: string;

  @Column({ name: 'whatsapp_number', nullable: true })
  whatsappNumber: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

> Nota: `passwordHash`, `afipCert` y `afipKey` tienen `select: false` — nunca se exponen en respuestas normales. Se seleccionan explícitamente cuando se necesitan.

- [ ] **Step 2: Crear `src/modules/professionals/professionals.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Professional } from './professional.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Professional])],
  exports: [TypeOrmModule],
})
export class ProfessionalsModule {}
```

- [ ] **Step 3: Registrar ProfessionalsModule en AppModule**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import databaseConfig from './config/database.config';
import { ProfessionalsModule } from './modules/professionals/professionals.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => config.get('database'),
    }),
    ProfessionalsModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 4: Reiniciar y verificar tabla creada**

```bash
npm run start:dev
```

Verificar la tabla:
```bash
docker exec -it $(docker ps -qf "name=db") psql -U postgres -d agente_facturacion -c "\dt"
```

Expected: tabla `professionals` listada.

- [ ] **Step 5: Commit**

```bash
git add src/modules/professionals/
git commit -m "feat: add Professional entity"
```

---

## Task 4: Auth — Endpoint de registro

**Files:**
- Create: `src/modules/auth/dto/register.dto.ts`
- Create: `src/modules/auth/auth.service.ts`
- Create: `src/modules/auth/auth.controller.ts`
- Create: `src/modules/auth/auth.module.ts`
- Create: `test/auth.e2e-spec.ts`

- [ ] **Step 1: Escribir test e2e que falla**

Crear `test/auth.e2e-spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    dataSource = moduleFixture.get(DataSource);
  });

  afterAll(async () => {
    await dataSource.query('TRUNCATE TABLE professionals CASCADE');
    await app.close();
  });

  describe('POST /api/auth/register', () => {
    it('crea un profesional y retorna JWT', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'dr.garcia@test.com',
          password: 'securepass123',
          fullName: 'Dr. García',
          cuit: '20123456789',
        });

      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(typeof res.body.token).toBe('string');
    });

    it('retorna 409 si el email ya existe', async () => {
      const payload = {
        email: 'dup@test.com',
        password: 'securepass123',
        fullName: 'Dr. Dup',
        cuit: '20987654321',
      };
      await request(app.getHttpServer()).post('/api/auth/register').send(payload);
      const res = await request(app.getHttpServer()).post('/api/auth/register').send(payload);
      expect(res.status).toBe(409);
    });

    it('retorna 400 si el CUIT no tiene 11 dígitos', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'bad@test.com',
          password: 'securepass123',
          fullName: 'Dr. Bad',
          cuit: '123',
        });
      expect(res.status).toBe(400);
    });
  });
});
```

- [ ] **Step 2: Ejecutar test y verificar que falla**

```bash
npm run test:e2e -- --testPathPattern=auth
```

Expected: FAIL — "Cannot POST /api/auth/register"

- [ ] **Step 3: Crear `src/modules/auth/dto/register.dto.ts`**

```typescript
import { IsEmail, IsString, MinLength, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(2)
  fullName: string;

  @IsString()
  @Matches(/^\d{11}$/, { message: 'CUIT must be exactly 11 digits' })
  cuit: string;
}
```

- [ ] **Step 4: Crear `src/modules/auth/auth.service.ts`**

```typescript
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Professional } from '../professionals/professional.entity';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Professional)
    private readonly professionalsRepo: Repository<Professional>,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<{ token: string }> {
    const emailExists = await this.professionalsRepo.findOne({ where: { email: dto.email } });
    if (emailExists) throw new ConflictException('Email already registered');

    const cuitExists = await this.professionalsRepo.findOne({ where: { cuit: dto.cuit } });
    if (cuitExists) throw new ConflictException('CUIT already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const professional = this.professionalsRepo.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      cuit: dto.cuit,
    });
    const saved = await this.professionalsRepo.save(professional);
    const token = this.jwtService.sign({ sub: saved.id, email: saved.email });
    return { token };
  }
}
```

- [ ] **Step 5: Crear `src/modules/auth/auth.controller.ts`**

```typescript
import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }
}
```

- [ ] **Step 6: Crear `src/modules/auth/auth.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Professional } from '../professionals/professional.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Professional]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [JwtModule],
})
export class AuthModule {}
```

- [ ] **Step 7: Agregar AuthModule a AppModule**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import databaseConfig from './config/database.config';
import { ProfessionalsModule } from './modules/professionals/professionals.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => config.get('database'),
    }),
    ProfessionalsModule,
    AuthModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 8: Ejecutar tests — deben pasar**

```bash
npm run test:e2e -- --testPathPattern=auth
```

Expected: 3 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/modules/auth/ test/auth.e2e-spec.ts
git commit -m "feat: add auth register endpoint"
```

---

## Task 5: Auth — Login + JWT Guard

**Files:**
- Create: `src/modules/auth/dto/login.dto.ts`
- Create: `src/modules/auth/strategies/jwt.strategy.ts`
- Create: `src/common/guards/jwt-auth.guard.ts`
- Create: `src/common/decorators/current-professional.decorator.ts`
- Modify: `src/modules/auth/auth.service.ts`
- Modify: `src/modules/auth/auth.controller.ts`
- Modify: `src/modules/auth/auth.module.ts`

- [ ] **Step 1: Agregar tests de login a `test/auth.e2e-spec.ts`**

Agregar dentro del `describe('Auth (e2e)')`, después del bloque de register:
```typescript
  describe('POST /api/auth/login', () => {
    const credentials = { email: 'login@test.com', password: 'securepass123' };

    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...credentials, fullName: 'Dr. Login', cuit: '20111111111' });
    });

    it('retorna JWT para credenciales válidas', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send(credentials);
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });

    it('retorna 401 con contraseña incorrecta', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: credentials.email, password: 'wrongpassword' });
      expect(res.status).toBe(401);
    });

    it('retorna 401 con email inexistente', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@test.com', password: 'whatever' });
      expect(res.status).toBe(401);
    });
  });
```

- [ ] **Step 2: Ejecutar tests — verificar que los nuevos fallan**

```bash
npm run test:e2e -- --testPathPattern=auth
```

Expected: 3 register PASS, 3 login FAIL — "Cannot POST /api/auth/login"

- [ ] **Step 3: Crear `src/modules/auth/dto/login.dto.ts`**

```typescript
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
```

- [ ] **Step 4: Agregar método `login` a `src/modules/auth/auth.service.ts`**

Agregar el import y el método a la clase existente:
```typescript
// Agregar al bloque de imports:
import { LoginDto } from './dto/login.dto';

// Agregar método a la clase AuthService (después de register):
  async login(dto: LoginDto): Promise<{ token: string }> {
    const professional = await this.professionalsRepo
      .createQueryBuilder('p')
      .addSelect('p.passwordHash')
      .where('p.email = :email', { email: dto.email })
      .getOne();

    if (!professional) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, professional.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const token = this.jwtService.sign({ sub: professional.id, email: professional.email });
    return { token };
  }
```

- [ ] **Step 5: Agregar endpoint login a `src/modules/auth/auth.controller.ts`**

```typescript
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
```

- [ ] **Step 6: Crear `src/modules/auth/strategies/jwt.strategy.ts`**

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Professional } from '../../professionals/professional.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(Professional)
    private readonly professionalsRepo: Repository<Professional>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; email: string }): Promise<Professional> {
    const professional = await this.professionalsRepo.findOne({ where: { id: payload.sub } });
    if (!professional) throw new UnauthorizedException();
    return professional;
  }
}
```

- [ ] **Step 7: Crear `src/common/guards/jwt-auth.guard.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

- [ ] **Step 8: Crear `src/common/decorators/current-professional.decorator.ts`**

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Professional } from '../../modules/professionals/professional.entity';

export const CurrentProfessional = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Professional => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

- [ ] **Step 9: Actualizar `src/modules/auth/auth.module.ts` con PassportModule y JwtStrategy**

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Professional } from '../professionals/professional.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    TypeOrmModule.forFeature([Professional]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [JwtModule, JwtStrategy],
})
export class AuthModule {}
```

- [ ] **Step 10: Ejecutar todos los tests de auth**

```bash
npm run test:e2e -- --testPathPattern=auth
```

Expected: 6 tests PASS.

- [ ] **Step 11: Commit**

```bash
git add src/modules/auth/ src/common/
git commit -m "feat: add login endpoint and JWT guard"
```

---

## Task 6: Professionals — Endpoints de perfil

**Files:**
- Create: `src/modules/professionals/dto/update-professional.dto.ts`
- Create: `src/modules/professionals/professionals.service.ts`
- Create: `src/modules/professionals/professionals.controller.ts`
- Modify: `src/modules/professionals/professionals.module.ts`
- Create: `test/professionals.e2e-spec.ts`

- [ ] **Step 1: Escribir tests e2e que fallan**

Crear `test/professionals.e2e-spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

describe('Professionals (e2e)', () => {
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
      .send({ email: 'prof@test.com', password: 'securepass123', fullName: 'Dr. Prof', cuit: '20333333333' });
    token = res.body.token;
  });

  afterAll(async () => {
    await dataSource.query('TRUNCATE TABLE professionals CASCADE');
    await app.close();
  });

  describe('GET /api/professionals/me', () => {
    it('retorna el perfil del profesional autenticado', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/professionals/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('prof@test.com');
      expect(res.body.fullName).toBe('Dr. Prof');
      expect(res.body.passwordHash).toBeUndefined();
      expect(res.body.afipCert).toBeUndefined();
    });

    it('retorna 401 sin token', async () => {
      const res = await request(app.getHttpServer()).get('/api/professionals/me');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/professionals/me', () => {
    it('actualiza campos del perfil', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/professionals/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ puntoVenta: 1, invoiceType: 'B', whatsappNumber: '+5491112345678' });

      expect(res.status).toBe(200);
      expect(res.body.puntoVenta).toBe(1);
      expect(res.body.whatsappNumber).toBe('+5491112345678');
    });

    it('retorna 400 para invoiceType inválido', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/professionals/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ invoiceType: 'X' });
      expect(res.status).toBe(400);
    });
  });
});
```

- [ ] **Step 2: Ejecutar tests — verificar que fallan**

```bash
npm run test:e2e -- --testPathPattern=professionals
```

Expected: FAIL — "Cannot GET /api/professionals/me"

- [ ] **Step 3: Crear `src/modules/professionals/dto/update-professional.dto.ts`**

```typescript
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateProfessionalDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  puntoVenta?: number;

  @IsOptional()
  @IsEnum(['B', 'C'])
  invoiceType?: 'B' | 'C';

  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @IsOptional()
  @IsString()
  twilioPhone?: string;

  @IsOptional()
  @IsEnum(['testing', 'prod'])
  afipEnv?: 'testing' | 'prod';
}
```

- [ ] **Step 4: Crear `src/modules/professionals/professionals.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Professional } from './professional.entity';
import { UpdateProfessionalDto } from './dto/update-professional.dto';

@Injectable()
export class ProfessionalsService {
  constructor(
    @InjectRepository(Professional)
    private readonly repo: Repository<Professional>,
  ) {}

  async findById(id: string): Promise<Professional> {
    return this.repo.findOneOrFail({ where: { id } });
  }

  async update(id: string, dto: UpdateProfessionalDto): Promise<Professional> {
    await this.repo.update(id, dto);
    return this.findById(id);
  }
}
```

- [ ] **Step 5: Crear `src/modules/professionals/professionals.controller.ts`**

```typescript
import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentProfessional } from '../../common/decorators/current-professional.decorator';
import { Professional } from './professional.entity';
import { ProfessionalsService } from './professionals.service';
import { UpdateProfessionalDto } from './dto/update-professional.dto';

@Controller('professionals')
@UseGuards(JwtAuthGuard)
export class ProfessionalsController {
  constructor(private readonly professionalsService: ProfessionalsService) {}

  @Get('me')
  getMe(@CurrentProfessional() professional: Professional) {
    return professional;
  }

  @Patch('me')
  update(
    @CurrentProfessional() professional: Professional,
    @Body() dto: UpdateProfessionalDto,
  ) {
    return this.professionalsService.update(professional.id, dto);
  }
}
```

- [ ] **Step 6: Actualizar `src/modules/professionals/professionals.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Professional } from './professional.entity';
import { ProfessionalsService } from './professionals.service';
import { ProfessionalsController } from './professionals.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Professional])],
  providers: [ProfessionalsService],
  controllers: [ProfessionalsController],
  exports: [TypeOrmModule, ProfessionalsService],
})
export class ProfessionalsModule {}
```

- [ ] **Step 7: Ejecutar tests**

```bash
npm run test:e2e -- --testPathPattern=professionals
```

Expected: 4 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/modules/professionals/ test/professionals.e2e-spec.ts
git commit -m "feat: add professionals profile endpoints"
```

---

## Task 7: EncryptionService + Upload de certificados AFIP

**Files:**
- Create: `src/common/services/encryption.service.ts`
- Create: `src/modules/professionals/dto/update-afip-config.dto.ts`
- Modify: `src/modules/professionals/professionals.service.ts`
- Modify: `src/modules/professionals/professionals.controller.ts`
- Modify: `src/modules/professionals/professionals.module.ts`

- [ ] **Step 1: Agregar test de upload AFIP a `test/professionals.e2e-spec.ts`**

Agregar dentro del describe block (después de los tests de PATCH):
```typescript
  describe('POST /api/professionals/me/afip-config', () => {
    it('acepta cert y key, los almacena cifrados y no los expone en la respuesta', async () => {
      const fakeCert = Buffer.from('-----BEGIN CERTIFICATE-----\nfakecert\n-----END CERTIFICATE-----');
      const fakeKey = Buffer.from('-----BEGIN RSA PRIVATE KEY-----\nfakekey\n-----END RSA PRIVATE KEY-----');

      const res = await request(app.getHttpServer())
        .post('/api/professionals/me/afip-config')
        .set('Authorization', `Bearer ${token}`)
        .attach('cert', fakeCert, 'afip.crt')
        .attach('key', fakeKey, 'afip.key')
        .field('puntoVenta', '1')
        .field('invoiceType', 'B');

      expect(res.status).toBe(200);
      expect(res.body.puntoVenta).toBe(1);
      expect(res.body.invoiceType).toBe('B');
      expect(res.body.afipCert).toBeUndefined();
      expect(res.body.afipKey).toBeUndefined();
    });

    it('retorna 400 si faltan los archivos', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/professionals/me/afip-config')
        .set('Authorization', `Bearer ${token}`)
        .field('puntoVenta', '1')
        .field('invoiceType', 'B');
      expect(res.status).toBe(400);
    });
  });
```

- [ ] **Step 2: Ejecutar tests — verificar que los nuevos fallan**

```bash
npm run test:e2e -- --testPathPattern=professionals
```

Expected: 4 previos PASS, 2 nuevos FAIL.

- [ ] **Step 3: Crear `src/common/services/encryption.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const hex = this.configService.get<string>('ENCRYPTION_KEY');
    if (!hex || hex.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
    }
    this.key = Buffer.from(hex, 'hex');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  decrypt(encoded: string): string {
    const buf = Buffer.from(encoded, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}
```

- [ ] **Step 4: Crear `src/modules/professionals/dto/update-afip-config.dto.ts`**

```typescript
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateAfipConfigDto {
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  puntoVenta: number;

  @IsEnum(['B', 'C'])
  invoiceType: 'B' | 'C';

  @IsOptional()
  @IsEnum(['testing', 'prod'])
  afipEnv?: 'testing' | 'prod';
}
```

- [ ] **Step 5: Reemplazar `src/modules/professionals/professionals.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Professional } from './professional.entity';
import { UpdateProfessionalDto } from './dto/update-professional.dto';
import { UpdateAfipConfigDto } from './dto/update-afip-config.dto';
import { EncryptionService } from '../../common/services/encryption.service';

@Injectable()
export class ProfessionalsService {
  constructor(
    @InjectRepository(Professional)
    private readonly repo: Repository<Professional>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async findById(id: string): Promise<Professional> {
    return this.repo.findOneOrFail({ where: { id } });
  }

  async update(id: string, dto: UpdateProfessionalDto): Promise<Professional> {
    await this.repo.update(id, dto);
    return this.findById(id);
  }

  async updateAfipConfig(
    id: string,
    certBuffer: Buffer,
    keyBuffer: Buffer,
    dto: UpdateAfipConfigDto,
  ): Promise<Professional> {
    const afipCert = this.encryptionService.encrypt(certBuffer.toString('utf8'));
    const afipKey = this.encryptionService.encrypt(keyBuffer.toString('utf8'));
    await this.repo.update(id, {
      afipCert,
      afipKey,
      puntoVenta: dto.puntoVenta,
      invoiceType: dto.invoiceType,
      afipEnv: dto.afipEnv ?? 'testing',
    });
    return this.findById(id);
  }
}
```

- [ ] **Step 6: Reemplazar `src/modules/professionals/professionals.controller.ts`**

```typescript
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentProfessional } from '../../common/decorators/current-professional.decorator';
import { Professional } from './professional.entity';
import { ProfessionalsService } from './professionals.service';
import { UpdateProfessionalDto } from './dto/update-professional.dto';
import { UpdateAfipConfigDto } from './dto/update-afip-config.dto';

@Controller('professionals')
@UseGuards(JwtAuthGuard)
export class ProfessionalsController {
  constructor(private readonly professionalsService: ProfessionalsService) {}

  @Get('me')
  getMe(@CurrentProfessional() professional: Professional) {
    return professional;
  }

  @Patch('me')
  update(
    @CurrentProfessional() professional: Professional,
    @Body() dto: UpdateProfessionalDto,
  ) {
    return this.professionalsService.update(professional.id, dto);
  }

  @Post('me/afip-config')
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'cert', maxCount: 1 }, { name: 'key', maxCount: 1 }],
      { storage: undefined }, // memory storage por defecto
    ),
  )
  updateAfipConfig(
    @CurrentProfessional() professional: Professional,
    @UploadedFiles() files: { cert?: Express.Multer.File[]; key?: Express.Multer.File[] },
    @Body() dto: UpdateAfipConfigDto,
  ) {
    if (!files?.cert?.[0] || !files?.key?.[0]) {
      throw new BadRequestException('Both cert (.crt) and key (.key) files are required');
    }
    return this.professionalsService.updateAfipConfig(
      professional.id,
      files.cert[0].buffer,
      files.key[0].buffer,
      dto,
    );
  }
}
```

- [ ] **Step 7: Actualizar `src/modules/professionals/professionals.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Professional } from './professional.entity';
import { ProfessionalsService } from './professionals.service';
import { ProfessionalsController } from './professionals.controller';
import { EncryptionService } from '../../common/services/encryption.service';

@Module({
  imports: [TypeOrmModule.forFeature([Professional])],
  providers: [ProfessionalsService, EncryptionService],
  controllers: [ProfessionalsController],
  exports: [TypeOrmModule, ProfessionalsService, EncryptionService],
})
export class ProfessionalsModule {}
```

- [ ] **Step 8: Ejecutar todos los tests**

```bash
npm run test:e2e -- --testPathPattern=professionals
```

Expected: 6 tests PASS.

```bash
npm run test:e2e
```

Expected: todos los tests PASS (auth + professionals).

- [ ] **Step 9: Commit final del Plan 1**

```bash
git add src/common/services/ src/modules/professionals/
git commit -m "feat: add AFIP certificate upload with AES-256-GCM encryption"
```

---

## Verificación final del Plan 1

- [ ] **Verificar que la app completa arranca sin errores**

```bash
npm run start:dev
```

Expected: `Application is running on: http://localhost:3000`

- [ ] **Smoke test manual con curl**

```bash
# Registrar profesional
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"dr@test.com","password":"password123","fullName":"Dr. Test","cuit":"20123456789"}'

# Respuesta esperada: {"token":"eyJ..."}

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dr@test.com","password":"password123"}'

# Perfil (reemplazar TOKEN con el token real)
curl http://localhost:3000/api/professionals/me \
  -H "Authorization: Bearer TOKEN"
```

---

## Siguiente paso: Plan 2/4 — WhatsApp Bot Core

El Plan 2 cubre:
- Entities: `Patient`, `Session`, `ConsultationType`
- `PatientsModule`: CRUD de pacientes por profesional
- `WhatsAppModule`: webhook Twilio, `TwilioGateway` implementando `IWhatsAppGateway`
- `NlpModule`: integración GPT-4o-mini con extracción estructurada
- `ConversationsModule`: máquina de estados IDLE → COLLECTING → CONFIRMING → PROCESSING
