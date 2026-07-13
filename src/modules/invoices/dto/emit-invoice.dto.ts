import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsString, IsUUID, Matches } from 'class-validator';

/**
 * Emisión manual desde el panel (página de prueba y facturación directa).
 */
export class EmitInvoiceDto {
  @ApiProperty({ description: 'ID del paciente' })
  @IsUUID()
  patientId: string;

  @ApiProperty({ example: 15000 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ example: '2026-06-28', description: 'Fecha del servicio (yyyy-mm-dd)' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'serviceDate must be yyyy-mm-dd' })
  serviceDate: string;
}
