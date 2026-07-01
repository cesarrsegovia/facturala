import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Campos editables del perfil del profesional. Todos opcionales:
 * se actualiza solo lo que venga en el request.
 */
export class UpdateProfessionalDto {
  @ApiPropertyOptional({ example: 1, description: 'Punto de venta AFIP' })
  @IsOptional()
  @IsInt()
  @Min(1)
  puntoVenta?: number;

  @ApiPropertyOptional({ enum: ['B', 'C'], description: 'Tipo de factura' })
  @IsOptional()
  @IsEnum(['B', 'C'])
  invoiceType?: 'B' | 'C';

  @ApiPropertyOptional({ example: '+5491112345678' })
  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @ApiPropertyOptional({ example: 'whatsapp:+14155238886' })
  @IsOptional()
  @IsString()
  twilioPhone?: string;

  @ApiPropertyOptional({ enum: ['testing', 'prod'] })
  @IsOptional()
  @IsEnum(['testing', 'prod'])
  afipEnv?: 'testing' | 'prod';
}
