import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Professional } from '../../professionals/professional.entity';

interface JwtPayload {
  sub: string;
  email: string;
}

/**
 * Estrategia Passport que valida el JWT de cada request protegido.
 *
 * Extrae el token del header `Authorization: Bearer <token>`, verifica la firma
 * y carga el profesional desde la base. El resultado de `validate` queda
 * disponible como `request.user` (ver `@CurrentProfessional`).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(Professional)
    private readonly professionalsRepo: Repository<Professional>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<Professional> {
    const professional = await this.professionalsRepo.findOne({
      where: { id: payload.sub },
    });
    if (!professional) throw new UnauthorizedException();
    return professional;
  }
}
