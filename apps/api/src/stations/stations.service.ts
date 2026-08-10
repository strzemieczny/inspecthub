import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@inspect-hub/database';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import {
  CreateStationDto,
  IdentifyStationDto,
  UpdateStationDto,
} from './dto/station.dto';

@Injectable()
export class StationsService {
  private readonly publicSelect = {
    id: true,
    code: true,
    name: true,
    ipAddress: true,
    process: { select: { id: true, name: true } },
    active: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.StationSelect;

  constructor(private readonly database: DatabaseService) {}

  findAll() {
    return this.database.station.findMany({
      orderBy: [{ active: 'desc' }, { code: 'asc' }],
      select: this.publicSelect,
    });
  }

  async create(dto: CreateStationDto) {
    try {
      return await this.database.station.create({
        data: {
          code: this.code(dto.code),
          name: dto.name.trim(),
          process: {
            connectOrCreate: {
              where: { name: dto.processName.trim() },
              create: { name: dto.processName.trim() },
            },
          },
        },
        select: this.publicSelect,
      });
    } catch (error) {
      this.handleUniqueCode(error);
    }
  }

  async update(id: string, dto: UpdateStationDto) {
    const station = await this.findOne(id);
    const nextCode =
      dto.code === undefined ? station.code : this.code(dto.code);
    try {
      return await this.database.station.update({
        where: { id },
        data: {
          code: nextCode,
          name: dto.name?.trim(),
          active: dto.active,
          process: dto.processName
            ? {
                connectOrCreate: {
                  where: { name: dto.processName.trim() },
                  create: { name: dto.processName.trim() },
                },
              }
            : undefined,
        },
        select: this.publicSelect,
      });
    } catch (error) {
      this.handleUniqueCode(error);
    }
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.database.station.delete({ where: { id } });
  }

  async identify(dto: IdentifyStationDto, ipAddress: string) {
    const normalizedCode = this.code(dto.code);
    let station = await this.database.station.findUnique({
      where: { code: normalizedCode },
    });

    if (!station) {
      const name = dto.name?.trim();
      const processName = dto.processName?.trim();
      if (!name || !processName) {
        throw new BadRequestException(
          'Nowe stanowisko wymaga nazwy i procesu inspekcji',
        );
      }
      station = await this.database.station.create({
        data: {
          code: normalizedCode,
          name,
          process: {
            connectOrCreate: {
              where: { name: processName },
              create: { name: processName },
            },
          },
        },
      });
    }
    if (!station.active)
      throw new BadRequestException('Stanowisko jest nieaktywne');

    const token = randomBytes(32).toString('base64url');
    const updated = await this.bindDevice(station.id, ipAddress, token);
    return { station: updated, token };
  }

  async resolveCurrent(ipAddress: string, token?: string) {
    let station = token
      ? await this.database.station.findUnique({
          where: { deviceTokenHash: this.tokenHash(token) },
        })
      : null;

    if (station) {
      if (!station.active)
        throw new BadRequestException('Stanowisko jest nieaktywne');
      const updated = await this.bindDevice(station.id, ipAddress);
      return { station: updated, token: null };
    }

    station = await this.database.station.findUnique({ where: { ipAddress } });
    if (!station || !station.active) {
      throw new NotFoundException(
        'Nie rozpoznano stanowiska dla tego urządzenia',
      );
    }

    const nextToken = randomBytes(32).toString('base64url');
    const updated = await this.bindDevice(station.id, ipAddress, nextToken);
    return { station: updated, token: nextToken };
  }

  private async findOne(id: string) {
    const station = await this.database.station.findUnique({ where: { id } });
    if (!station) throw new NotFoundException('Nie znaleziono stanowiska');
    return station;
  }

  private async bindDevice(id: string, ipAddress: string, token?: string) {
    return this.database.$transaction(async (database) => {
      await database.station.updateMany({
        where: { ipAddress, id: { not: id } },
        data: { ipAddress: null },
      });
      return database.station.update({
        where: { id },
        data: {
          ipAddress,
          deviceTokenHash: token ? this.tokenHash(token) : undefined,
        },
        select: this.publicSelect,
      });
    });
  }

  private tokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private code(value: string): string {
    return value.trim().toUpperCase();
  }

  private handleUniqueCode(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Stanowisko o tym kodzie już istnieje');
    }
    throw error;
  }
}
