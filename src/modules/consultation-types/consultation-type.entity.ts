import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Professional } from '../professionals/professional.entity';

/**
 * Tipo de prestación con importe sugerido (ej. "Consulta" → $15000).
 */
@Entity('consultation_types')
export class ConsultationType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'professional_id' })
  professionalId: string;

  @ManyToOne(() => Professional, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional: Professional;

  @Column()
  name: string;

  @Column({ name: 'default_amount', type: 'decimal', precision: 10, scale: 2 })
  defaultAmount: string;
}
