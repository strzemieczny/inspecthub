import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy identity providers', () => {
  const database = { user: { findUnique: jest.fn() } };
  const strategy = new JwtStrategy(
    { getOrThrow: () => 'test-secret' } as unknown as ConfigService,
    database as never,
  );

  it.each(['LDAP', 'APACS'])(
    'accepts a current %s session',
    async (provider) => {
      database.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'user@example.com',
        role: 'OPERATOR',
        externalProvider: provider,
      });
      await expect(
        strategy.validate({ sub: '1', email: 'user@example.com', provider }),
      ).resolves.toMatchObject({ userId: '1' });
    },
  );

  it('rejects old local tokens even after their profile has migrated to AD', async () => {
    database.user.findUnique.mockResolvedValue({
      id: '1',
      externalProvider: 'LDAP',
    });
    await expect(
      strategy.validate({ sub: '1', email: 'user@example.com' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each(['development', 'production', 'test', 'staging', undefined])(
    'only accepts DEV sessions in development, NODE_ENV=%s',
    async (nodeEnv) => {
      const devStrategy = new JwtStrategy(
        {
          getOrThrow: () => 'test-secret',
          get: (key: string) => (key === 'NODE_ENV' ? nodeEnv : undefined),
        } as unknown as ConfigService,
        database as never,
      );
      database.user.findUnique.mockResolvedValue({
        id: 'admin',
        email: 'admin@development.invalid',
        role: 'ADMIN',
        externalProvider: 'DEV',
      });
      const result = devStrategy.validate({
        sub: 'admin',
        email: 'admin@development.invalid',
        provider: 'DEV',
      });
      if (nodeEnv === 'development') {
        await expect(result).resolves.toEqual({
          userId: 'admin',
          email: 'admin@development.invalid',
          role: 'ADMIN',
        });
        await expect(
          devStrategy.validate({
            sub: 'admin',
            email: 'admin@development.invalid',
            provider: 'LDAP',
          }),
        ).rejects.toThrow(UnauthorizedException);
      } else {
        await expect(result).rejects.toThrow(UnauthorizedException);
      }
    },
  );

  it('rejects a legacy local account', async () => {
    database.user.findUnique.mockResolvedValue({
      id: '1',
      externalProvider: null,
    });
    await expect(
      strategy.validate({ sub: '1', email: 'user@example.com' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
