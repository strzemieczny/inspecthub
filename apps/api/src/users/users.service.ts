import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@inspect-hub/database';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../database/database.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

const publicUser = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly database: DatabaseService) {}

  findAll() {
    return this.database.user.findMany({
      select: publicUser,
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(dto: CreateUserDto) {
    try {
      return await this.database.user.create({
        data: {
          email: dto.email.toLowerCase(),
          name: dto.name,
          passwordHash: await bcrypt.hash(dto.password, 12),
          role: dto.role as Role,
        },
        select: publicUser,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Konto z tym adresem już istnieje');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateUserDto, actingUserId: string) {
    const user = await this.database.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Nie znaleziono użytkownika');
    if (id === actingUserId && dto.role === 'OPERATOR') {
      throw new ForbiddenException(
        'Nie możesz odebrać sobie uprawnień administratora',
      );
    }
    try {
      return await this.database.user.update({
        where: { id },
        data: {
          ...(dto.email ? { email: dto.email.toLowerCase() } : {}),
          ...(dto.name ? { name: dto.name } : {}),
          ...(dto.role ? { role: dto.role as Role } : {}),
          ...(dto.password
            ? { passwordHash: await bcrypt.hash(dto.password, 12) }
            : {}),
        },
        select: publicUser,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Konto z tym adresem już istnieje');
      }
      throw error;
    }
  }

  async remove(id: string, actingUserId: string) {
    if (id === actingUserId)
      throw new ForbiddenException('Nie możesz usunąć własnego konta');
    const user = await this.database.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Nie znaleziono użytkownika');
    if (
      user.role === Role.ADMIN &&
      (await this.database.user.count({ where: { role: Role.ADMIN } })) === 1
    ) {
      throw new ForbiddenException(
        'Nie można usunąć ostatniego administratora',
      );
    }
    try {
      await this.database.user.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Nie można usunąć użytkownika powiązanego z inspekcjami',
        );
      }
      throw error;
    }
  }
}
