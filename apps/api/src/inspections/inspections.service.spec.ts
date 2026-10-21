import { NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ScadaConnectorService } from '../scada-connector/scada-connector.service';
import { InspectionsService } from './inspections.service';
import { EventsService } from '../observability/events.service';

describe('InspectionsService public reports', () => {
  const publicReportId = '9f466df4-ffbc-47ad-96c2-4b633f06a334';
  const findUniqueReport = jest.fn();
  const findManyResults = jest.fn();
  const findUniqueStation = jest.fn();
  const findManyStations = jest.fn();
  const findManyForms = jest.fn();
  const countStations = jest.fn();
  const createResult = jest.fn();
  const createScadaDelivery = jest.fn();
  const findFirstResult = jest.fn().mockResolvedValue(null);
  const transactionClient = {
    inspectionResult: { create: createResult, findFirst: findFirstResult },
    scadaDelivery: { create: createScadaDelivery },
    auditEvent: { create: jest.fn() },
  };
  const runTransaction = (
    callback: (client: typeof transactionClient) => Promise<unknown>,
  ) => callback(transactionClient);
  const database = {
    inspectionResult: {
      findUnique: findUniqueReport,
      findMany: findManyResults,
      create: createResult,
    },
    station: {
      findUnique: findUniqueStation,
      findMany: findManyStations,
      count: countStations,
    },
    form: { findUnique: jest.fn(), findMany: findManyForms },
    routeCheck: { findUnique: jest.fn() },
    $transaction: jest.fn(runTransaction),
  } as unknown as DatabaseService;
  const scadaConnector = {
    getSettings: jest.fn().mockResolvedValue({
      enabled: false,
      publicWebUrl: 'http://localhost:5173',
      unitHistoryPath: '/std_public/unithistory',
    }),
    processPending: jest.fn(),
  } as unknown as ScadaConnectorService;
  const events = {
    buildData: jest.fn().mockReturnValue({}),
  } as unknown as EventsService;
  const service = new InspectionsService(database, scadaConnector, events);

  beforeEach(() => {
    jest.clearAllMocks();
    findUniqueReport.mockResolvedValue(null);
    (database.routeCheck.findUnique as jest.Mock).mockResolvedValue({
      id: 'route-check-1',
      formId: 'form-1',
      allowed: true,
      serialNumber: 'SN-100',
      stationCode: 'ST-01',
    });
  });

  it('counts active stations from station configuration', async () => {
    findManyResults.mockResolvedValue([]);
    findManyStations.mockResolvedValue([]);
    findManyForms.mockResolvedValue([]);
    countStations.mockResolvedValueOnce(4).mockResolvedValueOnce(9);

    const dashboard = await service.getPublicDashboard();

    expect(countStations).toHaveBeenCalledWith({ where: { active: true } });
    expect(dashboard.summary.activeStations).toBe(4);
    expect(dashboard.summary.totalStations).toBe(9);
  });

  it.each([
    ['2026-10-19T22:00:00.000Z', '2026-10-20T21:59:59.999Z', ['2026-10-20']],
    ['2026-10-24T22:00:00.000Z', '2026-10-25T22:59:59.999Z', ['2026-10-25']],
    ['2026-03-28T23:00:00.000Z', '2026-03-29T21:59:59.999Z', ['2026-03-29']],
    [
      '2026-10-23T22:00:00.000Z',
      '2026-10-26T22:59:59.999Z',
      ['2026-10-24', '2026-10-25', '2026-10-26'],
    ],
  ])(
    'groups complete local days across DST: %s to %s',
    async (from, to, dates) => {
      const result = (createdAt: string) => ({
        publicReportId: 'report',
        vinOrSerialNumber: 'SN-1',
        formId: 'form-1',
        status: 'PASSED',
        stationId: 'ST-01',
        createdAt: new Date(createdAt),
        durationSeconds: null,
        answers: [],
        answerCorrections: [],
        originalInspectionId: null,
        form: { code: 'QC-01', title: 'Kontrola', questions: [] },
      });
      findManyResults
        .mockResolvedValueOnce([result(from), result(to)])
        .mockResolvedValueOnce([]);
      findManyStations.mockResolvedValue([]);
      findManyForms.mockResolvedValue([]);
      countStations.mockResolvedValue(0);

      const dashboard = await service.getPublicDashboard({
        from,
        to,
        timeZone: 'Europe/Warsaw',
      });

      expect(findManyResults).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { createdAt: { gte: new Date(from), lte: new Date(to) } },
        }),
      );
      expect(dashboard.daily.map((day) => day.date)).toEqual(dates);
      expect(dashboard.daily.reduce((sum, day) => sum + day.total, 0)).toBe(2);
      expect(dashboard.daily[0].total).toBe(dates.length === 1 ? 2 : 1);
      expect(dashboard.daily.at(-1)?.total).toBe(dates.length === 1 ? 2 : 1);
    },
  );

  it('returns a minimal public report based on the stored form revision', async () => {
    findUniqueReport.mockResolvedValue({
      id: 'result-original',
      publicReportId,
      vinOrSerialNumber: 'SN-100',
      stationId: 'ST-01',
      status: 'PASSED',
      answers: [
        { questionId: 'q1', value: true },
        { questionId: 'q2', value: 11 },
        { questionId: 'photo', value: 'actual.jpg' },
      ],
      mesSynced: true,
      scadaServerUrl: 'http://scada.local/unit/SN-100',
      createdAt: new Date('2026-08-09T10:00:00Z'),
      originalInspectionId: null,
      originalInspection: null,
      operator: { name: 'Jan Kowalski' },
      form: {
        code: 'QC-01',
        title: 'Kontrola końcowa',
        version: 3,
        questions: [
          {
            id: 'q1',
            label: 'Mocowanie',
            type: 'CHECKBOX',
            isRequired: true,
            expectedValue: true,
          },
          {
            id: 'q2',
            label: 'Wymiar',
            type: 'NUMBER_RANGE',
            isRequired: true,
            range: { min: 10, max: 12 },
          },
          {
            id: 'photo',
            label: 'Zdjęcie',
            type: 'PHOTO_UPLOAD',
            isRequired: true,
            expectedValue: 'legacy.jpg',
          },
        ],
      },
    });
    findUniqueStation.mockResolvedValue({
      name: 'Linia 1',
      process: { name: 'Montaż' },
    });
    findManyResults.mockResolvedValue([
      {
        id: 'result-original',
        publicReportId,
        status: 'PASSED',
        createdAt: new Date('2026-08-09T10:00:00Z'),
      },
    ]);

    const report = await service.getPublicReport(publicReportId);

    expect(findUniqueReport).toHaveBeenCalledWith(
      expect.objectContaining({ where: { publicReportId } }),
    );
    expect(report).toMatchObject({
      serialNumber: 'SN-100',
      form: { code: 'QC-01', version: 3 },
      summary: { total: 3, passed: 2, failed: 0 },
      externalSyncStatus: 'SYNCED',
      retest: {
        reports: [
          {
            reportId: publicReportId,
            isOriginal: true,
            isCurrent: true,
          },
        ],
      },
      scadaUnitHistoryUrl:
        'http://scada.local/std_public/unithistory?unit=SN-100',
    });
    expect(
      report.answers.find((answer) => answer.questionId === 'photo')
        ?.assessment,
    ).toBeNull();
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('operatorId');
    expect(serialized).not.toContain('email');
    expect(serialized).not.toContain('role');
  });

  it('returns the original report and every related retest', async () => {
    findUniqueReport.mockResolvedValue({
      id: 'result-retest-2',
      publicReportId: 'report-retest-2',
      vinOrSerialNumber: 'SN-100',
      stationId: 'ST-01',
      status: 'PASSED',
      answers: [],
      mesSynced: true,
      partNumber: null,
      productFamily: null,
      scadaServerUrl: null,
      createdAt: new Date('2026-08-11T10:00:00Z'),
      originalInspectionId: 'result-original',
      originalInspection: {
        id: 'result-original',
        publicReportId: 'report-original',
        createdAt: new Date('2026-08-09T10:00:00Z'),
      },
      operator: { name: 'Jan Kowalski' },
      form: {
        code: 'QC-01',
        title: 'Kontrola końcowa',
        version: 3,
        questions: [],
      },
    });
    findUniqueStation.mockResolvedValue({
      name: 'Linia 1',
      process: { name: 'Montaż' },
    });
    findManyResults.mockResolvedValue([
      {
        id: 'result-original',
        publicReportId: 'report-original',
        status: 'FAILED',
        createdAt: new Date('2026-08-09T10:00:00Z'),
      },
      {
        id: 'result-retest-1',
        publicReportId: 'report-retest-1',
        status: 'FAILED',
        createdAt: new Date('2026-08-10T10:00:00Z'),
      },
      {
        id: 'result-retest-2',
        publicReportId: 'report-retest-2',
        status: 'PASSED',
        createdAt: new Date('2026-08-11T10:00:00Z'),
      },
    ]);

    const report = await service.getPublicReport('report-retest-2');

    expect(findManyResults).toHaveBeenCalledWith({
      where: {
        OR: [
          { id: 'result-original' },
          { originalInspectionId: 'result-original' },
        ],
      },
      select: {
        id: true,
        publicReportId: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(report.retest.reports).toEqual([
      expect.objectContaining({
        reportId: 'report-original',
        isOriginal: true,
        isCurrent: false,
      }),
      expect.objectContaining({
        reportId: 'report-retest-1',
        isOriginal: false,
        isCurrent: false,
      }),
      expect.objectContaining({
        reportId: 'report-retest-2',
        isOriginal: false,
        isCurrent: true,
      }),
    ]);
  });

  it('throws 404 for an unknown publicReportId', async () => {
    findUniqueReport.mockResolvedValue(null);
    await expect(service.getPublicReport('unknown')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('generates a different cryptographically random publicReportId for every new inspection', async () => {
    const generatedIds: string[] = [];
    const form = {
      id: 'form-1',
      code: 'QC-01',
      allowedStatuses: ['PASSED'],
      questions: [],
      processes: [{ id: 'process-1' }],
    };
    (database.form.findUnique as jest.Mock).mockResolvedValue(form);
    findUniqueStation.mockResolvedValue({
      active: true,
      processId: 'process-1',
      process: { id: 'process-1' },
    });
    createResult.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        generatedIds.push(String(data.publicReportId));
        return Promise.resolve({
          id: `result-${createResult.mock.calls.length}`,
          ...data,
          createdAt: new Date('2026-08-09T10:00:00Z'),
          mesSynced: false,
        });
      },
    );

    const dto = {
      formId: 'form-1',
      vinOrSerialNumber: ' sn-100 ',
      routeCheckId: 'route-check-1',
      stationId: 'ST-01',
      status: 'PASSED',
      answers: [],
    };
    await service.create(dto, 'operator-1');
    await service.create(dto, 'operator-1');

    expect(generatedIds[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(generatedIds[0]).not.toBe(generatedIds[1]);
    expect(createResult).toHaveBeenCalledWith({
      data: expect.objectContaining({ vinOrSerialNumber: 'SN-100' }),
    });
  });

  it('determines the final status from answers when every expected value is configured', async () => {
    (database.form.findUnique as jest.Mock).mockResolvedValue({
      id: 'form-1',
      code: 'QC-01',
      allowedStatuses: ['PASSED', 'FAILED'],
      questions: [
        {
          id: 'q1',
          label: 'Mocowanie',
          type: 'CHECKBOX',
          isRequired: true,
          expectedValue: true,
        },
      ],
      processes: [{ id: 'process-1' }],
    });
    findUniqueStation.mockResolvedValue({
      active: true,
      processId: 'process-1',
      process: { id: 'process-1' },
    });
    createResult.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'result-1', ...data }),
    );

    await service.create(
      {
        formId: 'form-1',
        vinOrSerialNumber: 'SN-100',
        stationId: 'ST-01',
        status: 'PASSED',
        answers: [{ questionId: 'q1', value: false }],
        routeCheckId: 'route-check-1',
      },
      'operator-1',
    );

    const [createCall] = createResult.mock.calls as [
      [{ data: { status: string } }],
    ];
    expect(createCall[0].data.status).toBe('FAILED');
  });

  it.each([
    [true, undefined, 'PASSED'],
    [false, undefined, 'FAILED'],
    [true, 'legacy.jpg', 'PASSED'],
    [false, 'legacy.jpg', 'FAILED'],
  ])(
    'ignores required photos when assessing answer %s with photo expectation %s',
    async (value, expectedValue, expectedStatus) => {
      (database.form.findUnique as jest.Mock).mockResolvedValue({
        id: 'form-1',
        code: 'QC-01',
        allowedStatuses: ['PASSED', 'FAILED'],
        questions: [
          {
            id: 'q1',
            label: 'Mocowanie',
            type: 'CHECKBOX',
            isRequired: true,
            expectedValue: true,
          },
          {
            id: 'photo',
            label: 'Zdjęcie',
            type: 'PHOTO_UPLOAD',
            isRequired: true,
            expectedValue,
          },
        ],
        processes: [{ id: 'process-1' }],
      });
      findUniqueStation.mockResolvedValue({
        active: true,
        processId: 'process-1',
        process: { id: 'process-1' },
      });
      createResult.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'result-1', ...data }),
      );

      await service.create(
        {
          formId: 'form-1',
          vinOrSerialNumber: 'SN-100',
          stationId: 'ST-01',
          status: value ? 'FAILED' : 'PASSED',
          answers: [
            { questionId: 'q1', value },
            { questionId: 'photo', value: 'actual.jpg' },
          ],
          routeCheckId: 'route-check-1',
        },
        'operator-1',
      );

      const [createCall] = createResult.mock.calls as [
        [{ data: { status: string } }],
      ];
      expect(createCall[0].data.status).toBe(expectedStatus);
    },
  );

  it.each([true, false])(
    'rejects a form different from the route check with live SCADA=%s',
    async (enabled) => {
      (database.form.findUnique as jest.Mock).mockResolvedValue({
        id: 'form-1',
        code: 'QC-01',
        allowedStatuses: ['PASSED'],
        questions: [],
        processes: [{ id: 'process-1' }],
      });
      findUniqueStation.mockResolvedValue({
        active: true,
        processId: 'process-1',
        process: { id: 'process-1', name: 'Montaż' },
      });
      (database.routeCheck.findUnique as jest.Mock).mockResolvedValue({
        id: 'route-check-1',
        formId: 'other-form',
        allowed: true,
        serialNumber: 'SN-100',
        stationCode: 'ST-01',
        processName: 'Montaż',
      });
      (scadaConnector.getSettings as jest.Mock).mockResolvedValueOnce({
        enabled,
      });
      await expect(
        service.create(
          {
            formId: 'form-1',
            vinOrSerialNumber: 'SN-100',
            stationId: 'ST-01',
            status: 'PASSED',
            answers: [],
            routeCheckId: 'route-check-1',
          },
          'operator-1',
        ),
      ).rejects.toThrow('Formularz nie odpowiada dopasowaniu');
      expect(createResult).not.toHaveBeenCalled();
    },
  );

  it('sends only the report UUID as reportUrl to SCADA', async () => {
    (database.form.findUnique as jest.Mock).mockResolvedValue({
      id: 'form-1',
      code: 'QC-01',
      allowedStatuses: ['PASSED'],
      questions: [],
      processes: [{ id: 'process-1' }],
    });
    findUniqueStation.mockResolvedValue({
      active: true,
      processId: 'process-1',
      process: { id: 'process-1', name: 'Montaż' },
    });
    (database.routeCheck.findUnique as jest.Mock).mockResolvedValue({
      id: 'route-check-1',
      formId: 'form-1',
      allowed: true,
      serialNumber: 'SN-100',
      stationCode: 'ST-01',
      processName: 'Montaż',
    });
    findUniqueReport.mockResolvedValueOnce(null);
    (scadaConnector.getSettings as jest.Mock).mockResolvedValueOnce({
      enabled: true,
      publicWebUrl: 'https://inspect.example',
    });
    createResult.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'result-1', ...data }),
    );

    await service.create(
      {
        formId: 'form-1',
        vinOrSerialNumber: 'SN-100',
        stationId: 'ST-01',
        status: 'PASSED',
        answers: [],
        routeCheckId: 'route-check-1',
      },
      'operator-1',
    );

    const publicReportId =
      createResult.mock.calls.at(-1)?.[0].data.publicReportId;
    expect(createScadaDelivery).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payload: expect.objectContaining({ reportUrl: publicReportId }),
      }),
    });
    expect(publicReportId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
