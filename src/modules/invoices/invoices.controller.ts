import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentProfessional } from '../../common/decorators/current-professional.decorator';
import { Professional } from '../professionals/professional.entity';
import { InvoicesService } from './invoices.service';
import { Invoice } from './invoice.entity';
import type { InvoiceStatus } from './invoice.entity';
import { EmitInvoiceDto } from './dto/emit-invoice.dto';
import type { EmittedInvoice } from '../../common/interfaces/invoice-emitter.interface';

@ApiTags('Invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Historial de facturas del profesional' })
  @ApiQuery({ name: 'status', required: false, enum: ['EMITTED', 'PENDING', 'FAILED'] })
  findAll(
    @CurrentProfessional() pro: Professional,
    @Query('status') status?: InvoiceStatus,
  ): Promise<Invoice[]> {
    return this.invoicesService.findAll(pro.id, status);
  }

  @Post('emit')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Emite una factura manualmente (panel / prueba en homologación)' })
  @ApiResponse({ status: 201, description: 'Factura emitida (o PENDING si AFIP no responde)' })
  @ApiResponse({ status: 400, description: 'AFIP no configurado o datos inválidos' })
  emitManually(
    @CurrentProfessional() pro: Professional,
    @Body() dto: EmitInvoiceDto,
  ): Promise<EmittedInvoice> {
    return this.invoicesService.emit({
      professionalId: pro.id,
      patientId: dto.patientId,
      amount: dto.amount,
      serviceDate: dto.serviceDate,
    });
  }

  @Get(':id/pdf')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Descarga el PDF del comprobante (dashboard)' })
  @ApiResponse({ status: 200, description: 'PDF del comprobante' })
  async downloadPdf(
    @CurrentProfessional() pro: Professional,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const invoice = await this.invoicesService.findOne(pro.id, id);
    await this.sendPdf(res, invoice.id, await this.invoicesService.buildPdf(invoice));
  }

  @Get(':id/public-pdf')
  @ApiOperation({ summary: 'PDF vía link firmado (mediaUrl de WhatsApp)' })
  @ApiQuery({ name: 'token', required: true })
  async publicPdf(
    @Param('id') id: string,
    @Query('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const invoice = await this.invoicesService.findByPdfToken(id, token ?? '');
    await this.sendPdf(res, invoice.id, await this.invoicesService.buildPdf(invoice));
  }

  private sendPdf(res: Response, id: string, pdf: Buffer): void {
    res
      .type('application/pdf')
      .setHeader('Content-Disposition', `inline; filename="factura-${id}.pdf"`)
      .send(pdf);
  }
}
