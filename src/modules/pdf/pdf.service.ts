import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

export interface InvoicePdfData {
  professionalName: string;
  professionalCuit: string;
  tipo: 'B' | 'C';
  puntoVenta: number;
  numeroComprobante: number;
  patientName: string;
  fechaServicio: string;
  importe: number;
  cae: string;
  caeVencimiento: string;
}

/**
 * Genera el PDF del comprobante en memoria (Buffer). Sin filesystem:
 * Railway no tiene volúmenes persistentes, el PDF se regenera bajo demanda.
 */
@Injectable()
export class PdfService {
  generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.renderInvoice(doc, data);
      doc.end();
    });
  }

  private renderInvoice(doc: PDFKit.PDFDocument, data: InvoicePdfData): void {
    const numero = `${String(data.puntoVenta).padStart(5, '0')}-${String(
      data.numeroComprobante,
    ).padStart(8, '0')}`;

    doc.fontSize(20).text(`FACTURA ${data.tipo}`, { align: 'center' });
    doc.fontSize(12).text(`N° ${numero}`, { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(11);
    doc.text(`Emisor: ${data.professionalName}`);
    doc.text(`CUIT: ${data.professionalCuit}`);
    doc.moveDown();

    doc.text(`Cliente: ${data.patientName}`);
    doc.text(`Fecha del servicio: ${data.fechaServicio}`);
    doc.moveDown();

    doc.fontSize(14).text(`TOTAL: $${data.importe.toFixed(2)}`, { align: 'right' });
    doc.moveDown(2);

    doc.fontSize(10);
    doc.text(`CAE: ${data.cae}`);
    doc.text(`Vencimiento CAE: ${data.caeVencimiento}`);
  }
}
