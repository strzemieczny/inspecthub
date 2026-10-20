import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@inspect-hub/database';
import { createHash } from 'node:crypto';
import { StationsService } from './stations.service';

const deviceId = 'd17c45ab-73d2-435a-bf53-35d0a940b34e';
const token = 'ab'.repeat(32);
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const station = {
  id: 'station-1',
  code: 'ST-01',
  name: 'Inspection',
  processId: 'process-1',
  active: true,
  mobileDeviceId: null as string | null,
  mobileDeviceTokenHash: null as string | null,
};

describe('Mobile station bindings', () => {
  const database = {
    station: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const service = new StationsService(database as never);

  beforeEach(() => {
    jest.resetAllMocks();
    database.$transaction.mockImplementation(
      (callback: (db: typeof database) => unknown) => callback(database),
    );
    database.station.findUnique.mockImplementation(
      (args: { where: { mobileDeviceId?: string } }) =>
        Promise.resolve(args.where.mobileDeviceId ? null : station),
    );
    database.station.update.mockResolvedValue({
      id: station.id,
      code: station.code,
    });
  });

  it('pairs using a secret hash without binding the tablet to its IP', async () => {
    await expect(
      service.pairMobile({ code: ' st-01 ', deviceId }, token),
    ).resolves.toEqual({
      station: { id: station.id, code: station.code },
      deviceToken: token,
    });
    expect(database.station.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          mobileDeviceId: deviceId,
          mobileDeviceTokenHash: hash(token),
          mobileLastSeenAt: expect.any(Date) as Date,
        },
      }),
    );
    const selection = database.station.update.mock.calls[0][0] as {
      select: Record<string, boolean>;
    };
    expect(selection.select).not.toHaveProperty('mobileDeviceTokenHash');
    expect(database.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('retries a pairing after a lost response without changing the token', async () => {
    database.station.findUnique.mockResolvedValue({
      ...station,
      mobileDeviceId: deviceId,
      mobileDeviceTokenHash: hash(token),
    });
    const first = await service.pairMobile(
      { code: station.code, deviceId },
      token,
    );
    const retry = await service.pairMobile(
      { code: station.code, deviceId },
      token,
    );
    expect(first.deviceToken).toBe(retry.deviceToken);
  });

  it.each([undefined, 'cd'.repeat(32)])(
    'does not allow UUID alone or another token to reclaim an installation (%s)',
    async (secret) => {
      database.station.findUnique.mockResolvedValue({
        ...station,
        mobileDeviceId: deviceId,
        mobileDeviceTokenHash: hash(token),
      });
      await expect(
        service.pairMobile({ code: station.code, deviceId }, secret),
      ).rejects.toThrow(ForbiddenException);
      expect(database.station.update).not.toHaveBeenCalled();
    },
  );

  it('rejects another tablet taking an occupied station', async () => {
    database.station.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...station, mobileDeviceId: 'other-device' });
    await expect(
      service.pairMobile({ code: station.code, deviceId }, token),
    ).rejects.toThrow(ConflictException);
    expect(database.station.update).not.toHaveBeenCalled();
  });

  it('releases the old station when an authenticated tablet moves', async () => {
    database.station.findUnique
      .mockResolvedValueOnce({
        ...station,
        id: 'previous-station',
        mobileDeviceId: deviceId,
        mobileDeviceTokenHash: hash(token),
      })
      .mockResolvedValueOnce(station);
    await service.pairMobile({ code: station.code, deviceId }, token);
    expect(database.station.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'previous-station' },
      data: {
        mobileDeviceId: null,
        mobileDeviceTokenHash: null,
        mobileLastSeenAt: null,
      },
    });
    expect(database.station.update).toHaveBeenCalledTimes(2);
  });

  it.each([{ active: false }, { processId: null }])(
    'rejects an unavailable station (%j)',
    async (patch) => {
      database.station.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...station, ...patch });
      await expect(
        service.pairMobile({ code: station.code, deviceId }, token),
      ).rejects.toThrow(BadRequestException);
      expect(database.station.update).not.toHaveBeenCalled();
    },
  );

  it('requires a cryptographically sized token for a new binding', async () => {
    await expect(
      service.pairMobile({ code: station.code, deviceId }, 'short'),
    ).rejects.toThrow(BadRequestException);
    expect(database.station.update).not.toHaveBeenCalled();
  });

  it('creates a station with its process when first paired', async () => {
    database.station.findUnique.mockResolvedValue(null);
    database.station.create.mockResolvedValue(station);
    await service.pairMobile(
      {
        code: ' st-01 ',
        deviceId,
        name: ' Inspection ',
        processName: ' Final ',
      },
      token,
    );
    expect(database.station.create).toHaveBeenCalledWith({
      data: {
        code: 'ST-01',
        name: 'Inspection',
        process: {
          connectOrCreate: {
            where: { name: 'Final' },
            create: { name: 'Final' },
          },
        },
      },
    });
  });

  it('retries serialization conflicts before reporting a concurrent pairing', async () => {
    database.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Concurrent binding', {
        code: 'P2034',
        clientVersion: '6',
      }),
    );
    await expect(
      service.pairMobile({ code: station.code, deviceId }, token),
    ).rejects.toThrow(ConflictException);
    expect(database.$transaction).toHaveBeenCalledTimes(3);
  });

  it('requires both UUID and token to resolve a station', async () => {
    await expect(service.currentMobile(deviceId)).rejects.toThrow(
      ForbiddenException,
    );
    expect(database.station.updateMany).not.toHaveBeenCalled();
  });

  it('checks credentials, active status and submitted station code together', async () => {
    database.station.updateMany.mockResolvedValue({ count: 1 });
    database.station.findFirst.mockResolvedValue({ id: station.id });
    await service.currentMobile(deviceId.toUpperCase(), token, ' st-01 ');
    expect(database.station.updateMany).toHaveBeenCalledWith({
      where: {
        mobileDeviceId: deviceId,
        mobileDeviceTokenHash: hash(token),
        active: true,
        code: 'ST-01',
      },
      data: { mobileLastSeenAt: expect.any(Date) as Date },
    });
  });

  it('rejects revoked, incorrect or mismatched bindings without IP fallback', async () => {
    database.station.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.currentMobile(deviceId, token, 'WRONG-STATION'),
    ).rejects.toThrow(ForbiddenException);
    expect(database.station.findUnique).not.toHaveBeenCalled();
    expect(database.station.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a revocation between verification and reading the station', async () => {
    database.station.updateMany.mockResolvedValue({ count: 1 });
    database.station.findFirst.mockResolvedValue(null);
    await expect(service.currentMobile(deviceId, token)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('disconnects the installation and clears its token', async () => {
    await service.unpairMobile(station.id);
    expect(database.station.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: station.id },
        data: {
          mobileDeviceId: null,
          mobileDeviceTokenHash: null,
          mobileLastSeenAt: null,
        },
      }),
    );
  });
});
