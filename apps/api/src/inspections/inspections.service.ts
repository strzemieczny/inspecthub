import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@inspect-hub/database';
import type {
  InspectionQuestion,
  MesTraceabilityPayload,
} from '@inspect-hub/types';
import { DatabaseService } from '../database/database.service';
import { MesConnectorService } from '../mes-connector/mes-connector.service';
import { CreateInspectionDto } from './dto/create-inspection.dto';

@Injectable()
export class InspectionsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly mesConnector: MesConnectorService,
  ) {}

  async getPublicDashboard() {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 6);
    weekAgo.setHours(0, 0, 0, 0);

    const [results, recent] = await Promise.all([
      this.database.inspectionResult.findMany({
        where: { createdAt: { gte: weekAgo } },
        select: {
          status: true,
          stationId: true,
          mesSynced: true,
          createdAt: true,
        },
      }),
      this.database.inspectionResult.findMany({
        take: 7,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          vinOrSerialNumber: true,
          stationId: true,
          status: true,
          mesSynced: true,
          createdAt: true,
          form: { select: { title: true, code: true } },
        },
      }),
    ]);

    const isPassed = (status: string) =>
      ['PASSED', 'PASS', 'OK', 'ZDAŁ', 'ZDAL'].includes(status.toUpperCase());
    const todayResults = results.filter((item) => item.createdAt >= today);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayResults = results.filter(
      (item) => item.createdAt >= yesterday && item.createdAt < today,
    );
    const passedToday = todayResults.filter((item) =>
      isPassed(item.status),
    ).length;
    const passedYesterday = yesterdayResults.filter((item) =>
      isPassed(item.status),
    ).length;
    const percentageChange = (current: number, previous: number) =>
      previous > 0
        ? Math.round(((current - previous) / previous) * 1000) / 10
        : null;
    const daily = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekAgo);
      date.setDate(date.getDate() + index);
      const next = new Date(date);
      next.setDate(next.getDate() + 1);
      const items = results.filter(
        (item) => item.createdAt >= date && item.createdAt < next,
      );
      return {
        date: date.toISOString().slice(0, 10),
        total: items.length,
        passed: items.filter((item) => isPassed(item.status)).length,
      };
    });
    const stations = [...new Set(results.map((item) => item.stationId))];

    return {
      generatedAt: now,
      summary: {
        completedToday: todayResults.length,
        passRate: todayResults.length
          ? Math.round((passedToday / todayResults.length) * 1000) / 10
          : 0,
        issuesToday: todayResults.length - passedToday,
        completedTrend: percentageChange(
          todayResults.length,
          yesterdayResults.length,
        ),
        issuesTrend: percentageChange(
          todayResults.length - passedToday,
          yesterdayResults.length - passedYesterday,
        ),
        activeStations: stations.length,
        mesSyncRate: results.length
          ? Math.round(
              (results.filter((item) => item.mesSynced).length /
                results.length) *
                1000,
            ) / 10
          : 0,
      },
      daily,
      recent: recent.map((item) => ({
        ...item,
        vinOrSerialNumber:
          item.vinOrSerialNumber.length > 6
            ? `${item.vinOrSerialNumber.slice(0, 3)}•••${item.vinOrSerialNumber.slice(-3)}`
            : '••••••',
      })),
    };
  }

  async create(dto: CreateInspectionDto, operatorId: string) {
    const form = await this.database.form.findUnique({
      where: { id: dto.formId },
      include: { processes: true },
    });
    if (!form) throw new NotFoundException('Nie znaleziono formularza');

    const stationId = dto.stationId.trim().toUpperCase();
    const managedStation = await this.database.station.findUnique({
      where: { code: stationId },
      include: { process: true },
    });
    if (!managedStation) {
      throw new BadRequestException('Nie znaleziono stanowiska');
    }
    if (!managedStation.active) {
      throw new BadRequestException('Stanowisko jest nieaktywne');
    }
    if (!managedStation.processId) {
      throw new BadRequestException('Stanowisko nie ma przypisanego procesu');
    }
    if (
      !form.processes.some((process) => process.id === managedStation.processId)
    ) {
      throw new BadRequestException(
        'Formularz nie jest przypisany do procesu tego stanowiska',
      );
    }

    const statuses = form.allowedStatuses as string[];
    if (!statuses.includes(dto.status)) {
      throw new BadRequestException(
        'Status nie jest dozwolony dla tego formularza',
      );
    }

    const questions = form.questions as unknown as InspectionQuestion[];
    const answerMap = new Map(
      dto.answers.map((answer) => [answer.questionId, answer.value]),
    );
    const missing = questions.filter(
      (question) =>
        question.isRequired && !this.hasValue(answerMap.get(question.id)),
    );
    if (missing.length) {
      throw new BadRequestException(
        `Brak odpowiedzi: ${missing.map((item) => item.label).join(', ')}`,
      );
    }

    const result = await this.database.inspectionResult.create({
      data: {
        formId: form.id,
        vinOrSerialNumber: dto.vinOrSerialNumber,
        stationId,
        operatorId,
        status: dto.status,
        answers: dto.answers as unknown as Prisma.InputJsonValue,
      },
    });

    const passedCount = dto.answers.filter(
      (answer) => answer.value === true,
    ).length;
    const failedCount = dto.answers.filter(
      (answer) => answer.value === false,
    ).length;
    const payload: MesTraceabilityPayload = {
      vinOrSerialNumber: result.vinOrSerialNumber,
      stationId: result.stationId,
      operatorId,
      formCode: form.code,
      status: result.status,
      summary: { totalQuestions: questions.length, passedCount, failedCount },
      completedAt: result.createdAt,
    };
    await this.mesConnector.sendTraceabilityData(result.id, payload);

    return { ...result, mesSynced: true };
  }

  private hasValue(value: unknown): boolean {
    return value !== undefined && value !== null && value !== '';
  }
}
