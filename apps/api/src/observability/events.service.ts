import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { EventOutcome, EventSeverity, Prisma } from '@inspect-hub/database';
import { DatabaseService } from '../database/database.service';
import { currentCorrelationId } from './correlation-context';
import { CollectEventDto, EventQueryDto } from './dto/event.dto';

export interface RecordEventInput {
  type: string;
  category: string;
  severity?: EventSeverity;
  outcome?: EventOutcome;
  occurredAt?: Date;
  source?: string;
  actorId?: string;
  actorType?: string;
  stationCode?: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
  correlationId?: string;
}

const REDACTED_KEYS =
  /password|secret|token|authorization|cookie|carduid|cardcode|uidhash|identifier/i;

@Injectable()
export class EventsService {
  constructor(private readonly database: DatabaseService) {}

  async record(input: RecordEventInput) {
    return this.database.auditEvent.create({ data: this.buildData(input) });
  }

  buildData(input: RecordEventInput): Prisma.AuditEventUncheckedCreateInput {
    const occurredAt = input.occurredAt ?? new Date();
    if (occurredAt.getTime() > Date.now() + 5 * 60_000) {
      throw new BadRequestException('Czas zdarzenia jest zbyt odległy');
    }
    const payload = this.redact(input.payload ?? {});
    const canonicalPayload = this.stableStringify(payload);
    return {
      occurredAt,
      type: input.type.trim().toUpperCase(),
      category: input.category.trim().toUpperCase(),
      severity: input.severity ?? EventSeverity.INFO,
      outcome: input.outcome ?? EventOutcome.UNKNOWN,
      source: input.source ?? 'inspect-hub-api',
      correlationId:
        input.correlationId ?? currentCorrelationId() ?? randomUUID(),
      actorId: input.actorId,
      actorType: input.actorType,
      stationCode: input.stationCode?.trim().toUpperCase(),
      entityType: input.entityType,
      entityId: input.entityId,
      payload: payload as Prisma.InputJsonValue,
      payloadHash: createHash('sha256').update(canonicalPayload).digest('hex'),
    };
  }

  collect(dto: CollectEventDto, actorId: string) {
    return this.record({
      ...dto,
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
      source: 'inspect-hub-client',
      actorId,
      actorType: 'USER',
    });
  }

  find(query: EventQueryDto) {
    return this.database.auditEvent.findMany({
      where: {
        occurredAt: {
          gte: query.from ? new Date(query.from) : undefined,
          lte: query.to ? new Date(query.to) : undefined,
        },
        type: query.type?.trim().toUpperCase(),
        correlationId: query.correlationId,
        stationCode: query.stationCode?.trim().toUpperCase(),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
    });
  }

  private redact(value: unknown): unknown {
    if (value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map((item) => this.redact(item));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        REDACTED_KEYS.test(key) ? '[REDACTED]' : this.redact(item),
      ]),
    );
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(
          ([key, item]) =>
            `${JSON.stringify(key)}:${this.stableStringify(item)}`,
        )
        .join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
  }
}
