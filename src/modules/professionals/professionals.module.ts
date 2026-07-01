import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Professional } from './professional.entity';
import { ProfessionalsService } from './professionals.service';
import { ProfessionalsController } from './professionals.controller';
import { EncryptionService } from '../../common/services/encryption.service';

@Module({
  imports: [TypeOrmModule.forFeature([Professional])],
  providers: [ProfessionalsService, EncryptionService],
  controllers: [ProfessionalsController],
  exports: [TypeOrmModule, ProfessionalsService, EncryptionService],
})
export class ProfessionalsModule {}
