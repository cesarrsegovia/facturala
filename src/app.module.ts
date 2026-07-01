import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import databaseConfig from './config/database.config';
import { ProfessionalsModule } from './modules/professionals/professionals.module';
import { AuthModule } from './modules/auth/auth.module';
import { PatientsModule } from './modules/patients/patients.module';
import { ConsultationTypesModule } from './modules/consultation-types/consultation-types.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { NlpModule } from './modules/nlp/nlp.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { InvoicesModule } from './modules/invoices/invoices.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.getOrThrow<TypeOrmModuleOptions>('database'),
    }),
    ProfessionalsModule,
    AuthModule,
    PatientsModule,
    ConsultationTypesModule,
    SessionsModule,
    NlpModule,
    ConversationsModule,
    WhatsAppModule,
    InvoicesModule,
  ],
})
export class AppModule {}
