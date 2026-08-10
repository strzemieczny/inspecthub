import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@inspect-hub/database';
import * as bcrypt from 'bcrypt';
import { createHmac } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AccessControlService } from './access-control.service';
import { CardLoginDto } from './dto/card-login.dto';
import { PairCardDto } from './dto/pair-card.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly jwt: JwtService,
    private readonly accessControl: AccessControlService,
    private readonly config: ConfigService,
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
    if (
      !user?.passwordHash ||
      !(await bcrypt.compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Nieprawidłowy email lub hasło');
    }
    return this.issueToken(user);
  }

  async cardLogin(dto: CardLoginDto) {
    const identifier = dto.identifier.trim();
    if (!/^\d+$/.test(identifier)) {
      const mapping = await this.database.accessCardMapping.findUnique({
        where: { uidHash: this.uidHash(identifier) },
      });
      if (!mapping) return { requiresPairing: true as const };
      const verificationPercent = Math.min(
        100,
        Math.max(
          0,
          Number(this.config.get<string>('CARD_REVERIFICATION_PERCENT') ?? 10),
        ),
      );
      if (Math.random() * 100 < verificationPercent) {
        return { requiresPairing: true as const, verification: true as const };
      }
      const external = await this.accessControl.findActiveOperator(
        String(mapping.apacsCardNumber),
      );
      return this.loginExternalOperator(external);
    }
    const external = await this.accessControl.findActiveOperator(identifier);
    return this.loginExternalOperator(external);
  }

  async pairCard(dto: PairCardDto) {
    const cardNumber = Number(dto.cardCode);
    const external = await this.accessControl.findActiveOperator(dto.cardCode);
    if (!external) {
      throw new UnauthorizedException(
        'Kod z odwrotu karty jest nieprawidłowy lub karta jest nieaktywna',
      );
    }
    const uidHash = this.uidHash(dto.identifier);
    await this.database.$transaction(async (database) => {
      await database.accessCardMapping.deleteMany({
        where: { apacsCardNumber: cardNumber, uidHash: { not: uidHash } },
      });
      await database.accessCardMapping.upsert({
        where: { uidHash },
        create: { uidHash, apacsCardNumber: cardNumber },
        update: { apacsCardNumber: cardNumber },
      });
    });
    return this.loginExternalOperator(external);
  }

  private uidHash(identifier: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET'))
      .update(identifier.trim().toUpperCase())
      .digest('hex');
  }

  private async loginExternalOperator(
    external: Awaited<ReturnType<AccessControlService['findActiveOperator']>>,
  ) {
    if (!external) {
      throw new UnauthorizedException(
        'Karta jest nieznana, nieaktywna lub nieważna',
      );
    }
    const name =
      `${external.firstName} ${external.lastName}`.trim() ||
      `Operator ${external.externalId}`;
    const email = `apacs-${external.externalId}@access-control.invalid`;
    const user = await this.database.user.upsert({
      where: {
        externalProvider_externalId: {
          externalProvider: 'APACS',
          externalId: external.externalId,
        },
      },
      create: {
        externalProvider: 'APACS',
        externalId: external.externalId,
        email,
        name,
        role: Role.OPERATOR,
      },
      update: { email, name, role: Role.OPERATOR },
      select: { id: true, email: true, name: true, role: true },
    });
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
