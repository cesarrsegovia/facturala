import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TwilioSignatureGuard } from '../../common/guards/twilio-signature.guard';
import { ConversationService } from '../conversations/conversation.service';
import { Professional } from '../professionals/professional.entity';

interface TwilioWebhookBody {
  From: string;
  To: string;
  Body: string;
}

/**
 * Recibe webhooks de Twilio WhatsApp. Identifica al profesional por el número `To`
 * y delega en ConversationService. No contiene lógica de negocio.
 */
@ApiExcludeController()
@Controller('webhook')
export class WhatsAppController {
  constructor(
    private readonly conversations: ConversationService,
    @InjectRepository(Professional)
    private readonly professionalsRepo: Repository<Professional>,
  ) {}

  @Post('whatsapp')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(TwilioSignatureGuard)
  async handle(@Body() body: TwilioWebhookBody): Promise<void> {
    const professional = await this.professionalsRepo.findOne({
      where: { twilioPhone: body.To },
    });
    if (!professional) return; // número no asociado a ningún profesional

    const currentDate = new Date().toISOString().slice(0, 10);
    await this.conversations.handleMessage(
      professional.id,
      body.From,
      body.Body,
      currentDate,
    );
  }
}
