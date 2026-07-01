import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

/**
 * Credenciales para iniciar sesión.
 */
export class LoginDto {
  @ApiProperty({ example: 'dr.garcia@clinica.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'unaClaveSegura123' })
  @IsString()
  password: string;
}
