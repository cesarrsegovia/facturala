import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentProfessional } from '../../common/decorators/current-professional.decorator';
import { Professional } from '../professionals/professional.entity';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

@ApiTags('Patients')
@ApiBearerAuth()
@Controller('patients')
@UseGuards(JwtAuthGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  create(
    @CurrentProfessional() pro: Professional,
    @Body() dto: CreatePatientDto,
  ) {
    return this.patientsService.create(pro.id, dto);
  }

  @Get()
  findAll(
    @CurrentProfessional() pro: Professional,
    @Query('search') search?: string,
  ) {
    return this.patientsService.findAll(pro.id, search);
  }

  @Get(':id')
  findOne(@CurrentProfessional() pro: Professional, @Param('id') id: string) {
    return this.patientsService.findOne(pro.id, id);
  }

  @Patch(':id')
  update(
    @CurrentProfessional() pro: Professional,
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patientsService.update(pro.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentProfessional() pro: Professional, @Param('id') id: string) {
    return this.patientsService.remove(pro.id, id);
  }
}
