import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Patient } from './patient.entity';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

/**
 * CRUD de pacientes, siempre acotado al `professionalId` (aislamiento tenant).
 */
@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient)
    private readonly repo: Repository<Patient>,
  ) {}

  create(professionalId: string, dto: CreatePatientDto): Promise<Patient> {
    const patient = this.repo.create({ ...dto, professionalId });
    return this.repo.save(patient);
  }

  findAll(professionalId: string, search?: string): Promise<Patient[]> {
    return this.repo.find({
      where: {
        professionalId,
        ...(search ? { fullName: ILike(`%${search}%`) } : {}),
      },
      order: { fullName: 'ASC' },
    });
  }

  async findOne(professionalId: string, id: string): Promise<Patient> {
    const patient = await this.repo.findOne({ where: { id, professionalId } });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  /**
   * Busca por nombre (case-insensitive). Devuelve el paciente solo si hay un
   * único match; null si no hay ninguno o si es ambiguo. Usado por el bot
   * para resolver "facturale a María".
   */
  async findByName(
    professionalId: string,
    name: string,
  ): Promise<Patient | null> {
    const matches = await this.repo.find({
      where: { professionalId, fullName: ILike(`%${name}%`) },
      take: 2,
    });
    return matches.length === 1 ? matches[0] : null;
  }

  async update(
    professionalId: string,
    id: string,
    dto: UpdatePatientDto,
  ): Promise<Patient> {
    await this.findOne(professionalId, id);
    await this.repo.update({ id, professionalId }, dto);
    return this.findOne(professionalId, id);
  }

  async remove(professionalId: string, id: string): Promise<void> {
    const result = await this.repo.delete({ id, professionalId });
    if (!result.affected) throw new NotFoundException('Patient not found');
  }
}
