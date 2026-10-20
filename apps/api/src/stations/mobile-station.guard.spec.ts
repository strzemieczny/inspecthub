import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { MobileStationGuard } from './mobile-station.guard';
import { StationsService } from './stations.service';

function context(
  headers: Record<string, string | undefined>,
  body: Record<string, unknown> = { stationCode: 'ST-01' },
) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        get: (key: string) => headers[key],
        body,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('MobileStationGuard', () => {
  const stations = { currentMobile: jest.fn() };
  const guard = new MobileStationGuard(stations as unknown as StationsService);
  beforeEach(() => jest.resetAllMocks());

  it('keeps the existing browser flow without mobile headers', async () => {
    expect(await guard.canActivate(context({}))).toBe(true);
    expect(stations.currentMobile).not.toHaveBeenCalled();
  });

  it.each([
    { 'x-device-id': 'uuid' },
    { 'x-device-token': 'token' },
    { 'x-device-id': 'uuid', 'x-device-token': 'token' },
  ])(
    'validates any request declaring mobile credentials (%j)',
    async (headers) => {
      stations.currentMobile.mockRejectedValue(new ForbiddenException());
      await expect(guard.canActivate(context(headers))).rejects.toThrow(
        ForbiddenException,
      );
      expect(stations.currentMobile).toHaveBeenCalledWith(
        headers['x-device-id'],
        headers['x-device-token'],
        'ST-01',
      );
    },
  );

  it('resolves stationId from inspection submission payloads', async () => {
    await guard.canActivate(
      context(
        { 'x-device-id': 'uuid', 'x-device-token': 'token' },
        { stationId: 'ST-02' },
      ),
    );
    expect(stations.currentMobile).toHaveBeenCalledWith(
      'uuid',
      'token',
      'ST-02',
    );
  });

  it('does not let an invalid body bypass station matching', async () => {
    await guard.canActivate(
      context(
        { 'x-device-id': 'uuid', 'x-device-token': 'token' },
        { stationCode: 123 },
      ),
    );
    expect(stations.currentMobile).toHaveBeenCalledWith('uuid', 'token', '');
  });
});
