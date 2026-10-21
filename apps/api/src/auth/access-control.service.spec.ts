import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessControlService } from './access-control.service';

describe('AccessControlService development operator', () => {
  const createService = (nodeEnv?: string) =>
    new AccessControlService({
      get: (key: string) => (key === 'NODE_ENV' ? nodeEnv : undefined),
    } as ConfigService);

  it('returns the test operator without APACS configuration in development', async () => {
    await expect(
      createService('development').findActiveOperator('0000'),
    ).resolves.toEqual({
      externalId: 'dev-test-user',
      firstName: 'Testowy',
      lastName: 'User',
      email: null,
    });
  });

  it.each(['production', 'test', 'staging', undefined])(
    'requires APACS for 0000 when NODE_ENV=%s',
    async (nodeEnv) => {
      await expect(
        createService(nodeEnv).findActiveOperator('0000'),
      ).rejects.toThrow(ServiceUnavailableException);
    },
  );

  it.each(['0', '00000', '1234'])(
    'requires APACS for other identifiers in development: %s',
    async (identifier) => {
      await expect(
        createService('development').findActiveOperator(identifier),
      ).rejects.toThrow(ServiceUnavailableException);
    },
  );
});
