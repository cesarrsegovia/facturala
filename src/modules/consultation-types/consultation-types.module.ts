import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsultationType } from './consultation-type.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ConsultationType])],
  exports: [TypeOrmModule],
})
export class ConsultationTypesModule {}
