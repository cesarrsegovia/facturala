import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { NlpModule } from '../nlp/nlp.module';
import { PatientsModule } from '../patients/patients.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { InvoicesService } from '../invoices/invoices.service';
import { ConversationService } from './conversation.service';
import { TwilioGateway } from '../whatsapp/twilio.gateway';
import { INVOICE_EMITTER } from '../../common/interfaces/invoice-emitter.interface';
import { WHATSAPP_GATEWAY } from '../../common/interfaces/whatsapp-gateway.interface';

@Module({
  imports: [SessionsModule, NlpModule, PatientsModule, InvoicesModule],
  providers: [
    ConversationService,
    { provide: INVOICE_EMITTER, useExisting: InvoicesService },
    { provide: WHATSAPP_GATEWAY, useClass: TwilioGateway },
  ],
  exports: [ConversationService, WHATSAPP_GATEWAY],
})
export class ConversationsModule {}
