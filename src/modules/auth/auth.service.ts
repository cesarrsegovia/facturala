import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Professional } from '../professionals/professional.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

/**
 * Autenticación de profesionales: registro y login.
 *
 * Las contraseñas se almacenan hasheadas con bcrypt; nunca en texto plano.
 * Ambas operaciones devuelven un JWT firmado con expiración de 7 días.
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Professional)
    private readonly professionalsRepo: Repository<Professional>,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Registra un nuevo profesional y devuelve su token de acceso.
   *
   * @throws ConflictException si el email o el CUIT ya están registrados.
   */
  async register(dto: RegisterDto): Promise<{ token: string }> {
    const emailExists = await this.professionalsRepo.findOne({
      where: { email: dto.email },
    });
    if (emailExists) throw new ConflictException('Email already registered');

    const cuitExists = await this.professionalsRepo.findOne({
      where: { cuit: dto.cuit },
    });
    if (cuitExists) throw new ConflictException('CUIT already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const professional = this.professionalsRepo.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      cuit: dto.cuit,
    });
    const saved = await this.professionalsRepo.save(professional);

    return this.buildToken(saved);
  }

  /**
   * Valida credenciales y devuelve un token de acceso.
   *
   * @throws UnauthorizedException si el email no existe o la contraseña es incorrecta.
   */
  async login(dto: LoginDto): Promise<{ token: string }> {
    // passwordHash tiene `select: false`, hay que pedirlo explícitamente.
    const professional = await this.professionalsRepo
      .createQueryBuilder('p')
      .addSelect('p.passwordHash')
      .where('p.email = :email', { email: dto.email })
      .getOne();

    if (!professional) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, professional.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.buildToken(professional);
  }

  private buildToken(professional: Professional): { token: string } {
    const token = this.jwtService.sign({
      sub: professional.id,
      email: professional.email,
    });
    return { token };
  }
}
