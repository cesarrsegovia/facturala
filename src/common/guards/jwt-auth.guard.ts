import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Protege rutas exigiendo un JWT válido. Delega en `JwtStrategy`.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
