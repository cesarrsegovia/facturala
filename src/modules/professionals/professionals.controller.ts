import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentProfessional } from '../../common/decorators/current-professional.decorator';
import { Professional } from './professional.entity';
import { ProfessionalsService } from './professionals.service';
import { UpdateProfessionalDto } from './dto/update-professional.dto';
import { UpdateAfipConfigDto } from './dto/update-afip-config.dto';

@ApiTags('Professionals')
@ApiBearerAuth()
@Controller('professionals')
@UseGuards(JwtAuthGuard)
export class ProfessionalsController {
  constructor(private readonly professionalsService: ProfessionalsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Perfil del profesional autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil (sin campos sensibles)' })
  getMe(@CurrentProfessional() professional: Professional) {
    return professional;
  }

  @Patch('me')
  @ApiOperation({ summary: 'Actualiza campos del perfil' })
  update(
    @CurrentProfessional() professional: Professional,
    @Body() dto: UpdateProfessionalDto,
  ) {
    return this.professionalsService.update(professional.id, dto);
  }

  @Post('me/afip-config')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Sube certificados AFIP (.crt + .key) y config de facturación' })
  @ApiResponse({ status: 200, description: 'Certificados cifrados y guardados' })
  @ApiResponse({ status: 400, description: 'Faltan los archivos cert o key' })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'cert', maxCount: 1 },
      { name: 'key', maxCount: 1 },
    ]),
  )
  updateAfipConfig(
    @CurrentProfessional() professional: Professional,
    @UploadedFiles()
    files: { cert?: Express.Multer.File[]; key?: Express.Multer.File[] },
    @Body() dto: UpdateAfipConfigDto,
  ) {
    if (!files?.cert?.[0] || !files?.key?.[0]) {
      throw new BadRequestException(
        'Both cert (.crt) and key (.key) files are required',
      );
    }
    return this.professionalsService.updateAfipConfig(
      professional.id,
      files.cert[0].buffer,
      files.key[0].buffer,
      dto,
    );
  }
}
