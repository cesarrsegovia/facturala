import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice, InvoiceStatus } from './invoice.entity';
import { Professional } from '../professionals/professional.entity';
import { Patient } from '../patients/patient.entity';
import { AfipService, AfipUnavailableError } from '../afip/afip.service';
import { PdfService } from '../pdf/pdf.service';
import { EncryptionService } from '../../common/services/encryption.service';
import type {
  EmitInvoiceInput,
  EmittedInvoice,
  IInvoiceEmitter,
} from '../../common/interfaces/invoice-emitter.interface';

const PDF_TOKEN_PURPOSE = 'pdf';

/**
 * Orquesta la emisión de facturas: descifra credenciales, llama a AFIP,
 * persiste el resultado y expone la lectura + regeneración de PDFs.
 * Si AFIP no responde, la factura queda PENDING y el cron la reintenta.
 */
@Injectable()
export class InvoicesService implements IInvoiceEmitter {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    @InjectRepository(Invoice)
    private readonly invoicesRepo: Repository<Invoice>,
    @InjectRepository(Professional)
    private readonly professionalsRepo: Repository<Professional>,
    @InjectRepository(Patient)
    private readonly patientsRepo: Repository<Patient>,
    private readonly afip: AfipService,
    private readonly pdf: PdfService,
    private readonly encryption: EncryptionService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async emit(input: EmitInvoiceInput): Promise<EmittedInvoice> {
    const professional = await this.loadProfessionalWithSecrets(
      input.professionalId,
    );

    const invoice = await this.invoicesRepo.save(
      this.invoicesRepo.create({
        professionalId: input.professionalId,
        patientId: input.patientId,
        tipo: professional.invoiceType,
        importe: input.amount.toFixed(2),
        fechaServicio: input.serviceDate,
        status: 'PENDING',
      }),
    );

    return this.tryEmitAgainstAfip(invoice, professional);
  }

  /** Reintenta todas las facturas PENDING. Llamado por el cron cada 15 min. */
  async retryPending(): Promise<number> {
    const pending = await this.invoicesRepo.find({
      where: { status: 'PENDING' },
    });
    let emitted = 0;
    for (const invoice of pending) {
      const professional = await this.loadProfessionalWithSecrets(
        invoice.professionalId,
      );
      const result = await this.tryEmitAgainstAfip(invoice, professional);
      if (result.status === 'EMITTED') emitted++;
    }
    return emitted;
  }

  findAll(professionalId: string, status?: InvoiceStatus): Promise<Invoice[]> {
    return this.invoicesRepo.find({
      where: { professionalId, ...(status ? { status } : {}) },
      relations: { patient: true },
      order: { emittedAt: 'DESC' },
    });
  }

  async findOne(professionalId: string, id: string): Promise<Invoice> {
    const invoice = await this.invoicesRepo.findOne({
      where: { id, professionalId },
      relations: { patient: true, professional: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  /** Regenera el PDF del comprobante desde los datos persistidos. */
  async buildPdf(invoice: Invoice): Promise<Buffer> {
    return this.pdf.generateInvoicePdf({
      professionalName: invoice.professional.fullName,
      professionalCuit: invoice.professional.cuit,
      tipo: invoice.tipo,
      puntoVenta: invoice.professional.puntoVenta,
      numeroComprobante: invoice.numeroComprobante,
      patientName: invoice.patient.fullName,
      fechaServicio: invoice.fechaServicio,
      importe: Number(invoice.importe),
      cae: invoice.cae,
      caeVencimiento: invoice.caeVencimiento,
    });
  }

  /** Busca la factura referida por un token firmado de PDF (link público de WhatsApp). */
  async findByPdfToken(id: string, token: string): Promise<Invoice> {
    let payload: { sub: string; purpose: string };
    try {
      payload = this.jwt.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid PDF token');
    }
    if (payload.purpose !== PDF_TOKEN_PURPOSE || payload.sub !== id) {
      throw new UnauthorizedException('Invalid PDF token');
    }
    const invoice = await this.invoicesRepo.findOne({
      where: { id },
      relations: { patient: true, professional: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  private async tryEmitAgainstAfip(
    invoice: Invoice,
    professional: Professional,
  ): Promise<EmittedInvoice> {
    try {
      const result = await this.afip.emitVoucher({
        cuit: professional.cuit,
        cert: this.encryption.decrypt(professional.afipCert),
        key: this.encryption.decrypt(professional.afipKey),
        production: professional.afipEnv === 'prod',
        puntoVenta: professional.puntoVenta,
        tipo: professional.invoiceType,
        amount: Number(invoice.importe),
        serviceDate: invoice.fechaServicio,
      });

      await this.invoicesRepo.update(invoice.id, {
        status: 'EMITTED',
        cae: result.cae,
        caeVencimiento: result.caeVencimiento,
        numeroComprobante: result.numeroComprobante,
      });

      return {
        status: 'EMITTED',
        invoiceId: invoice.id,
        ...result,
        pdfUrl: this.buildPublicPdfUrl(invoice.id),
      };
    } catch (error) {
      if (error instanceof AfipUnavailableError) {
        this.logger.warn(`AFIP caído, factura ${invoice.id} queda PENDING`);
        return { status: 'PENDING', invoiceId: invoice.id };
      }
      await this.invoicesRepo.update(invoice.id, { status: 'FAILED' });
      throw error;
    }
  }

  private async loadProfessionalWithSecrets(id: string): Promise<Professional> {
    const professional = await this.professionalsRepo
      .createQueryBuilder('p')
      .addSelect(['p.afipCert', 'p.afipKey'])
      .where('p.id = :id', { id })
      .getOne();
    if (!professional) throw new NotFoundException('Professional not found');
    if (!professional.afipCert || !professional.afipKey || !professional.puntoVenta) {
      throw new BadRequestException(
        'AFIP no está configurado: subí certificado, clave y punto de venta desde el panel',
      );
    }
    return professional;
  }

  private buildPublicPdfUrl(invoiceId: string): string {
    const baseUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:3000';
    const token = this.jwt.sign(
      { sub: invoiceId, purpose: PDF_TOKEN_PURPOSE },
      { expiresIn: '7d' },
    );
    return `${baseUrl}/api/invoices/${invoiceId}/public-pdf?token=${token}`;
  }
}
