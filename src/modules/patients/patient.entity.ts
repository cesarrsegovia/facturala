import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Professional } from '../professionals/professional.entity';

/**
 * Paciente de un profesional. Aislado por `professionalId` (multi-tenant).
 */
@Entity('patients')
@Index(['professionalId', 'fullName'])
export class Patient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'professional_id' })
  professionalId: string;

  @ManyToOne(() => Professional, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional: Professional;

  @Column({ name: 'full_name' })
  fullName: string;

  @Column({ nullable: true })
  dni: string;

  @Column({ nullable: true })
  cuit: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
