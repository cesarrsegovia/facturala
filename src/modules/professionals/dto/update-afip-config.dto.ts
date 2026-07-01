import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Configuración AFIP enviada junto con los archivos de certificado.
 *
 * Llega como `multipart/form-data`, por eso `puntoVenta` se transforma de
 * string a número antes de validar.
 */
export class UpdateAfipConfigDto {
  @ApiProperty({ example: 1, description: 'Punto de venta AFIP' })
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value as string, 10))
  puntoVenta: number;

  @ApiProperty({ enum: ['B', 'C'], description: 'Tipo de factura' })
  @IsEnum(['B', 'C'])
  invoiceType: 'B' | 'C';

  @ApiPropertyOptional({ enum: ['testing', 'prod'], default: 'testing' })
  @IsOptional()
  @IsEnum(['testing', 'prod'])
  afipEnv?: 'testing' | 'prod';
}
