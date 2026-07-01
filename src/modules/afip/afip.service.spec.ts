import { AfipService, AfipUnavailableError } from './afip.service';

const mockGetLastVoucher = jest.fn();
const mockCreateVoucher = jest.fn();
jest.mock('@afipsdk/afip.js', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    ElectronicBilling: {
      getLastVoucher: (...args: unknown[]) => mockGetLastVoucher(...args),
      createVoucher: (...args: unknown[]) => mockCreateVoucher(...args),
    },
  })),
}));

describe('AfipService', () => {
  let service: AfipService;

  const baseInput = {
    cuit: '20123456789',
    cert: 'CERT_PEM',
    key: 'KEY_PEM',
    production: false,
    puntoVenta: 1,
    tipo: 'B' as const,
    amount: 15000,
    serviceDate: '2026-06-28',
  };

  beforeEach(() => {
    const configStub = { get: () => undefined } as never;
    service = new AfipService(configStub);
    mockGetLastVoucher.mockReset();
    mockCreateVoucher.mockReset();
    // sin esperas reales en los tests de retry
    jest
      .spyOn(
        service as unknown as { sleep: (ms: number) => Promise<void> },
        'sleep',
      )
      .mockResolvedValue(undefined);
  });

  it('emite el comprobante siguiente al último (Factura B → CbteTipo 6)', async () => {
    mockGetLastVoucher.mockResolvedValue(41);
    mockCreateVoucher.mockResolvedValue({ CAE: '74539682547123', CAEFchVto: '2026-07-08' });

    const result = await service.emitVoucher(baseInput);

    expect(mockGetLastVoucher).toHaveBeenCalledWith(1, 6);
    expect(mockCreateVoucher).toHaveBeenCalledWith(
      expect.objectContaining({
        CbteTipo: 6,
        CbteDesde: 42,
        CbteHasta: 42,
        Concepto: 2,
        ImpTotal: 15000,
        FchServDesde: 20260628,
      }),
    );
    expect(result).toEqual({
      cae: '74539682547123',
      caeVencimiento: '2026-07-08',
      numeroComprobante: 42,
    });
  });

  it('Factura C usa CbteTipo 11', async () => {
    mockGetLastVoucher.mockResolvedValue(0);
    mockCreateVoucher.mockResolvedValue({ CAE: 'X', CAEFchVto: '2026-07-08' });

    await service.emitVoucher({ ...baseInput, tipo: 'C' });
    expect(mockGetLastVoucher).toHaveBeenCalledWith(1, 11);
  });

  it('reintenta timeouts y lanza AfipUnavailableError al agotar', async () => {
    mockGetLastVoucher.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(service.emitVoucher(baseInput)).rejects.toBeInstanceOf(
      AfipUnavailableError,
    );
    expect(mockGetLastVoucher).toHaveBeenCalledTimes(3); // 1 + 2 reintentos
  });

  it('propaga errores de negocio sin reintentar', async () => {
    mockGetLastVoucher.mockResolvedValue(1);
    mockCreateVoucher.mockRejectedValue(new Error('(10016) Certificado invalido'));

    await expect(service.emitVoucher(baseInput)).rejects.toThrow('10016');
    expect(mockCreateVoucher).toHaveBeenCalledTimes(1);
  });
});
