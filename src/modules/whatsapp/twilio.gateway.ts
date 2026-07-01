import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';
import { IWhatsAppGateway } from '../../common/interfaces/whatsapp-gateway.interface';

/**
 * Implementación de IWhatsAppGateway sobre Twilio WhatsApp.
 */
@Injectable()
export class TwilioGateway implements IWhatsAppGateway {
  private readonly client: Twilio;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.client = new Twilio(
      this.config.getOrThrow<string>('TWILIO_ACCOUNT_SID'),
      this.config.getOrThrow<string>('TWILIO_AUTH_TOKEN'),
    );
    this.from = this.config.getOrThrow<string>('TWILIO_WHATSAPP_FROM');
  }

  async sendMessage(to: string, body: string): Promise<void> {
    await this.client.messages.create({
      from: this.from,
      to: this.normalize(to),
      body,
    });
  }

  async sendDocument(
    to: string,
    mediaUrl: string,
    caption?: string,
  ): Promise<void> {
    await this.client.messages.create({
      from: this.from,
      to: this.normalize(to),
      body: caption,
      mediaUrl: [mediaUrl],
    });
  }

  private normalize(to: string): string {
    return to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  }
}
