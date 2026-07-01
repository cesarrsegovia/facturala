import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validateRequest } from 'twilio';
import { Request } from 'express';

/**
 * Valida la firma HMAC-SHA1 `X-Twilio-Signature` de cada webhook entrante.
 * Rechaza requests que no provienen de Twilio.
 */
@Injectable()
export class TwilioSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const signature = req.header('X-Twilio-Signature') ?? '';
    const authToken = this.config.getOrThrow<string>('TWILIO_AUTH_TOKEN');
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    const valid = validateRequest(
      authToken,
      signature,
      url,
      req.body as Record<string, string>,
    );
    if (!valid) throw new UnauthorizedException('Invalid Twilio signature');
    return true;
  }
}
