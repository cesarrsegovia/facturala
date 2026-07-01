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
import { Patient } from '../patients/patient.entity';

export type InvoiceStatus = 'EMITTED' | 'PENDING' | 'FAILED';

/**
 * Factura emitida (o pendiente de emisión si AFIP no estaba disponible).
 * El PDF no se persiste: se regenera desde estos datos bajo demanda.
 */
@Entity('invoices')
@Index(['professionalId', 'status'])
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'professional_id' })
  professionalId: string;

  @ManyToOne(() => Professional, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional: Professional;

  @Column({ name: 'patient_id' })
  patientId: string;

  @ManyToOne(() => Patient, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  @Column({ name: 'numero_comprobante', nullable: true })
  numeroComprobante: number;

  @Column({ type: 'enum', enum: ['B', 'C'] })
  tipo: 'B' | 'C';

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  importe: string;

  @Column({ name: 'fecha_servicio', type: 'date' })
  fechaServicio: string;

  @Column({ nullable: true })
  cae: string;

  @Column({ name: 'cae_vencimiento', type: 'date', nullable: true })
  caeVencimiento: string;

  @Column({
    type: 'enum',
    enum: ['EMITTED', 'PENDING', 'FAILED'],
    default: 'PENDING',
  })
  status: InvoiceStatus;

  @CreateDateColumn({ name: 'emitted_at' })
  emittedAt: Date;
}
