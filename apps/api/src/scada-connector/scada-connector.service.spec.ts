import { BadGatewayException } from '@nestjs/common';
import { FormsService } from '../forms/forms.service';
import { DatabaseService } from '../database/database.service';
import { ScadaConnectorService } from './scada-connector.service';

describe('ScadaConnectorService', () => {
  const database = {
    station: { findUnique: jest.fn() },
    routeCheck: { create: jest.fn() },
    scadaSettings: { upsert: jest.fn() },
    scadaDelivery: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as DatabaseService;
  const matchedForm = {
    id: 'form-1',
    processIds: ['process-1'],
    partNumbers: ['PN-1', 'DEV-SERIAL'],
  };
  const forms = { findAll: jest.fn() };
  const service = new ScadaConnectorService(
    database,
    forms as unknown as FormsService,
  );

  const originalEnvironment = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    forms.findAll.mockResolvedValue([matchedForm]);
    (database.station.findUnique as jest.Mock).mockResolvedValue({
      active: true,
      process: { id: 'process-1', name: 'ST-10' },
    });
    (database.scadaSettings.upsert as jest.Mock).mockResolvedValue({
      enabled: true,
      baseUrl: 'http://scada.local',
      routeCheckPath: '/route-check',
      submitResultPath: '/result',
      unitHistoryPath: '/std_public/unithistory',
      publicWebUrl: 'http://localhost:5173',
      timeoutMs: 5000,
    });
    (database.routeCheck.create as jest.Mock).mockResolvedValue({
      id: 'route-1',
    });
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    jest.restoreAllMocks();
  });

  it('normalizes and saves the configured unit history path', async () => {
    await service.updateSettings(
      {
        enabled: true,
        baseUrl: 'http://scada.local/',
        routeCheckPath: 'route-check',
        submitResultPath: '/result',
        unitHistoryPath: 'std_public/unithistory',
        publicWebUrl: 'http://localhost:5173/',
        timeoutMs: 5000,
      },
      'admin-1',
    );

    expect(database.scadaSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          unitHistoryPath: '/std_public/unithistory',
        }),
      }),
    );
  });

  it.each(['production', 'test', 'development', undefined])(
    'uses live SCADA selected in admin with NODE_ENV=%s',
    async (nodeEnv) => {
      if (nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = nodeEnv;
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            allowed: true,
            serverUrl: 'http://scada-history.local/SN-1',
            product: { partNumber: 'PN-1', productFamily: 'EXAMPLE' },
          }),
          { status: 200 },
        ),
      );

      const result = await service.routeCheck(' sn-1 ', 'st-10');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://scada.local/route-check',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ serialNumber: 'SN-1', processName: 'ST-10' }),
        }),
      );
      expect(result).toEqual({
        allowed: true,
        serverUrl: 'http://scada-history.local/SN-1',
        product: { partNumber: 'PN-1', productFamily: 'EXAMPLE' },
        routeCheckId: 'route-1',
        form: matchedForm,
        integrationEnabled: true,
      });
      expect(database.routeCheck.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ serialNumber: 'SN-1' }),
      });
    },
  );

  it.each([
    ['no match', []],
    ['wrong process', [{ ...matchedForm, processIds: ['other'] }]],
    ['wrong part number', [{ ...matchedForm, partNumbers: ['OTHER'] }]],
  ])('blocks inspection for %s', async (_label, candidates) => {
    forms.findAll.mockResolvedValue(candidates);
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          allowed: true,
          serverUrl: 'http://scada.local',
          product: { partNumber: 'PN-1', productFamily: 'FAMILY' },
        }),
        { status: 200 },
      ),
    );
    await expect(service.routeCheck('SN-1', 'ST-10')).rejects.toThrow(
      /formularz/,
    );
    expect(database.routeCheck.create).not.toHaveBeenCalled();
  });

  it('rejects an allowed response without complete product data', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ allowed: true }), { status: 200 }),
      );

    await expect(service.routeCheck('SN-1', 'ST-10')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('offers matching forms and binds route approval to the operator selection', async () => {
    const secondForm = { ...matchedForm, id: 'form-2' };
    forms.findAll.mockResolvedValue([
      matchedForm,
      secondForm,
      { ...matchedForm, id: 'wrong-process', processIds: ['other'] },
      { ...matchedForm, id: 'wrong-pn', partNumbers: ['OTHER'] },
    ]);
    jest.spyOn(global, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            allowed: true,
            serverUrl: 'http://scada.local',
            product: { partNumber: 'PN-1', productFamily: 'FAMILY' },
          }),
          { status: 200 },
        ),
    );

    await expect(service.routeCheck('SN-1', 'ST-10')).resolves.toMatchObject({
      routeCheckId: null,
      forms: [matchedForm, secondForm],
    });
    expect(database.routeCheck.create).not.toHaveBeenCalled();

    await expect(
      service.routeCheck('SN-1', 'ST-10', secondForm.id),
    ).resolves.toMatchObject({ routeCheckId: 'route-1', form: secondForm });
    expect(database.routeCheck.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ formId: secondForm.id }),
    });
  });

  it.each(['wrong-process', 'wrong-pn', 'unknown'])(
    'rejects a selected form that does not match: %s',
    async (formId) => {
      forms.findAll.mockResolvedValue([
        matchedForm,
        { ...matchedForm, id: 'wrong-process', processIds: ['other'] },
        { ...matchedForm, id: 'wrong-pn', partNumbers: ['OTHER'] },
      ]);
      jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            allowed: true,
            serverUrl: 'http://scada.local',
            product: { partNumber: 'PN-1', productFamily: 'FAMILY' },
          }),
          { status: 200 },
        ),
      );
      await expect(service.routeCheck('SN-1', 'ST-10', formId)).rejects.toThrow(
        'Wybrany formularz nie pasuje',
      );
      expect(database.routeCheck.create).not.toHaveBeenCalled();
    },
  );

  it.each(['production', 'test', 'development', undefined])(
    'uses simulation selected in admin with NODE_ENV=%s',
    async (nodeEnv) => {
      if (nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = nodeEnv;
      const fetchMock = jest.spyOn(global, 'fetch');
      (database.scadaSettings.upsert as jest.Mock).mockResolvedValue({
        enabled: false,
        baseUrl: '',
        routeCheckPath: '/route-check',
        submitResultPath: '/result',
        unitHistoryPath: '/std_public/unithistory',
        publicWebUrl: 'http://localhost:5173',
        timeoutMs: 5000,
      });
      (database.routeCheck.create as jest.Mock)
        .mockResolvedValueOnce({ id: 'dev-ok' })
        .mockResolvedValueOnce({ id: 'dev-nok' });

      await expect(service.routeCheck('SERIAL', 'ST-10')).rejects.toThrow(
        'W trybie symulacji SCADA',
      );
      await expect(
        service.routeCheck('SERIAL_OK', 'ST-10'),
      ).resolves.toMatchObject({
        allowed: true,
        routeCheckId: 'dev-ok',
        product: { partNumber: 'DEV-SERIAL', productFamily: 'DEV' },
      });
      await expect(service.routeCheck('SERIAL_NOK', 'ST-10')).resolves.toEqual({
        allowed: false,
        routeCheckId: 'dev-nok',
        integrationEnabled: true,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('switches modes after saving admin settings without restarting the service', async () => {
    let settings = await service.getSettings();
    (database.scadaSettings.upsert as jest.Mock).mockImplementation(
      ({ update }: { update: Partial<typeof settings> }) => {
        settings = { ...settings, ...update };
        return Promise.resolve(settings);
      },
    );
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          allowed: true,
          serverUrl: 'http://scada.local/history',
          product: { partNumber: 'PN-1', productFamily: 'FAMILY' },
        }),
        { status: 200 },
      ),
    );

    await service.updateSettings({ ...settings, enabled: false }, 'admin-1');
    await expect(
      service.routeCheck('SERIAL_NOK', 'ST-10'),
    ).resolves.toMatchObject({ allowed: false });
    expect(fetchMock).not.toHaveBeenCalled();

    await service.updateSettings({ ...settings, enabled: true }, 'admin-1');
    await expect(service.routeCheck('SERIAL', 'ST-10')).resolves.toMatchObject({
      allowed: true,
      product: { partNumber: 'PN-1' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await service.updateSettings({ ...settings, enabled: false }, 'admin-1');
    await expect(
      service.routeCheck('SERIAL_NOK', 'ST-10'),
    ).resolves.toMatchObject({ allowed: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
