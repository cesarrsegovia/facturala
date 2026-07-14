import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ExtractedInvoice } from './dto/extracted-invoice.interface';

const SYSTEM_PROMPT = `Sos un asistente que extrae datos de facturación de mensajes en español rioplatense.
Devolvé SOLO un JSON con: patientName (string|null), amount (number|null, sin separadores de miles),
date (yyyy-mm-dd|null), consultationType (string|null), confidence ("high"|"low").
El monto puede venir como "10000", "$10000", "10.000" o "10k" — normalizalo a número.
Interpretá fechas relativas ("ayer", "hoy") respecto de la fecha actual provista; si no
mencionan fecha, usá la fecha actual.
Usá confidence "high" siempre que puedas identificar nombre y monto, aunque falte la fecha.
Solo usá "low" si el nombre o el monto son ambiguos o faltan.`;

const EMPTY_RESULT: ExtractedInvoice = {
  patientName: null,
  amount: null,
  date: null,
  consultationType: null,
  confidence: 'low',
};

/**
 * Extrae datos estructurados de facturación desde texto libre usando GPT-4o-mini.
 * Ante cualquier fallo de la API devuelve confidence "low" (el bot pide
 * reformular) en lugar de romper el flujo del webhook.
 */
@Injectable()
export class NlpService {
  private readonly logger = new Logger(NlpService.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY'),
    });
    this.model = this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';
  }

  async extractInvoiceData(
    message: string,
    currentDate: string,
  ): Promise<ExtractedInvoice> {
    let content: string;
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Fecha actual: ${currentDate}\nMensaje: ${message}`,
          },
        ],
      });
      content = completion.choices[0]?.message?.content ?? '{}';
    } catch (error) {
      this.logger.error(`OpenAI falló: ${(error as Error).message}`);
      return EMPTY_RESULT;
    }

    const result = this.parse(content);
    this.logger.log(
      `NLP mensaje="${message}" → ${JSON.stringify(result)} (raw: ${content})`,
    );
    return result;
  }

  private parse(content: string): ExtractedInvoice {
    try {
      const raw = JSON.parse(content) as Partial<ExtractedInvoice>;
      return {
        patientName: raw.patientName ?? null,
        amount: this.normalizeAmount(raw.amount),
        date: raw.date ?? null,
        consultationType: raw.consultationType ?? null,
        confidence: raw.confidence === 'high' ? 'high' : 'low',
      };
    } catch {
      this.logger.warn(`Respuesta del modelo no es JSON válido: ${content}`);
      return EMPTY_RESULT;
    }
  }

  /** El modelo a veces devuelve el monto como string ("$10.000") — lo normaliza. */
  private normalizeAmount(value: unknown): number | null {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const cleaned = Number(value.replace(/[$.\s]/g, '').replace(',', '.'));
      return Number.isFinite(cleaned) && cleaned > 0 ? cleaned : null;
    }
    return null;
  }
}
