import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
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
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    dataSource = moduleFixture.get(DataSource);

    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'prof@test.com',
        password: 'securepass123',
        fullName: 'Dr. Prof',
        cuit: '20333333333',
      });
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
      const res = await request(app.getHttpServer()).get(
        '/api/professionals/me',
      );
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

  describe('POST /api/professionals/me/afip-config', () => {
    it('acepta cert y key, los almacena cifrados y no los expone', async () => {
      const fakeCert = Buffer.from(
        '-----BEGIN CERTIFICATE-----\nfakecert\n-----END CERTIFICATE-----',
      );
      const fakeKey = Buffer.from(
        '-----BEGIN RSA PRIVATE KEY-----\nfakekey\n-----END RSA PRIVATE KEY-----',
      );

      const res = await request(app.getHttpServer())
        .post('/api/professionals/me/afip-config')
        .set('Authorization', `Bearer ${token}`)
        .attach('cert', fakeCert, 'afip.crt')
        .attach('key', fakeKey, 'afip.key')
        .field('puntoVenta', '1')
        .field('invoiceType', 'B');

      expect(res.status).toBe(201);
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
});
