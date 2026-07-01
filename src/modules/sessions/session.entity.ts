import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type ConversationState =
  | 'IDLE'
  | 'COLLECTING'
  | 'CONFIRMING'
  | 'PROCESSING';

/**
 * Estado de una conversación de WhatsApp por (profesional, teléfono del paciente).
 * `context` (JSONB) guarda datos parciales del flujo sin columnas fijas.
 */
@Entity('sessions')
@Index(['professionalId', 'patientPhone'], { unique: true })
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'professional_id' })
  professionalId: string;

  @Column({ name: 'patient_phone' })
  patientPhone: string;

  @Column({
    type: 'enum',
    enum: ['IDLE', 'COLLECTING', 'CONFIRMING', 'PROCESSING'],
    default: 'IDLE',
  })
  state: ConversationState;

  @Column({ type: 'jsonb', default: {} })
  context: Record<string, unknown>;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
