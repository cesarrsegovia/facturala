import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

describe('Invoices (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  let invoiceId: string;

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

    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'inv@test.com',
        password: 'securepass123',
        fullName: 'Dr. Inv',
        cuit: '20666666666',
      });
    token = reg.body.token;

    await dataSource.query(
      `UPDATE professionals SET punto_venta = 1 WHERE email = 'inv@test.com'`,
    );
    const patient = await request(app.getHttpServer())
      .post('/api/patients')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'María Factura' });

    const [{ id: professionalId }] = await dataSource.query(
      `SELECT id FROM professionals WHERE email = 'inv@test.com'`,
    );
    const inserted = await dataSource.query(
      `INSERT INTO invoices
        (professional_id, patient_id, numero_comprobante, tipo, importe, fecha_servicio, cae, cae_vencimiento, status)
       VALUES ($1, $2, 42, 'B', 15000.00, '2026-06-28', '74539682547123', '2026-07-08', 'EMITTED')
       RETURNING id`,
      [professionalId, patient.body.id],
    );
    invoiceId = inserted[0].id;
  });

  afterAll(async () => {
    await dataSource.query('TRUNCATE TABLE invoices CASCADE');
    await dataSource.query('TRUNCATE TABLE patients CASCADE');
    await dataSource.query('TRUNCATE TABLE professionals CASCADE');
    await app.close();
  });

  it('lista las facturas del profesional con su paciente', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/invoices')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].cae).toBe('74539682547123');
    expect(res.body[0].patient.fullName).toBe('María Factura');
  });

  it('filtra por status', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/invoices?status=PENDING')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('descarga el PDF regenerado (dashboard, JWT)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/invoices/${invoiceId}/pdf`)
      .set('Authorization', `Bearer ${token}`)
      .buffer()
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('rechaza el link público con token inválido', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/invoices/${invoiceId}/public-pdf?token=invalido`,
    );
    expect(res.status).toBe(401);
  });

  it('retorna 401 sin token en el listado', async () => {
    const res = await request(app.getHttpServer()).get('/api/invoices');
    expect(res.status).toBe(401);
  });
});
