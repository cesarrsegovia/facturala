import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
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
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
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
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(payload);
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(payload);
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
});
