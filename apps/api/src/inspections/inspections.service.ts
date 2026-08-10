import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
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
import { EventsService } from '../observability/events.service';
import { QualityLiveGateway } from './quality-live.gateway';
import { EventOutcome, EventSeverity } from '@inspect-hub/database';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

@Injectable()
export class InspectionsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly scadaConnector: ScadaConnectorService,
    private readonly events: EventsService,
    @Optional() private readonly qualityLive?: QualityLiveGateway,
  ) {}

  async getQualityDashboard() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const raw = await this.database.inspectionResult.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true,
        publicReportId: true,
        vinOrSerialNumber: true,
        stationId: true,
        status: true,
        answers: true,
        createdAt: true,
        form: {
          select: {
            id: true,
            code: true,
            title: true,
            nokStreakThreshold: true,
            questions: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    const streaks = new Map<
      string,
      {
        stationCode: string;
        formCode: string;
        formName: string;
        count: number;
        threshold: number;
        latestAt: Date;
        reportId: string;
      }
    >();
    const closed = new Set<string>();
    for (const item of raw) {
      const key = `${item.stationId}\0${item.form.id}`;
      if (closed.has(key)) continue;
      if (this.isPassed(item.status)) {
        closed.add(key);
        continue;
      }
      const current = streaks.get(key);
      if (current) current.count += 1;
      else
        streaks.set(key, {
          stationCode: item.stationId,
          formCode: item.form.code,
          formName: item.form.title,
          count: 1,
          threshold: item.form.nokStreakThreshold,
          latestAt: item.createdAt,
          reportId: item.publicReportId,
        });
    }

    const criticalDefects = raw.flatMap((item) => {
      const questions = item.form.questions as unknown as InspectionQuestion[];
      const answers = item.answers as unknown as InspectionAnswer[];
      const answerMap = new Map(
        answers.map((answer) => [answer.questionId, answer.value]),
      );
      return questions
        .filter(
          (question) =>
            this.questionSeverity(question) === 'CRITICAL' &&
            this.assessAnswer(question, answerMap.get(question.id) ?? null) ===
              'NOK',
        )
        .map((question) => ({
          inspectionId: item.id,
          reportId: item.publicReportId,
          serialNumber: item.vinOrSerialNumber,
          stationCode: item.stationId,
          formCode: item.form.code,
          questionId: question.id,
          questionLabel: question.label,
          occurredAt: item.createdAt,
        }));
    });
    const activeStreaks = [...streaks.values()]
      .filter((item) => item.count >= item.threshold)
      .sort(
        (a, b) =>
          b.count - a.count || b.latestAt.getTime() - a.latestAt.getTime(),
      );
    const failed = raw.filter((item) => !this.isPassed(item.status)).length;

    return {
      generatedAt: new Date(),
      windowHours: 24,
      summary: {
        inspections: raw.length,
        nok: failed,
        activeNokStreaks: activeStreaks.length,
        criticalDefects: criticalDefects.length,
      },
      nokStreaks: activeStreaks,
      criticalDefects: criticalDefects.slice(0, 100),
    };
  }

  async getPublicDashboard(
    filters: {
      from?: string;
      to?: string;
      processId?: string;
      stationId?: string;
      formCode?: string;
      formIds?: string;
      result?: string;
      search?: string;
    } = {},
  ) {
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 6);
    defaultFrom.setHours(0, 0, 0, 0);
    const from = filters.from ? new Date(filters.from) : defaultFrom;
    const to = filters.to ? new Date(filters.to) : now;
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from >= to
    ) {
      throw new BadRequestException('Nieprawidłowy zakres dat');
    }
    const maxRange = 366 * 24 * 60 * 60 * 1000;
    if (to.getTime() - from.getTime() > maxRange) {
      throw new BadRequestException('Zakres dat nie może przekraczać 366 dni');
    }

    const [stations, forms] = await Promise.all([
      this.database.station.findMany({
        include: { process: true },
        orderBy: { code: 'asc' },
      }),
      this.database.form.findMany({
        select: { id: true, title: true, code: true, version: true },
        orderBy: [{ title: 'asc' }, { version: 'desc' }],
      }),
    ]);
    const processStationIds = filters.processId
      ? stations
          .filter((station) => station.processId === filters.processId)
          .map((station) => station.code)
      : undefined;
    const isPassed = (status: string) =>
      ['PASSED', 'PASS', 'OK', 'ZDAŁ', 'ZDAL'].includes(status.toUpperCase());
    const baseWhere: Prisma.InspectionResultWhereInput = {
      ...(filters.stationId
        ? { stationId: filters.stationId }
        : processStationIds
          ? { stationId: { in: processStationIds } }
          : {}),
      ...(filters.formIds
        ? {
            formId: {
              in: filters.formIds
                .split(',')
                .map((id) => id.trim())
                .filter(Boolean),
            },
          }
        : filters.formCode
          ? { form: { code: filters.formCode } }
          : {}),
      ...(filters.search?.trim()
        ? {
            vinOrSerialNumber: {
              contains: filters.search.trim(),
              mode: 'insensitive',
            },
          }
        : {}),
    };
    const periodWhere: Prisma.InspectionResultWhereInput = {
      ...baseWhere,
      createdAt: { gte: from, lte: to },
    };
    const periodMs = to.getTime() - from.getTime();
    const previousFrom = new Date(from.getTime() - periodMs);
    const previousWhere: Prisma.InspectionResultWhereInput = {
      ...baseWhere,
      createdAt: { gte: previousFrom, lt: from },
    };

    const [rawResults, rawPrevious, activeStations, totalStations] =
      await Promise.all([
        this.database.inspectionResult.findMany({
          where: periodWhere,
          select: {
            publicReportId: true,
            vinOrSerialNumber: true,
            formId: true,
            status: true,
            stationId: true,
            mesSynced: true,
            createdAt: true,
            partNumber: true,
            productFamily: true,
            answers: true,
            durationSeconds: true,
            answerCorrections: true,
            originalInspectionId: true,
            form: {
              select: {
                title: true,
                code: true,
                version: true,
                questions: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.database.inspectionResult.findMany({
          where: previousWhere,
          select: { status: true },
        }),
        this.database.station.count({ where: { active: true } }),
        this.database.station.count(),
      ]);
    const results = rawResults.filter((item) =>
      filters.result === 'pass'
        ? isPassed(item.status)
        : filters.result === 'fail'
          ? !isPassed(item.status)
          : true,
    );
    const previous = rawPrevious.filter((item) =>
      filters.result === 'pass'
        ? isPassed(item.status)
        : filters.result === 'fail'
          ? !isPassed(item.status)
          : true,
    );
    const passed = results.filter((item) => isPassed(item.status)).length;
    const previousPassed = previous.filter((item) =>
      isPassed(item.status),
    ).length;
    const percentageChange = (current: number, previous: number) =>
      previous > 0
        ? Math.round(((current - previous) / previous) * 1000) / 10
        : null;
    const inspectionsWithDuration = results.filter(
      (item) => item.durationSeconds !== null,
    );
    const median = (values: number[]) => {
      if (!values.length) return null;
      const sorted = [...values].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2
        ? sorted[middle]
        : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
    };
    const durationByForm = Array.from(
      inspectionsWithDuration
        .reduce((map, item) => {
          const current = map.get(item.form.code) ?? {
            formCode: item.form.code,
            formName: item.form.title,
            values: [] as number[],
          };
          current.values.push(item.durationSeconds!);
          map.set(item.form.code, current);
          return map;
        }, new Map<string, { formCode: string; formName: string; values: number[] }>())
        .values(),
    ).map((item) => ({
      formCode: item.formCode,
      formName: item.formName,
      medianSeconds: median(item.values),
      averageSeconds: Math.round(
        item.values.reduce((sum, value) => sum + value, 0) / item.values.length,
      ),
      sampleSize: item.values.length,
    }));
    const skippedQuestions = results.reduce((total, item) => {
      const answers = item.answers as unknown as InspectionAnswer[];
      return (
        total + answers.filter((answer) => !this.hasValue(answer.value)).length
      );
    }, 0);
    const unusuallyFast = inspectionsWithDuration.filter((item) => {
      const questions = item.form.questions as unknown as InspectionQuestion[];
      return item.durationSeconds! < Math.max(10, questions.length * 2);
    }).length;
    const totalQuestions = results.reduce(
      (total, item) =>
        total + (item.form.questions as unknown as InspectionQuestion[]).length,
      0,
    );
    const dayCount = Math.max(1, Math.ceil(periodMs / (24 * 60 * 60 * 1000)));
    const daily = Array.from({ length: dayCount }, (_, index) => {
      const date = new Date(from);
      date.setHours(0, 0, 0, 0);
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
    const stationMap = new Map(
      stations.map((station) => [station.code, station]),
    );
    const group = <T extends string>(
      key: (item: (typeof results)[number]) => T,
    ) =>
      Array.from(
        results
          .reduce((map, item) => {
            const value = key(item);
            const current = map.get(value) ?? {
              key: value,
              total: 0,
              passed: 0,
            };
            current.total += 1;
            if (isPassed(item.status)) current.passed += 1;
            map.set(value, current);
            return map;
          }, new Map<T, { key: T; total: number; passed: number }>())
          .values(),
      )
        .map((item) => ({
          ...item,
          passRate: item.total
            ? Math.round((item.passed / item.total) * 1000) / 10
            : 0,
        }))
        .sort((a, b) => b.total - a.total);
    const stationBreakdown = group((item) => item.stationId).map((item) => ({
      ...item,
      name: stationMap.get(item.key)?.name ?? item.key,
      process: stationMap.get(item.key)?.process?.name ?? null,
    }));
    const formBreakdown = group((item) => item.formId).map((item) => ({
      ...item,
      name: forms.find((form) => form.id === item.key)?.title ?? item.key,
    }));
    const questionStats = new Map<
      string,
      {
        key: string;
        label: string;
        formCode: string;
        total: number;
        nok: number;
        stations: Map<string, { total: number; nok: number }>;
      }
    >();
    for (const result of results) {
      const questions = result.form
        .questions as unknown as InspectionQuestion[];
      const answers = result.answers as unknown as InspectionAnswer[];
      const answerMap = new Map(
        answers.map((answer) => [answer.questionId, answer.value]),
      );
      for (const question of questions) {
        const assessment = this.assessAnswer(
          question,
          answerMap.get(question.id) ?? null,
        );
        if (!assessment) continue;
        const key = `${result.form.code}:${question.id}`;
        const stat = questionStats.get(key) ?? {
          key,
          label: question.label,
          formCode: result.form.code,
          total: 0,
          nok: 0,
          stations: new Map<string, { total: number; nok: number }>(),
        };
        stat.total += 1;
        if (assessment === 'NOK') stat.nok += 1;
        const station = stat.stations.get(result.stationId) ?? {
          total: 0,
          nok: 0,
        };
        station.total += 1;
        if (assessment === 'NOK') station.nok += 1;
        stat.stations.set(result.stationId, station);
        questionStats.set(key, stat);
      }
    }
    const questionTrends = Array.from(questionStats.values())
      .map((item) => ({
        key: item.key,
        label: item.label,
        formCode: item.formCode,
        total: item.total,
        nok: item.nok,
        nokRate: item.total
          ? Math.round((item.nok / item.total) * 1000) / 10
          : 0,
      }))
      .sort((a, b) => b.nok - a.nok || b.nokRate - a.nokRate)
      .slice(0, 20);
    const topQuestionKeys = questionTrends.slice(0, 10).map((item) => item.key);
    const heatmapStations = stationBreakdown
      .slice(0, 8)
      .map((item) => item.key);
    const questionStationCells = topQuestionKeys.flatMap((questionKey) =>
      heatmapStations.map((station) => {
        const value = questionStats.get(questionKey)?.stations.get(station);
        return {
          row: questionKey,
          column: station,
          total: value?.total ?? 0,
          nok: value?.nok ?? 0,
          rate: value?.total
            ? Math.round(((value.nok ?? 0) / value.total) * 1000) / 10
            : null,
        };
      }),
    );
    const timeCells = new Map<string, { total: number; nok: number }>();
    const productCells = new Map<string, { total: number; nok: number }>();
    const productCounts = new Map<string, number>();
    for (const result of results) {
      const day = result.createdAt.getDay().toString();
      const hour = result.createdAt.getHours().toString();
      const timeKey = `${day}:${hour}`;
      const timeCell = timeCells.get(timeKey) ?? { total: 0, nok: 0 };
      timeCell.total += 1;
      if (!isPassed(result.status)) timeCell.nok += 1;
      timeCells.set(timeKey, timeCell);
      const product =
        result.productFamily ?? result.partNumber ?? result.vinOrSerialNumber;
      productCounts.set(product, (productCounts.get(product) ?? 0) + 1);
      const productKey = `${result.form.code}:${product}`;
      const productCell = productCells.get(productKey) ?? { total: 0, nok: 0 };
      productCell.total += 1;
      if (!isPassed(result.status)) productCell.nok += 1;
      productCells.set(productKey, productCell);
    }
    const topProducts = Array.from(productCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([key]) => key);
    const heatmapForms = Array.from(
      new Map(
        results.map((item) => [item.form.code, item.form.title]),
      ).entries(),
    ).slice(0, 10);
    const rateCell = (value?: { total: number; nok: number }) => ({
      total: value?.total ?? 0,
      nok: value?.nok ?? 0,
      rate: value?.total
        ? Math.round(((value.nok ?? 0) / value.total) * 1000) / 10
        : null,
    });
    return {
      generatedAt: now,
      range: { from, to, previousFrom, previousTo: from },
      summary: {
        completedToday: results.length,
        passRate: results.length
          ? Math.round((passed / results.length) * 1000) / 10
          : 0,
        issuesToday: results.length - passed,
        completedTrend: percentageChange(results.length, previous.length),
        issuesTrend: percentageChange(
          results.length - passed,
          previous.length - previousPassed,
        ),
        activeStations,
        totalStations,
        mesSyncRate: results.length
          ? Math.round(
              (results.filter((item) => item.mesSynced).length /
                results.length) *
                1000,
            ) / 10
          : 0,
      },
      completeness: {
        medianDurationSeconds: median(
          inspectionsWithDuration.map((item) => item.durationSeconds!),
        ),
        averageDurationSeconds: inspectionsWithDuration.length
          ? Math.round(
              inspectionsWithDuration.reduce(
                (total, item) => total + item.durationSeconds!,
                0,
              ) / inspectionsWithDuration.length,
            )
          : null,
        durationSampleSize: inspectionsWithDuration.length,
        skippedQuestions,
        skippedRate: totalQuestions
          ? Math.round((skippedQuestions / totalQuestions) * 1000) / 10
          : 0,
        unusuallyFast,
        frequentCorrections: results.filter(
          (item) => item.answerCorrections >= 3,
        ).length,
        durationByForm: durationByForm.sort(
          (a, b) => b.sampleSize - a.sampleSize,
        ),
      },
      daily,
      breakdowns: { stations: stationBreakdown, forms: formBreakdown },
      questionTrends,
      heatmaps: {
        questionStation: {
          rows: questionTrends
            .slice(0, 10)
            .map((item) => ({ key: item.key, label: item.label })),
          columns: heatmapStations,
          cells: questionStationCells,
        },
        time: {
          rows: [
            { key: '1', label: 'Pon' },
            { key: '2', label: 'Wt' },
            { key: '3', label: 'Śr' },
            { key: '4', label: 'Czw' },
            { key: '5', label: 'Pt' },
            { key: '6', label: 'Sob' },
            { key: '0', label: 'Niedz' },
          ],
          columns: Array.from({ length: 24 }, (_, hour) => hour.toString()),
          cells: Array.from(
            { length: 7 },
            (_, dayIndex) => (dayIndex + 1) % 7,
          ).flatMap((day) =>
            Array.from({ length: 24 }, (_, hour) => ({
              row: day.toString(),
              column: hour.toString(),
              ...rateCell(timeCells.get(`${day}:${hour}`)),
            })),
          ),
        },
        formProduct: {
          rows: heatmapForms.map(([key, label]) => ({ key, label })),
          columns: topProducts,
          cells: heatmapForms.flatMap(([formCode]) =>
            topProducts.map((product) => ({
              row: formCode,
              column: product,
              ...rateCell(productCells.get(`${formCode}:${product}`)),
            })),
          ),
        },
      },
      filters: {
        processes: Array.from(
          new Map(
            stations
              .filter((item) => item.process)
              .map((item) => [item.process!.id, item.process!]),
          ).values(),
        ),
        stations: stations.map((item) => ({
          id: item.code,
          code: item.code,
          name: item.name,
          processId: item.processId,
        })),
        forms,
      },
      recent: results.slice(0, 100),
    };
  }

  async exportAnalytics(
    filters: {
      from?: string;
      to?: string;
      processId?: string;
      stationId?: string;
      formCode?: string;
      formIds?: string;
      result?: string;
      search?: string;
    },
    format: 'csv' | 'xlsx' | 'pdf',
  ) {
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 6);
    defaultFrom.setHours(0, 0, 0, 0);
    const from = filters.from ? new Date(filters.from) : defaultFrom;
    const to = filters.to ? new Date(filters.to) : now;
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from >= to ||
      to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000
    ) {
      throw new BadRequestException('Nieprawidłowy zakres dat');
    }
    const processStations = filters.processId
      ? await this.database.station.findMany({
          where: { processId: filters.processId },
          select: { code: true },
        })
      : [];
    const rows = await this.database.inspectionResult.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        ...(filters.stationId
          ? { stationId: filters.stationId }
          : filters.processId
            ? { stationId: { in: processStations.map((item) => item.code) } }
            : {}),
        ...(filters.formIds
          ? { formId: { in: filters.formIds.split(',').filter(Boolean) } }
          : filters.formCode
            ? { form: { code: filters.formCode } }
            : {}),
        ...(filters.search?.trim()
          ? {
              vinOrSerialNumber: {
                contains: filters.search.trim(),
                mode: 'insensitive',
              },
            }
          : {}),
      },
      select: {
        publicReportId: true,
        vinOrSerialNumber: true,
        stationId: true,
        status: true,
        mesSynced: true,
        partNumber: true,
        productFamily: true,
        createdAt: true,
        answers: true,
        form: {
          select: { code: true, title: true, version: true, questions: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50000,
    });
    const passedStatus = (status: string) =>
      ['PASSED', 'PASS', 'OK', 'ZDAŁ', 'ZDAL'].includes(status.toUpperCase());
    const filteredRows = rows.filter((row) =>
      filters.result === 'pass'
        ? passedStatus(row.status)
        : filters.result === 'fail'
          ? !passedStatus(row.status)
          : true,
    );
    const exportRows = filteredRows.map((row) => {
      const answers = row.answers as unknown as InspectionAnswer[];
      const answerMap = new Map(
        answers.map((answer) => [answer.questionId, answer.value]),
      );
      const questions = row.form.questions as unknown as InspectionQuestion[];
      const answerText = questions
        .map((question) => {
          const value = answerMap.get(question.id) ?? null;
          const assessment = this.assessAnswer(question, value);
          return `${question.label}: ${String(value ?? '')}${assessment ? ` [${assessment}]` : ''}`;
        })
        .join(' | ');
      return {
        completedAt: row.createdAt,
        serialNumber: row.vinOrSerialNumber,
        partNumber: row.partNumber ?? '',
        productFamily: row.productFamily ?? '',
        station: row.stationId,
        standardCode: row.form.code,
        standardName: row.form.title,
        revision: row.form.version,
        result: row.status,
        scadaSynced: row.mesSynced ? 'TAK' : 'NIE',
        reportId: row.publicReportId,
        answers: answerText,
      };
    });
    const dateStamp = now.toISOString().slice(0, 10);
    const columns = [
      ['completedAt', 'Data zakończenia'],
      ['serialNumber', 'Numer seryjny / VIN'],
      ['partNumber', 'Numer części'],
      ['productFamily', 'Rodzina produktu'],
      ['station', 'Stanowisko'],
      ['standardCode', 'Kod standardu'],
      ['standardName', 'Nazwa standardu'],
      ['revision', 'Rewizja'],
      ['result', 'Wynik'],
      ['scadaSynced', 'SCADA'],
      ['reportId', 'ID raportu'],
      ['answers', 'Odpowiedzi'],
    ] as const;
    if (format === 'csv') {
      const escape = (value: unknown) =>
        `"${String(value instanceof Date ? value.toISOString() : value).replaceAll('"', '""')}"`;
      const csv = [
        columns.map(([, label]) => escape(label)).join(';'),
        ...exportRows.map((row) =>
          columns.map(([key]) => escape(row[key])).join(';'),
        ),
      ].join('\r\n');
      return {
        filename: `inspect-hub-${dateStamp}.csv`,
        contentType: 'text/csv; charset=utf-8',
        buffer: Buffer.from(`\uFEFF${csv}`, 'utf8'),
      };
    }
    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Inspect Hub';
      workbook.created = now;
      const sheet = workbook.addWorksheet('Inspekcje', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });
      sheet.autoFilter = { from: 'A1', to: 'L1' };
      sheet.columns = columns.map(([key, header]) => ({
        key,
        header,
        width: key === 'answers' ? 70 : key === 'completedAt' ? 22 : 20,
      }));
      sheet.addRows(exportRows);
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF176F52' },
      };
      sheet.getColumn('completedAt').numFmt = 'yyyy-mm-dd hh:mm:ss';
      return {
        filename: `inspect-hub-${dateStamp}.xlsx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
      };
    }
    const dashboard = await this.getPublicDashboard(filters);
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const document = new PDFDocument({ size: 'A4', margin: 42 });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
      document.fontSize(20).fillColor('#176f52').text('Inspect Hub');
      document.fontSize(14).fillColor('#17211e').text('Raport analizy jakości');
      document.moveDown().fontSize(9).fillColor('#66736d');
      document.text(
        `Zakres: ${from.toLocaleString('pl-PL')} – ${to.toLocaleString('pl-PL')}`,
      );
      document.text(`Liczba inspekcji: ${dashboard.summary.completedToday}`);
      document.text(
        `First pass yield: ${dashboard.summary.passRate.toFixed(1)}%`,
      );
      document.text(`Niezgodności: ${dashboard.summary.issuesToday}`);
      document.text(
        `Synchronizacja SCADA: ${dashboard.summary.mesSyncRate.toFixed(1)}%`,
      );
      document
        .moveDown()
        .fontSize(12)
        .fillColor('#17211e')
        .text('Najczęstsze NOK');
      document.moveDown(0.4).fontSize(9);
      dashboard.questionTrends.slice(0, 15).forEach((item, index) => {
        document
          .fillColor('#2d3834')
          .text(
            `${index + 1}. ${item.label} (${item.formCode}) — ${item.nok}/${item.total} NOK, ${item.nokRate.toFixed(1)}%`,
          );
      });
      document.moveDown().fontSize(8).fillColor('#89938f');
      document.text(
        `Wygenerowano: ${now.toLocaleString('pl-PL')} · Inspect Hub`,
      );
      document.end();
    });
    return {
      filename: `inspect-hub-${dateStamp}.pdf`,
      contentType: 'application/pdf',
      buffer,
    };
  }

  async create(dto: CreateInspectionDto, operatorId: string | null) {
    if (dto.clientSubmissionId) {
      const existingSubmission =
        await this.database.inspectionResult.findUnique({
          where: { clientSubmissionId: dto.clientSubmissionId },
        });
      if (existingSubmission) return existingSubmission;
    }
    const form = await this.database.form.findUnique({
      where: { id: dto.formId },
      include: { processes: true },
    });
    if (!form) throw new NotFoundException('Nie znaleziono formularza');
    if (form.archivedAt) {
      throw new BadRequestException('Formularz jest zarchiwizowany');
    }
    if (form.requiresLogin && !operatorId) {
      throw new UnauthorizedException(
        'Ten formularz wymaga zalogowania operatora',
      );
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
    const automaticallyEvaluated =
      questions.some(
        (question) =>
          this.canAssessAutomatically(question) &&
          (question.isRequired || this.hasValue(answerMap.get(question.id))),
      ) &&
      questions.every(
        (question) =>
          !question.isRequired || this.canAssessAutomatically(question),
      );
    const status = automaticallyEvaluated
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
      const previousInspection = await database.inspectionResult.findFirst({
        where: {
          vinOrSerialNumber: dto.vinOrSerialNumber.trim(),
          form: { code: form.code },
        },
        select: { id: true, status: true, originalInspectionId: true },
        orderBy: { createdAt: 'desc' },
      });
      const originalInspectionId =
        previousInspection && !this.isPassed(previousInspection.status)
          ? (previousInspection.originalInspectionId ?? previousInspection.id)
          : undefined;
      const created = await database.inspectionResult.create({
        data: {
          publicReportId,
          clientSubmissionId: dto.clientSubmissionId,
          formId: form.id,
          vinOrSerialNumber: dto.vinOrSerialNumber.trim(),
          stationId,
          operatorId,
          status,
          answers: dto.answers as unknown as Prisma.InputJsonValue,
          durationSeconds: dto.durationSeconds,
          answerCorrections: dto.answerCorrections ?? 0,
          originalInspectionId,
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
      await database.auditEvent.create({
        data: this.events.buildData({
          type: 'INSPECTION_COMPLETED',
          category: 'QUALITY',
          severity: this.isPassed(status)
            ? EventSeverity.INFO
            : EventSeverity.WARNING,
          outcome: EventOutcome.SUCCESS,
          actorId: operatorId ?? undefined,
          actorType: operatorId ? 'USER' : 'ANONYMOUS',
          stationCode: stationId,
          entityType: 'InspectionResult',
          entityId: created.id,
          payload: {
            formCode: form.code,
            formVersion: form.version,
            status,
            isRetest: Boolean(originalInspectionId),
            originalInspectionId,
            routeCheckId: routeCheck?.id,
            scadaDeliveryRequired: scadaSettings.enabled,
          },
        }),
      });
      return created;
    });
    if (scadaSettings.enabled) void this.scadaConnector.processPending();
    this.qualityLive?.inspectionCompleted(result.id);
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
        originalInspection: {
          select: { publicReportId: true, createdAt: true },
        },
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
        severity: this.questionSeverity(question),
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
      retest: {
        isRetest: Boolean(result.originalInspection),
        originalReportId: result.originalInspection?.publicReportId ?? null,
        originalCompletedAt:
          result.originalInspection?.createdAt.toISOString() ?? null,
      },
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
    const assessed = questions
      .filter(
        (question) =>
          this.canAssessAutomatically(question) &&
          (question.isRequired || this.hasValue(answers.get(question.id))),
      )
      .map((question) =>
        this.assessAnswer(question, answers.get(question.id) ?? null),
      );
    const passed =
      assessed.length > 0 && assessed.every((item) => item === 'OK');
    const status = statuses.find((item) => this.isPassed(item) === passed);
    if (!status) {
      throw new BadRequestException(
        `Formularz nie ma skonfigurowanego statusu ${passed ? 'pozytywnego' : 'negatywnego'}`,
      );
    }
    return status;
  }

  private canAssessAutomatically(question: InspectionQuestion): boolean {
    return (
      question.expectedValue !== undefined ||
      (question.type === 'NUMBER_RANGE' && question.range !== undefined)
    );
  }

  private questionSeverity(
    question: InspectionQuestion,
  ): 'NORMAL' | 'MAJOR' | 'CRITICAL' {
    return question.severity ?? (question.isCritical ? 'CRITICAL' : 'NORMAL');
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
