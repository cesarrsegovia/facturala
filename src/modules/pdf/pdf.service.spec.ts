import { PdfService } from './pdf.service';

describe('PdfService', () => {
  it('genera un Buffer PDF válido con los datos del comprobante', async () => {
    const service = new PdfService();
    const buffer = await service.generateInvoicePdf({
      professionalName: 'Dr. Juan García',
      professionalCuit: '20123456789',
      tipo: 'B',
      puntoVenta: 1,
      numeroComprobante: 42,
      patientName: 'María García',
      fechaServicio: '2026-06-28',
      importe: 15000,
      cae: '74539682547123',
      caeVencimiento: '2026-07-08',
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });
});
