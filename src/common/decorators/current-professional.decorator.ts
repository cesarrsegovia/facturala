import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Professional } from '../../modules/professionals/professional.entity';

/**
 * Inyecta el profesional autenticado (cargado por `JwtStrategy`) en un handler.
 *
 * @example
 * getMe(@CurrentProfessional() professional: Professional) { ... }
 */
export const CurrentProfessional = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Professional => {
    const request = ctx.switchToHttp().getRequest<{ user: Professional }>();
    return request.user;
  },
);
