import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@inspect-hub/database';
import type { InspectionForm, InspectionQuestion } from '@inspect-hub/types';
import { DatabaseService } from '../database/database.service';
import { CreateFormDto, UpdateFormDto } from './dto/form.dto';

@Injectable()
export class FormsService {
  constructor(private readonly database: DatabaseService) {}

  async create(dto: CreateFormDto): Promise<InspectionForm> {
    const form = await this.database.form.create({
      data: {
        title: dto.title,
        code: dto.code.trim().toUpperCase(),
        version: 1,
        allowedStatuses: dto.allowedStatuses,
        questions: dto.questions as unknown as Prisma.InputJsonValue,
        processes: {
          connect: dto.processIds.map((id) => ({ id })),
        },
      },
      include: { processes: true },
    });
    return this.toContract(form);
  }

  async findAll(stationId?: string): Promise<InspectionForm[]> {
    const forms = await this.database.form.findMany({
      orderBy: [{ code: 'asc' }, { version: 'desc' }],
      include: { processes: true },
    });
    const latestByCode = new Map<string, (typeof forms)[number]>();
    for (const form of forms) {
      if (!latestByCode.has(form.code)) latestByCode.set(form.code, form);
    }
    const station = stationId
      ? await this.database.station.findUnique({
          where: { code: stationId.trim().toUpperCase() },
          select: { processId: true },
        })
      : null;
    return [...latestByCode.values()]
      .filter(
        (form) =>
          !stationId ||
          (station?.processId &&
            form.processes.some((process) => process.id === station.processId)),
      )
      .map((form) => this.toContract(form));
  }

  async findOne(id: string): Promise<InspectionForm> {
    const form = await this.database.form.findUnique({
      where: { id },
      include: { processes: true },
    });
    if (!form) throw new NotFoundException('Nie znaleziono formularza');
    return this.toContract(form);
  }

  async update(id: string, dto: UpdateFormDto): Promise<InspectionForm> {
    const source = await this.database.form.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Nie znaleziono formularza');

    const latest = await this.database.form.findFirst({
      where: { code: source.code },
      orderBy: { version: 'desc' },
      include: { processes: true },
    });
    if (!latest) throw new NotFoundException('Nie znaleziono formularza');

    const form = await this.database.form.create({
      data: {
        title: dto.title ?? latest.title,
        code: latest.code,
        version: latest.version + 1,
        allowedStatuses:
          (dto.allowedStatuses as Prisma.InputJsonValue | undefined) ??
          (latest.allowedStatuses as Prisma.InputJsonValue),
        questions:
          (dto.questions as unknown as Prisma.InputJsonValue | undefined) ??
          (latest.questions as Prisma.InputJsonValue),
        processes: {
          connect: (
            dto.processIds ?? latest.processes.map((process) => process.id)
          ).map((processId) => ({ id: processId })),
        },
      },
      include: { processes: true },
    });
    return this.toContract(form);
  }

  async findRevisions(id: string): Promise<InspectionForm[]> {
    const form = await this.database.form.findUnique({
      where: { id },
      include: { processes: true },
    });
    if (!form) throw new NotFoundException('Nie znaleziono formularza');
    const revisions = await this.database.form.findMany({
      where: { code: form.code },
      orderBy: { version: 'desc' },
      include: { processes: true },
    });
    return revisions.map((revision) => this.toContract(revision));
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.database.form.delete({ where: { id } });
  }

  private toContract(form: {
    id: string;
    title: string;
    code: string;
    version: number;
    allowedStatuses: Prisma.JsonValue;
    questions: Prisma.JsonValue;
    processes: { id: string }[];
    createdAt: Date;
  }): InspectionForm {
    return {
      id: form.id,
      title: form.title,
      code: form.code,
      version: form.version,
      allowedStatuses: form.allowedStatuses as string[],
      questions: form.questions as unknown as InspectionQuestion[],
      processIds: form.processes.map((process) => process.id),
      createdAt: form.createdAt.toISOString(),
    };
  }
}
