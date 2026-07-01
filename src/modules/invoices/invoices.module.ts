import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from './invoice.entity';
import { Professional } from '../professionals/professional.entity';
import { Patient } from '../patients/patient.entity';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesCron } from './invoices.cron';
import { AfipModule } from '../afip/afip.module';
import { PdfModule } from '../pdf/pdf.module';
import { AuthModule } from '../auth/auth.module'; // exporta JwtModule
import { EncryptionService } from '../../common/services/encryption.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invoice, Professional, Patient]),
    AfipModule,
    PdfModule,
    AuthModule,
  ],
  providers: [InvoicesService, InvoicesCron, EncryptionService],
  controllers: [InvoicesController],
  exports: [InvoicesService],
})
export class InvoicesModule {}
