import { BadGatewayException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ScadaConnectorService } from './scada-connector.service';

describe('ScadaConnectorService', () => {
  const database = {
    station: { findUnique: jest.fn() },
    routeCheck: { create: jest.fn() },
    scadaSettings: { upsert: jest.fn() },
    scadaDelivery: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as DatabaseService;
  const service = new ScadaConnectorService(database);

  beforeEach(() => {
    jest.clearAllMocks();
    (database.station.findUnique as jest.Mock).mockResolvedValue({
      active: true,
      process: { name: 'ST-10' },
    });
    (database.scadaSettings.upsert as jest.Mock).mockResolvedValue({
      enabled: true,
      baseUrl: 'http://scada.local',
      routeCheckPath: '/route-check',
      submitResultPath: '/result',
      publicWebUrl: 'http://localhost:5173',
      timeoutMs: 5000,
    });
    (database.routeCheck.create as jest.Mock).mockResolvedValue({
      id: 'route-1',
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('sends the agreed route-check contract and stores an allowed result', async () => {
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

    const result = await service.routeCheck('SN-1', 'st-10');

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
      integrationEnabled: true,
    });
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

  it('blocks inspections when the SCADA connector is disabled', async () => {
    (database.scadaSettings.upsert as jest.Mock).mockResolvedValue({
      enabled: false,
      baseUrl: '',
      routeCheckPath: '/route-check',
      submitResultPath: '/result',
      publicWebUrl: 'http://localhost:5173',
      timeoutMs: 5000,
    });

    await expect(service.routeCheck('SN123_OK', 'ST-10')).rejects.toThrow(
      'Connector SCADA jest wyłączony',
    );
    expect((database.routeCheck.create as jest.Mock).mock.calls).toHaveLength(
      0,
    );
  });

  it('simulates _OK and _NOK locally when SCADA is disabled in development', async () => {
    process.env.NODE_ENV = 'development';
    (database.scadaSettings.upsert as jest.Mock).mockResolvedValue({
      enabled: false,
      baseUrl: '',
      routeCheckPath: '/route-check',
      submitResultPath: '/result',
      publicWebUrl: 'http://localhost:5173',
      timeoutMs: 5000,
    });
    (database.routeCheck.create as jest.Mock)
      .mockResolvedValueOnce({ id: 'dev-ok' })
      .mockResolvedValueOnce({ id: 'dev-nok' });

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
    process.env.NODE_ENV = 'test';
  });
});
