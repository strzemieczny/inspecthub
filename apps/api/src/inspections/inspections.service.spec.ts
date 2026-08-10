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
  const countStations = jest.fn();
  const createResult = jest.fn();
  const transactionClient = {
    inspectionResult: { create: createResult },
    scadaDelivery: { create: jest.fn() },
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
    station: { findUnique: findUniqueStation, count: countStations },
    form: { findUnique: jest.fn() },
    routeCheck: { findUnique: jest.fn() },
    $transaction: jest.fn(runTransaction),
  } as unknown as DatabaseService;
  const scadaConnector = {
    getSettings: jest.fn().mockResolvedValue({
      enabled: false,
      publicWebUrl: 'http://localhost:5173',
    }),
    processPending: jest.fn(),
  } as unknown as ScadaConnectorService;
  const events = {
    buildData: jest.fn().mockReturnValue({}),
  } as unknown as EventsService;
  const service = new InspectionsService(database, scadaConnector, events);

  beforeEach(() => jest.clearAllMocks());

  it('counts active stations from station configuration', async () => {
    findManyResults.mockResolvedValue([]);
    countStations.mockResolvedValueOnce(4).mockResolvedValueOnce(9);

    const dashboard = await service.getPublicDashboard();

    expect(countStations).toHaveBeenCalledWith({ where: { active: true } });
    expect(dashboard.summary.activeStations).toBe(4);
    expect(dashboard.summary.totalStations).toBe(9);
  });

  it('returns a minimal public report based on the stored form revision', async () => {
    findUniqueReport.mockResolvedValue({
      publicReportId,
      vinOrSerialNumber: 'SN-100',
      stationId: 'ST-01',
      status: 'PASSED',
      answers: [
        { questionId: 'q1', value: true },
        { questionId: 'q2', value: 11 },
      ],
      mesSynced: true,
      scadaServerUrl: 'http://scada.local',
      createdAt: new Date('2026-08-09T10:00:00Z'),
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
        ],
      },
    });
    findUniqueStation.mockResolvedValue({
      name: 'Linia 1',
      process: { name: 'Montaż' },
    });

    const report = await service.getPublicReport(publicReportId);

    expect(findUniqueReport).toHaveBeenCalledWith(
      expect.objectContaining({ where: { publicReportId } }),
    );
    expect(report).toMatchObject({
      serialNumber: 'SN-100',
      form: { code: 'QC-01', version: 3 },
      summary: { total: 2, passed: 2, failed: 0 },
      externalSyncStatus: 'SYNCED',
      scadaUnitHistoryUrl: 'http://scada.local/unithistory?unit=SN-100',
    });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('operatorId');
    expect(serialized).not.toContain('email');
    expect(serialized).not.toContain('role');
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
      vinOrSerialNumber: 'SN-100',
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
      },
      'operator-1',
    );

    const [createCall] = createResult.mock.calls as [
      [{ data: { status: string } }],
    ];
    expect(createCall[0].data.status).toBe('FAILED');
  });
});
