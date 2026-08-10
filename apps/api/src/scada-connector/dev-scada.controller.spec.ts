import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DevScadaController } from './dev-scada.controller';

describe('DevScadaController', () => {
  const controller = new DevScadaController();
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('allows serial numbers ending in _OK', () => {
    expect(
      controller.routeCheck({ serialNumber: 'SN123_OK', processName: 'ST-10' }),
    ).toEqual({
      allowed: true,
      serverUrl: 'http://localhost:3000/api/dev/scada/product-history/SN123_OK',
      product: { partNumber: 'DEV-SN123', productFamily: 'DEV' },
    });
  });

  it('rejects serial numbers ending in _NOK', () => {
    expect(
      controller.routeCheck({
        serialNumber: 'SN123_NOK',
        processName: 'ST-10',
      }),
    ).toEqual({ allowed: false });
  });

  it('rejects unsupported serial numbers', () => {
    expect(() =>
      controller.routeCheck({ serialNumber: 'SN123', processName: 'ST-10' }),
    ).toThrow(BadRequestException);
  });

  it('is unavailable in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() =>
      controller.routeCheck({ serialNumber: 'SN123_OK', processName: 'ST-10' }),
    ).toThrow(NotFoundException);
  });
});
