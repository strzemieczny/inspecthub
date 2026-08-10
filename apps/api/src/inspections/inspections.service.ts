import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@inspect-hub/database';
import type {
  InspectionAnswer,
  InspectionQuestion,
  PublicAnswerAssessment,
  PublicInspectionReport,
} from '@inspect-hub/types';
import { DatabaseService } from '../database/database.service';
import { ScadaConnectorService } from '../scada-connector/scada-connector.service';
import { CreateInspectionDto } from './dto/create-inspection.dto';

@Injectable()
export class InspectionsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly scadaConnector: ScadaConnectorService,
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
        orderBy: { createdAt: 'desc' },
        select: {
          publicReportId: true,
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

  async create(dto: CreateInspectionDto, operatorId: string | null) {
    const form = await this.database.form.findUnique({
      where: { id: dto.formId },
      include: { processes: true },
    });
    if (!form) throw new NotFoundException('Nie znaleziono formularza');
    if (form.archivedAt) {
      throw new BadRequestException('Formularz jest zarchiwizowany');
    }

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

    const scadaSettings = await this.scadaConnector.getSettings();
    const routeCheck = dto.routeCheckId
      ? await this.database.routeCheck.findUnique({
          where: { id: dto.routeCheckId },
        })
      : null;
    const scadaRequired =
      scadaSettings.enabled ||
      (process.env.NODE_ENV !== 'production' &&
        process.env.NODE_ENV !== 'test');
    if (scadaRequired) {
      if (!routeCheck?.allowed) {
        throw new BadRequestException('Brak ważnej zgody SCADA na inspekcję');
      }
      if (
        routeCheck.serialNumber !== dto.vinOrSerialNumber.trim() ||
        routeCheck.stationCode !== stationId ||
        routeCheck.processName !== managedStation.process!.name
      ) {
        throw new BadRequestException('Zgoda SCADA nie dotyczy tej inspekcji');
      }
      const existing = await this.database.inspectionResult.findUnique({
        where: { routeCheckId: routeCheck.id },
        select: { id: true },
      });
      if (existing)
        throw new BadRequestException('Zgoda SCADA została już wykorzystana');
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

    const statuses = form.allowedStatuses as string[];
    const allExpectedValuesConfigured = questions.every(
      (question) => question.expectedValue !== undefined,
    );
    const status = allExpectedValuesConfigured
      ? this.automaticStatus(questions, answerMap, statuses)
      : dto.status;
    if (!statuses.includes(status)) {
      throw new BadRequestException(
        'Status nie jest dozwolony dla tego formularza',
      );
    }

    const publicReportId = randomUUID();
    const resultValue = this.isPassed(status) ? 'PASS' : 'FAIL';
    const reportUrl = `${scadaSettings.publicWebUrl.replace(/\/+$/, '')}/reports/${publicReportId}`;
    const result = await this.database.$transaction(async (database) => {
      const created = await database.inspectionResult.create({
        data: {
          publicReportId,
          formId: form.id,
          vinOrSerialNumber: dto.vinOrSerialNumber.trim(),
          stationId,
          operatorId,
          status,
          answers: dto.answers as unknown as Prisma.InputJsonValue,
          routeCheckId: routeCheck?.id,
          partNumber: routeCheck?.partNumber,
          productFamily: routeCheck?.productFamily,
          scadaServerUrl: routeCheck?.serverUrl,
          mesSynced: !scadaSettings.enabled,
        },
      });
      if (scadaSettings.enabled) {
        await database.scadaDelivery.create({
          data: {
            inspectionResultId: created.id,
            payload: {
              serialNumber: created.vinOrSerialNumber,
              processName: managedStation.process!.name,
              result: resultValue,
              reportUrl,
            },
          },
        });
      }
      return created;
    });
    if (scadaSettings.enabled) void this.scadaConnector.processPending();
    return result;
  }

  async getPublicReport(
    publicReportId: string,
  ): Promise<PublicInspectionReport> {
    const result = await this.database.inspectionResult.findUnique({
      where: { publicReportId },
      select: {
        publicReportId: true,
        vinOrSerialNumber: true,
        stationId: true,
        status: true,
        answers: true,
        mesSynced: true,
        partNumber: true,
        productFamily: true,
        scadaServerUrl: true,
        createdAt: true,
        operator: { select: { name: true } },
        form: {
          select: {
            code: true,
            title: true,
            version: true,
            questions: true,
          },
        },
      },
    });
    if (!result) throw new NotFoundException('Nie znaleziono raportu');

    const station = await this.database.station.findUnique({
      where: { code: result.stationId },
      select: {
        name: true,
        process: { select: { name: true } },
      },
    });
    const questions = result.form.questions as unknown as InspectionQuestion[];
    const savedAnswers = result.answers as unknown as InspectionAnswer[];
    const answerMap = new Map(
      savedAnswers.map((answer) => [answer.questionId, answer.value]),
    );
    const answers = questions.map((question) => {
      const value = answerMap.get(question.id) ?? null;
      return {
        questionId: question.id,
        label: question.label,
        type: question.type,
        value,
        assessment: this.assessAnswer(question, value),
        imageUrl:
          question.type === 'PHOTO_UPLOAD' && typeof value === 'string'
            ? value
            : null,
        translations: question.translations,
        options: question.options,
      };
    });

    return {
      publicReportId: result.publicReportId,
      serialNumber: result.vinOrSerialNumber,
      result: result.status,
      completedAt: result.createdAt.toISOString(),
      station: { code: result.stationId, name: station?.name ?? null },
      process: station?.process?.name ?? null,
      // Operator names are already presented as report data in the station UI.
      operatorName: result.operator?.name ?? null,
      form: {
        code: result.form.code,
        name: result.form.title,
        version: result.form.version,
      },
      partNumber: result.partNumber,
      productFamily: result.productFamily,
      scadaUnitHistoryUrl: this.scadaUnitHistoryUrl(
        result.scadaServerUrl,
        result.vinOrSerialNumber,
      ),
      answers,
      summary: {
        total: questions.length,
        passed: answers.filter((answer) => answer.assessment === 'OK').length,
        failed: answers.filter((answer) => answer.assessment === 'NOK').length,
      },
      externalSyncStatus: result.mesSynced ? 'SYNCED' : 'PENDING',
    };
  }

  private assessAnswer(
    question: InspectionQuestion,
    value: InspectionAnswer['value'],
  ): PublicAnswerAssessment {
    if (question.expectedValue !== undefined && value !== null) {
      return value === question.expectedValue ? 'OK' : 'NOK';
    }
    if (
      question.type === 'NUMBER_RANGE' &&
      typeof value === 'number' &&
      question.range
    ) {
      return value >= question.range.min && value <= question.range.max
        ? 'OK'
        : 'NOK';
    }
    return null;
  }

  private automaticStatus(
    questions: InspectionQuestion[],
    answers: Map<string, InspectionAnswer['value']>,
    statuses: string[],
  ): string {
    const passed = questions.every(
      (question) =>
        answers.get(question.id) !== undefined &&
        answers.get(question.id) === question.expectedValue,
    );
    const status = statuses.find((item) => this.isPassed(item) === passed);
    if (!status) {
      throw new BadRequestException(
        `Formularz nie ma skonfigurowanego statusu ${passed ? 'pozytywnego' : 'negatywnego'}`,
      );
    }
    return status;
  }

  private scadaUnitHistoryUrl(
    serverUrl: string | null,
    serialNumber: string,
  ): string | null {
    if (!serverUrl?.trim()) return null;
    const normalizedServerUrl = /^https?:\/\//i.test(serverUrl)
      ? serverUrl
      : `http://${serverUrl}`;
    try {
      const historyUrl = new URL(
        'unithistory',
        `${normalizedServerUrl.replace(/\/+$/, '')}/`,
      );
      historyUrl.searchParams.set('unit', serialNumber);
      return historyUrl.toString();
    } catch {
      return null;
    }
  }

  private hasValue(value: unknown): boolean {
    return value !== undefined && value !== null && value !== '';
  }

  private isPassed(status: string): boolean {
    return ['PASSED', 'PASS', 'OK', 'ZDAŁ', 'ZDAL'].includes(
      status.toUpperCase(),
    );
  }
}
