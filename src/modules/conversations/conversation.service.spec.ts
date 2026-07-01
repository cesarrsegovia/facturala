import { Test } from '@nestjs/testing';
import { ConversationService } from './conversation.service';
import { SessionsService } from '../sessions/sessions.service';
import { NlpService } from '../nlp/nlp.service';
import { PatientsService } from '../patients/patients.service';
import { WHATSAPP_GATEWAY } from '../../common/interfaces/whatsapp-gateway.interface';
import { INVOICE_EMITTER } from '../../common/interfaces/invoice-emitter.interface';

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('ConversationService', () => {
  let service: ConversationService;
  const send = jest.fn();
  const emit = jest.fn();
  let sessionState: any;

  const sessions = {
    getOrCreate: jest.fn(async () => sessionState),
    update: jest.fn(async (_id: string, state: string, context: any) => {
      sessionState = { ...sessionState, state, context };
      return sessionState;
    }),
    reset: jest.fn(async () => {
      sessionState = { ...sessionState, state: 'IDLE', context: {} };
      return sessionState;
    }),
  };
  const nlp = { extractInvoiceData: jest.fn() };
  const patients = { findByName: jest.fn() };

  beforeEach(async () => {
    send.mockReset();
    emit.mockReset();
    sessionState = {
      id: 's1',
      professionalId: 'p1',
      patientPhone: '+549111',
      state: 'IDLE',
      context: {},
    };
    sessions.getOrCreate.mockClear();
    sessions.update.mockClear();
    sessions.reset.mockClear();
    nlp.extractInvoiceData.mockReset();
    patients.findByName.mockReset();
    emit.mockResolvedValue({
      status: 'EMITTED',
      invoiceId: 'inv1',
      cae: '123',
      caeVencimiento: '2026-07-08',
      numeroComprobante: 42,
      pdfUrl: 'http://localhost:3000/api/invoices/inv1/public-pdf?token=x',
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        ConversationService,
        { provide: SessionsService, useValue: sessions },
        { provide: NlpService, useValue: nlp },
        { provide: PatientsService, useValue: patients },
        {
          provide: WHATSAPP_GATEWAY,
          useValue: { sendMessage: send, sendDocument: jest.fn() },
        },
        { provide: INVOICE_EMITTER, useValue: { emit } },
      ],
    }).compile();
    service = moduleRef.get(ConversationService);
  });

  it('desde IDLE con datos claros pasa a CONFIRMING y pide confirmación', async () => {
    nlp.extractInvoiceData.mockResolvedValue({
      patientName: 'María García',
      amount: 15000,
      date: '2026-06-28',
      consultationType: 'consulta',
      confidence: 'high',
    });
    patients.findByName.mockResolvedValue({ id: 'pat1', fullName: 'María García' });

    await service.handleMessage('p1', '+549111', 'facturale a María García 15000', '2026-06-29');

    expect(sessions.update).toHaveBeenCalledWith(
      's1',
      'CONFIRMING',
      expect.objectContaining({ patientId: 'pat1', amount: 15000 }),
    );
    expect(send).toHaveBeenCalledWith('+549111', expect.stringContaining('Confirmá'));
  });

  it('en CONFIRMING con "sí" emite y vuelve a IDLE', async () => {
    sessionState = {
      id: 's1',
      professionalId: 'p1',
      patientPhone: '+549111',
      state: 'CONFIRMING',
      context: { patientId: 'pat1', patientName: 'María García', amount: 15000, date: '2026-06-28' },
    };
    await service.handleMessage('p1', '+549111', 'sí', '2026-06-29');
    expect(emit).toHaveBeenCalled();
    expect(sessions.reset).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('+549111', expect.stringContaining('CAE'));
  });

  it('desconoce al paciente y ofrece agregarlo', async () => {
    nlp.extractInvoiceData.mockResolvedValue({
      patientName: 'Desconocido',
      amount: 15000,
      date: '2026-06-28',
      consultationType: null,
      confidence: 'high',
    });
    patients.findByName.mockResolvedValue(null);
    await service.handleMessage('p1', '+549111', 'facturale a Desconocido 15000', '2026-06-29');
    expect(send).toHaveBeenCalledWith('+549111', expect.stringContaining('No encontré'));
    expect(sessions.update).not.toHaveBeenCalled();
  });

  it('si AFIP está caído (PENDING) avisa que se reintentará', async () => {
    sessionState = {
      id: 's1',
      professionalId: 'p1',
      patientPhone: '+549111',
      state: 'CONFIRMING',
      context: { patientId: 'pat1', patientName: 'María García', amount: 15000, date: '2026-06-28' },
    };
    emit.mockResolvedValue({ status: 'PENDING', invoiceId: 'inv1' });

    await service.handleMessage('p1', '+549111', 'sí', '2026-06-29');

    expect(sessions.reset).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('+549111', expect.stringContaining('AFIP'));
  });

  it('si la emisión falla, informa el error y resetea', async () => {
    sessionState = {
      id: 's1',
      professionalId: 'p1',
      patientPhone: '+549111',
      state: 'CONFIRMING',
      context: { patientId: 'pat1', patientName: 'María García', amount: 15000, date: '2026-06-28' },
    };
    emit.mockRejectedValue(new Error('AFIP no está configurado'));

    await service.handleMessage('p1', '+549111', 'sí', '2026-06-29');

    expect(sessions.reset).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('+549111', expect.stringContaining('No pude emitir'));
  });

  it('"/cancelar" resetea a IDLE', async () => {
    sessionState.state = 'CONFIRMING';
    await service.handleMessage('p1', '+549111', '/cancelar', '2026-06-29');
    expect(sessions.reset).toHaveBeenCalled();
  });
});
