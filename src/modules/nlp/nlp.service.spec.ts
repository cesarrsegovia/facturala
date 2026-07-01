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

    const result = await service.extractInvoiceData(
      'facturale a María García consulta de ayer 15000',
      '2026-06-29',
    );
    expect(result.patientName).toBe('María García');
    expect(result.amount).toBe(15000);
    expect(result.confidence).toBe('high');
  });

  it('devuelve confidence low si el modelo no puede extraer', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              patientName: null,
              amount: null,
              date: null,
              consultationType: null,
              confidence: 'low',
            }),
          },
        },
      ],
    });
    const result = await service.extractInvoiceData('hola', '2026-06-29');
    expect(result.confidence).toBe('low');
  });
});
