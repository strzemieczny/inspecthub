import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@inspect-hub/database';
import type { InspectionForm, InspectionQuestion } from '@inspect-hub/types';
import { normalizeText } from '../common/normalize-text';
import { DatabaseService } from '../database/database.service';
import { CreateFormDto, DuplicateFormDto, UpdateFormDto } from './dto/form.dto';

@Injectable()
export class FormsService {
  constructor(private readonly database: DatabaseService) {}

  async create(dto: CreateFormDto, actorId: string): Promise<InspectionForm> {
    const form = await this.database.form.create({
      data: {
        ...(await this.authorSnapshot(actorId)),
        title: dto.title,
        code: dto.code.trim().toUpperCase(),
        version: 1,
        partNumbers: this.normalizePartNumbers(dto.partNumbers ?? []),
        nokStreakThreshold: dto.nokStreakThreshold,
        requiresLogin: dto.requiresLogin,
        allowedStatuses: dto.allowedStatuses,
        questions: this.portableQuestions(dto.questions),
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
      where: { archivedAt: null },
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

  async duplicate(
    id: string,
    dto: DuplicateFormDto,
    actorId: string,
  ): Promise<InspectionForm> {
    const source = await this.database.form.findUnique({
      where: { id },
      include: { processes: true },
    });
    if (!source) throw new NotFoundException('Nie znaleziono formularza');
    const copy = await this.database.form.create({
      data: {
        ...(await this.authorSnapshot(actorId)),
        title: dto.title.trim(),
        code: dto.code.trim().toUpperCase(),
        version: 1,
        partNumbers: source.partNumbers,
        requiresLogin: source.requiresLogin,
        nokStreakThreshold: source.nokStreakThreshold,
        allowedStatuses: source.allowedStatuses as Prisma.InputJsonValue,
        questions: this.portableQuestions(
          source.questions as unknown as InspectionQuestion[],
        ),
        processes: {
          connect: source.processes.map((process) => ({ id: process.id })),
        },
      },
      include: { processes: true },
    });
    return this.toContract(copy);
  }

  async findOne(id: string): Promise<InspectionForm> {
    const form = await this.database.form.findUnique({
      where: { id },
      include: { processes: true },
    });
    if (!form) throw new NotFoundException('Nie znaleziono formularza');
    return this.toContract(form);
  }

  async update(
    id: string,
    dto: UpdateFormDto,
    actorId: string,
  ): Promise<InspectionForm> {
    const source = await this.database.form.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Nie znaleziono formularza');
    if (source.archivedAt)
      throw new NotFoundException('Formularz jest zarchiwizowany');

    const latest = await this.database.form.findFirst({
      where: { code: source.code },
      orderBy: { version: 'desc' },
      include: { processes: true },
    });
    if (!latest) throw new NotFoundException('Nie znaleziono formularza');

    const form = await this.database.form.create({
      data: {
        ...(await this.authorSnapshot(actorId)),
        title: dto.title ?? latest.title,
        code: latest.code,
        version: latest.version + 1,
        partNumbers: this.normalizePartNumbers(
          dto.partNumbers ?? latest.partNumbers,
        ),
        nokStreakThreshold: dto.nokStreakThreshold ?? latest.nokStreakThreshold,
        requiresLogin: dto.requiresLogin ?? latest.requiresLogin,
        allowedStatuses:
          (dto.allowedStatuses as Prisma.InputJsonValue | undefined) ??
          (latest.allowedStatuses as Prisma.InputJsonValue),
        questions: this.portableQuestions(
          dto.questions ??
            (latest.questions as unknown as InspectionQuestion[]),
        ),
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
    return revisions.map((revision) => ({
      ...this.toContract(revision),
      createdBy:
        revision.createdById && revision.createdByName
          ? { id: revision.createdById, name: revision.createdByName }
          : null,
    }));
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    try {
      await this.database.form.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Nie można usunąć formularza z zapisanymi inspekcjami. Zarchiwizuj go.',
        );
      }
      throw error;
    }
  }

  async archive(id: string): Promise<void> {
    const form = await this.database.form.findUnique({ where: { id } });
    if (!form) throw new NotFoundException('Nie znaleziono formularza');
    await this.database.form.updateMany({
      where: { code: form.code, archivedAt: null },
      data: { archivedAt: new Date() },
    });
  }

  private async authorSnapshot(actorId: string) {
    const actor = await this.database.user.findUniqueOrThrow({
      where: { id: actorId },
      select: { id: true, name: true },
    });
    return { createdById: actor.id, createdByName: actor.name };
  }

  private normalizePartNumbers(values: string[]): string[] {
    return [
      ...new Set(
        values.map((value) => value.trim().toUpperCase()).filter(Boolean),
      ),
    ];
  }

  private toContract(form: {
    id: string;
    title: string;
    code: string;
    version: number;
    nokStreakThreshold: number;
    requiresLogin: boolean;
    allowedStatuses: Prisma.JsonValue;
    questions: Prisma.JsonValue;
    processes: { id: string }[];
    partNumbers: string[];
    createdAt: Date;
    archivedAt: Date | null;
  }): InspectionForm {
    return {
      id: form.id,
      title: form.title,
      code: form.code,
      version: form.version,
      nokStreakThreshold: form.nokStreakThreshold,
      requiresLogin: form.requiresLogin,
      allowedStatuses: form.allowedStatuses as string[],
      questions: form.questions as unknown as InspectionQuestion[],
      partNumbers: form.partNumbers,
      processIds: form.processes.map((process) => process.id),
      createdAt: form.createdAt.toISOString(),
      archivedAt: form.archivedAt?.toISOString() ?? null,
    };
  }

  private portableQuestions(
    questions: InspectionQuestion[],
  ): Prisma.InputJsonValue {
    return questions.map((question) => {
      const label = normalizeText(question.label);
      if (!label) {
        throw new BadRequestException('Treść pytania nie może być pusta');
      }
      const options = question.options?.map((option) => normalizeText(option));
      if (question.type === 'SELECT' && options?.some((option) => !option)) {
        throw new BadRequestException(
          `Pytanie „${label}” zawiera pustą opcję odpowiedzi`,
        );
      }
      return {
        ...question,
        label,
        description:
          typeof question.description === 'string'
            ? normalizeText(question.description, true)
            : undefined,
        options,
        expectedValue:
          question.type === 'PHOTO_UPLOAD'
            ? undefined
            : typeof question.expectedValue === 'string'
              ? normalizeText(question.expectedValue)
              : question.expectedValue,
        // Preserve option order: clients map translated choices by their index.
        translations: question.translations
          ? Object.fromEntries(
              Object.entries(question.translations)
                .filter(([, translation]) => translation != null)
                .map(([language, translation]) => [
                  language,
                  {
                    ...translation,
                    label:
                      typeof translation.label === 'string'
                        ? normalizeText(translation.label) || undefined
                        : undefined,
                    description:
                      typeof translation.description === 'string'
                        ? normalizeText(translation.description, true) ||
                          undefined
                        : undefined,
                    options: translation.options?.map((option) =>
                      normalizeText(option),
                    ),
                  },
                ]),
            )
          : undefined,
        instructionImageUrl: this.portableMediaUrl(
          question.instructionImageUrl,
        ),
        okImageUrl: this.portableMediaUrl(question.okImageUrl),
        nokImageUrl: this.portableMediaUrl(question.nokImageUrl),
      };
    }) as unknown as Prisma.InputJsonValue;
  }

  private portableMediaUrl(url?: string): string | undefined {
    if (!url) return undefined;
    try {
      const parsed = new URL(url, 'http://inspect-hub.invalid');
      if (
        parsed.pathname === '/api/media/object' ||
        parsed.pathname === '/inspect-hub/api/media/object'
      ) {
        return `/api/media/object${parsed.search}`;
      }
    } catch {
      // Już zapisany adres względny pozostaje bez zmian.
    }
    return url;
  }
}
