import { Inject, Injectable } from '@nestjs/common';
import { SessionsService } from '../sessions/sessions.service';
import { NlpService } from '../nlp/nlp.service';
import { PatientsService } from '../patients/patients.service';
import { WHATSAPP_GATEWAY } from '../../common/interfaces/whatsapp-gateway.interface';
import type { IWhatsAppGateway } from '../../common/interfaces/whatsapp-gateway.interface';
import { INVOICE_EMITTER } from '../../common/interfaces/invoice-emitter.interface';
import type { IInvoiceEmitter } from '../../common/interfaces/invoice-emitter.interface';
import { Session } from '../sessions/session.entity';

const AFFIRMATIVE = ['si', 'sí', 'dale', 'ok', 'confirmo'];

interface InvoiceContext {
  patientId: string;
  patientName: string;
  amount: number;
  date: string;
}

/**
 * Orquesta la conversación de facturación con una máquina de estados
 * IDLE → COLLECTING → CONFIRMING → PROCESSING → IDLE.
 * Delega en servicios puros (NLP, pacientes, gateway, emisor).
 */
@Injectable()
export class ConversationService {
  constructor(
    private readonly sessions: SessionsService,
    private readonly nlp: NlpService,
    private readonly patients: PatientsService,
    @Inject(WHATSAPP_GATEWAY) private readonly whatsapp: IWhatsAppGateway,
    @Inject(INVOICE_EMITTER) private readonly emitter: IInvoiceEmitter,
  ) {}

  async handleMessage(
    professionalId: string,
    patientPhone: string,
    text: string,
    currentDate: string,
  ): Promise<void> {
    const session = await this.sessions.getOrCreate(professionalId, patientPhone);
    const normalized = text.trim().toLowerCase();

    if (normalized === '/cancelar') {
      await this.sessions.reset(session.id);
      await this.whatsapp.sendMessage(patientPhone, 'Listo, cancelé la operación. 👍');
      return;
    }

    if (session.state === 'CONFIRMING') {
      await this.handleConfirmation(session, patientPhone, normalized);
      return;
    }

    await this.startCollection(session, professionalId, patientPhone, text, currentDate);
  }

  private async startCollection(
    session: Session,
    professionalId: string,
    patientPhone: string,
    text: string,
    currentDate: string,
  ): Promise<void> {
    const extracted = await this.nlp.extractInvoiceData(text, currentDate);

    if (extracted.confidence === 'low' || !extracted.patientName || !extracted.amount) {
      await this.whatsapp.sendMessage(
        patientPhone,
        'No pude entender bien. Probá: "facturale a [nombre], $[monto]".',
      );
      return;
    }

    const patient = await this.patients.findByName(professionalId, extracted.patientName);
    if (!patient) {
      await this.whatsapp.sendMessage(
        patientPhone,
        `No encontré a "${extracted.patientName}". Agregalo desde el panel o pasame su DNI.`,
      );
      return;
    }

    const context: InvoiceContext = {
      patientId: patient.id,
      patientName: patient.fullName,
      amount: extracted.amount,
      date: extracted.date ?? currentDate,
    };
    await this.sessions.update(session.id, 'CONFIRMING', { ...context });
    await this.whatsapp.sendMessage(patientPhone, this.confirmationText(context));
  }

  private async handleConfirmation(
    session: Session,
    patientPhone: string,
    normalized: string,
  ): Promise<void> {
    if (!AFFIRMATIVE.includes(normalized)) {
      await this.sessions.reset(session.id);
      await this.whatsapp.sendMessage(
        patientPhone,
        'Ok, no emito nada. Escribime cuando quieras. 👍',
      );
      return;
    }

    await this.whatsapp.sendMessage(patientPhone, '⏳ Emitiendo la factura...');
    const ctx = session.context as unknown as InvoiceContext;

    try {
      const result = await this.emitter.emit({
        professionalId: session.professionalId,
        patientId: ctx.patientId,
        amount: ctx.amount,
        serviceDate: ctx.date,
      });
      await this.sessions.reset(session.id);

      if (result.status === 'PENDING') {
        await this.whatsapp.sendMessage(
          patientPhone,
          '⚠️ AFIP no está disponible ahora. Guardé la factura y la emito automáticamente apenas vuelva.',
        );
        return;
      }

      await this.whatsapp.sendMessage(
        patientPhone,
        `✅ Factura emitida\nN° ${result.numeroComprobante}\nCAE: ${result.cae}\nVence: ${result.caeVencimiento}`,
      );
      if (result.pdfUrl) {
        await this.whatsapp.sendDocument(patientPhone, result.pdfUrl, 'Tu factura 👇');
      }
    } catch (error) {
      await this.sessions.reset(session.id);
      await this.whatsapp.sendMessage(
        patientPhone,
        `❌ No pude emitir la factura: ${(error as Error).message}`,
      );
    }
  }

  private confirmationText(ctx: InvoiceContext): string {
    return [
      'Confirmá antes de emitir:',
      `👤 Paciente: ${ctx.patientName}`,
      `📅 Fecha: ${ctx.date}`,
      `💰 Importe: $${ctx.amount}`,
      '¿Emito la factura? Respondé *sí* o *no*',
    ].join('\n');
  }
}
