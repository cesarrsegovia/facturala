import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { TwilioSignatureGuard } from '../src/common/guards/twilio-signature.guard';
import { WHATSAPP_GATEWAY } from '../src/common/interfaces/whatsapp-gateway.interface';
import { NlpService } from '../src/modules/nlp/nlp.service';

describe('WhatsApp webhook (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const sent: Array<{ to: string; body: string }> = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(TwilioSignatureGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(WHATSAPP_GATEWAY)
      .useValue({
        sendMessage: (to: string, body: string) => {
          sent.push({ to, body });
          return Promise.resolve();
        },
        sendDocument: () => Promise.resolve(),
      })
      .overrideProvider(NlpService)
      .useValue({
        extractInvoiceData: () =>
          Promise.resolve({
            patientName: null,
            amount: null,
            date: null,
            consultationType: null,
            confidence: 'low',
          }),
      })
      .compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    dataSource = moduleFixture.get(DataSource);

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'wa@test.com',
        password: 'securepass123',
        fullName: 'Dr. Wa',
        cuit: '20555555555',
      });
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
      .send({
        From: 'whatsapp:+5491100000000',
        To: 'whatsapp:+14155238886',
        Body: 'hola',
      });
    expect([200, 204]).toContain(res.status);
    expect(sent.length).toBeGreaterThanOrEqual(1);
  });
});
