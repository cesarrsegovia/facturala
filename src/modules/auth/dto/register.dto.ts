import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, Matches } from 'class-validator';

/**
 * Datos requeridos para registrar un nuevo profesional.
 */
export class RegisterDto {
  @ApiProperty({ example: 'dr.garcia@clinica.com', description: 'Email único del profesional' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'unaClaveSegura123', minLength: 8, description: 'Contraseña (mínimo 8 caracteres)' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Dr. Juan García', description: 'Nombre completo' })
  @IsString()
  @MinLength(2)
  fullName: string;

  @ApiProperty({ example: '20123456789', description: 'CUIT sin guiones (exactamente 11 dígitos)' })
  @IsString()
  @Matches(/^\d{11}$/, { message: 'CUIT must be exactly 11 digits' })
  cuit: string;
}
