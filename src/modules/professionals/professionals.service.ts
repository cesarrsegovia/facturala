import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Professional } from './professional.entity';
import { UpdateProfessionalDto } from './dto/update-professional.dto';
import { UpdateAfipConfigDto } from './dto/update-afip-config.dto';
import { EncryptionService } from '../../common/services/encryption.service';

/**
 * Lectura y actualización del perfil del profesional, incluyendo la
 * configuración AFIP (certificados cifrados en reposo).
 */
@Injectable()
export class ProfessionalsService {
  constructor(
    @InjectRepository(Professional)
    private readonly repo: Repository<Professional>,
    private readonly encryptionService: EncryptionService,
  ) {}

  findById(id: string): Promise<Professional> {
    return this.repo.findOneOrFail({ where: { id } });
  }

  async update(
    id: string,
    dto: UpdateProfessionalDto,
  ): Promise<Professional> {
    await this.repo.update(id, dto);
    return this.findById(id);
  }

  /**
   * Cifra y guarda el certificado y la clave AFIP junto con la config de facturación.
   */
  async updateAfipConfig(
    id: string,
    certBuffer: Buffer,
    keyBuffer: Buffer,
    dto: UpdateAfipConfigDto,
  ): Promise<Professional> {
    await this.repo.update(id, {
      afipCert: this.encryptionService.encrypt(certBuffer.toString('utf8')),
      afipKey: this.encryptionService.encrypt(keyBuffer.toString('utf8')),
      puntoVenta: dto.puntoVenta,
      invoiceType: dto.invoiceType,
      afipEnv: dto.afipEnv ?? 'testing',
    });
    return this.findById(id);
  }
}
