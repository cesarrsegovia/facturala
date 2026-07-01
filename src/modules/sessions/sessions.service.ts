import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { ConversationState, Session } from './session.entity';

const STALE_MINUTES = 30;

/**
 * Persistencia del estado conversacional. Crea la sesión si no existe.
 */
@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(Session)
    private readonly repo: Repository<Session>,
  ) {}

  async getOrCreate(
    professionalId: string,
    patientPhone: string,
  ): Promise<Session> {
    let session = await this.repo.findOne({
      where: { professionalId, patientPhone },
    });
    if (!session) {
      session = this.repo.create({
        professionalId,
        patientPhone,
        state: 'IDLE',
        context: {},
      });
      session = await this.repo.save(session);
    }
    return session;
  }

  update(
    id: string,
    state: ConversationState,
    context: Record<string, unknown>,
  ): Promise<Session> {
    return this.repo.save({ id, state, context });
  }

  reset(id: string): Promise<Session> {
    return this.repo.save({ id, state: 'IDLE' as ConversationState, context: {} });
  }

  /** Resetea sesiones inactivas (> 30 min) a IDLE. Llamado por el cron. */
  async resetStale(): Promise<number> {
    const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000);
    const stale = await this.repo.find({ where: { updatedAt: LessThan(cutoff) } });
    for (const session of stale) {
      if (session.state !== 'IDLE') await this.reset(session.id);
    }
    return stale.length;
  }
}
