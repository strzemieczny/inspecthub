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
