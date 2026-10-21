import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@inspect-hub/database';
import { createHmac } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { LoginDto } from './dto/login.dto';
import { LdapService } from './ldap.service';
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
    private readonly ldap: LdapService,
  ) {}

  async login(dto: LoginDto) {
    if (
      this.config.get<string>('NODE_ENV') === 'development' &&
      dto.username === 'admin'
    ) {
      if (dto.password !== 'admin') throw new UnauthorizedException();
      const data = {
        email: 'admin@development.invalid',
        name: 'Testowy Admin',
        role: Role.ADMIN,
        passwordHash: null,
      };
      const user = await this.database.user.upsert({
        where: {
          externalProvider_externalId: {
            externalProvider: 'DEV',
            externalId: 'admin',
          },
        },
        create: { ...data, externalProvider: 'DEV', externalId: 'admin' },
        update: data,
        select: { id: true, email: true, name: true, role: true },
      });
      return this.issueToken(user, 'DEV');
    }
    const identity = await this.ldap.authenticate(dto.username, dto.password);
    const data = {
      ...identity,
      externalProvider: 'LDAP',
      passwordHash: null,
    };
    try {
      const user = await this.database.$transaction(async (database) => {
        const existing = await database.user.findUnique({
          where: {
            externalProvider_externalId: {
              externalProvider: 'LDAP',
              externalId: identity.externalId,
            },
          },
        });
        if (existing)
          return database.user.update({ where: { id: existing.id }, data });
        // Adopt an old local record to preserve its inspection/audit history.
        const legacy = await database.user.findUnique({
          where: { email: identity.email },
        });
        if (legacy) {
          if (legacy.externalProvider)
            throw new ConflictException(
              'Adres konta jest przypisany do innej tożsamości',
            );
          return database.user.update({ where: { id: legacy.id }, data });
        }
        return database.user.create({ data });
      });
      return this.issueToken(user, 'LDAP');
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Konflikt tożsamości konta LDAP. Spróbuj ponownie lub skontaktuj się z administratorem',
        );
      }
      throw error;
    }
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
    return this.issueToken(user, 'APACS');
  }

  private async issueToken(
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
    },
    provider: 'LDAP' | 'APACS' | 'DEV',
  ) {
    return {
      accessToken: await this.jwt.signAsync({
        sub: user.id,
        provider,
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
