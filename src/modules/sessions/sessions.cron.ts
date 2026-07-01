import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SessionsService } from './sessions.service';

/**
 * Resetea a IDLE las sesiones inactivas > 30 min (evita conversaciones colgadas).
 */
@Injectable()
export class SessionsCron {
  private readonly logger = new Logger(SessionsCron.name);

  constructor(private readonly sessions: SessionsService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleStaleSessions(): Promise<void> {
    const count = await this.sessions.resetStale();
    if (count) this.logger.log(`Sesiones revisadas por inactividad: ${count}`);
  }
}
