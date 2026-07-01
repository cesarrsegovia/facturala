import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/**
 * Profesionales (tenant del sistema)
 *
 * Cada profesional aisla sus propios datos: pacientes, facturas y sesiones
 * referencian un `id`. los campos sensibles ('passwordHash', 'afipCert',
 * 'afipKey') usan `select: false` para no exponerse en consultas normales.
 */
@Entity('professionals')
export class Professional {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash', select: false })
  passwordHash: string;

  @Column({ name: 'full_name' })
  fullName: string;

  @Column({ unique: true })
  cuit: string;

  @Column({ name: 'punto_venta', nullable: true })
  puntoVenta: number;

  @Column({
    name: 'invoice_type',
    type: 'enum',
    enum: ['B', 'C'],
    default: 'B',
  })
  invoiceType: 'B' | 'C';

  @Column({ name: 'afip_cert', nullable: true, select: false })
  afipCert: string;

  @Column({ name: 'afip_key', nullable: true, select: false })
  afipKey: string;

  @Column({
    name: 'afip_env',
    type: 'enum',
    enum: ['testing', 'prod'],
    default: 'testing',
  })
  afipEnv: 'testing' | 'prod';

  @Column({ name: 'twilio_phone', nullable: true, unique: true })
  twilioPhone: string;

  @Column({ name: 'whatsapp_number', nullable: true })
  whatsappNumber: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
