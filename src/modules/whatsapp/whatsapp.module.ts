import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationsModule } from '../conversations/conversations.module';
import { Professional } from '../professionals/professional.entity';
import { WhatsAppController } from './whatsapp.controller';

@Module({
  imports: [ConversationsModule, TypeOrmModule.forFeature([Professional])],
  controllers: [WhatsAppController],
})
export class WhatsAppModule {}
