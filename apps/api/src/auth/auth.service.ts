import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@inspect-hub/database';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../database/database.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    const passwordHash = await bcrypt.hash(dto.password, 12);
    let user: { id: string; email: string; name: string; role: Role };
    try {
      user = await this.database.$transaction(
        async (transaction) => {
          if ((await transaction.user.count()) > 0) {
            throw new ForbiddenException(
              'Rejestracja startowa jest dostępna tylko przed utworzeniem pierwszego konta',
            );
          }
          return transaction.user.create({
            data: { email, name: dto.name, passwordHash, role: Role.ADMIN },
            select: { id: true, email: true, name: true, role: true },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Konto z tym adresem już istnieje');
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ForbiddenException('Konto startowe zostało już utworzone');
      }
      throw error;
    }
    return this.issueToken(user);
  }

  async login(dto: LoginDto) {
    const user = await this.database.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Nieprawidłowy email lub hasło');
    }
    return this.issueToken(user);
  }

  private async issueToken(user: {
    id: string;
    email: string;
    name: string;
    role: Role;
  }) {
    return {
      accessToken: await this.jwt.signAsync({
        sub: user.id,
        email: user.email,
      }),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }
}
