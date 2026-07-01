import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InvoicesService } from './invoices.service';

/**
 * Reintenta cada 15 minutos las facturas PENDING (AFIP estaba caído al emitir).
 */
@Injectable()
export class InvoicesCron {
  private readonly logger = new Logger(InvoicesCron.name);

  constructor(private readonly invoices: InvoicesService) {}

  @Cron('0 */15 * * * *') // cada 15 minutos
  async retryPendingInvoices(): Promise<void> {
    try {
      const emitted = await this.invoices.retryPending();
      if (emitted) this.logger.log(`Facturas PENDING emitidas: ${emitted}`);
    } catch (error) {
      this.logger.error(`Error reintentando PENDING: ${(error as Error).message}`);
    }
  }
}
