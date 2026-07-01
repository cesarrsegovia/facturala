import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ExtractedInvoice } from './dto/extracted-invoice.interface';

const SYSTEM_PROMPT = `Sos un asistente que extrae datos de facturación de mensajes en español rioplatense.
Devolvé SOLO un JSON con: patientName (string|null), amount (number|null, sin separadores de miles),
date (yyyy-mm-dd|null), consultationType (string|null), confidence ("high"|"low").
Interpretá fechas relativas ("ayer", "hoy") respecto de la fecha actual provista.
Si falta algún dato clave (nombre o monto), usá confidence "low".`;

/**
 * Extrae datos estructurados de facturación desde texto libre usando GPT-4o-mini.
 */
@Injectable()
export class NlpService {
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
    const completion = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Fecha actual: ${currentDate}\nMensaje: ${message}` },
      ],
    });
    const content = completion.choices[0]?.message?.content ?? '{}';
    return this.parse(content);
  }

  private parse(content: string): ExtractedInvoice {
    try {
      const raw = JSON.parse(content) as Partial<ExtractedInvoice>;
      return {
        patientName: raw.patientName ?? null,
        amount: typeof raw.amount === 'number' ? raw.amount : null,
        date: raw.date ?? null,
        consultationType: raw.consultationType ?? null,
        confidence: raw.confidence === 'high' ? 'high' : 'low',
      };
    } catch {
      return {
        patientName: null,
        amount: null,
        date: null,
        consultationType: null,
        confidence: 'low',
      };
    }
  }
}
