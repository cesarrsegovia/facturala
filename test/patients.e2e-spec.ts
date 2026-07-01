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
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    dataSource = moduleFixture.get(DataSource);
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'pat-owner@test.com',
        password: 'securepass123',
        fullName: 'Dr. Owner',
        cuit: '20444444444',
      });
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
