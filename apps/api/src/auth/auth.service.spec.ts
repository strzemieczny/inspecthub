import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from '@inspect-hub/database';
import { AccessControlService } from './access-control.service';
import { LdapService } from './ldap.service';
import { AuthService } from './auth.service';

describe('AuthService card login', () => {
  const database = {
    user: { upsert: jest.fn() },
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('token') };
  const accessControl = { findActiveOperator: jest.fn() };
  const service = new AuthService(
    database as never,
    jwt as unknown as JwtService,
    accessControl as unknown as AccessControlService,
    {
      getOrThrow: jest.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService,
    {} as LdapService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('rejects an unknown or inactive card', async () => {
    accessControl.findActiveOperator.mockResolvedValue(null);

    await expect(service.cardLogin({ identifier: '00123' })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(database.user.upsert).not.toHaveBeenCalled();
  });

  it('synchronizes an APACS operator and issues a session', async () => {
    accessControl.findActiveOperator.mockResolvedValue({
      externalId: '417',
      firstName: 'Jan',
      lastName: 'Kowalski',
      email: 'jan@example.com',
    });
    database.user.upsert.mockResolvedValue({
      id: 'local-user',
      email: 'apacs-417@access-control.invalid',
      name: 'Jan Kowalski',
      role: Role.OPERATOR,
    });

    await expect(service.cardLogin({ identifier: '00123' })).resolves.toEqual({
      accessToken: 'token',
      user: {
        id: 'local-user',
        email: 'apacs-417@access-control.invalid',
        name: 'Jan Kowalski',
        role: Role.OPERATOR,
      },
    });
    expect(database.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          externalProvider_externalId: {
            externalProvider: 'APACS',
            externalId: '417',
          },
        },
      }),
    );
  });

  it('logs in 0000 as Testowy User with the operator role in development', async () => {
    const config = new ConfigService({ NODE_ENV: 'development' });
    const devService = new AuthService(
      database as never,
      jwt as unknown as JwtService,
      new AccessControlService(config),
      config,
      {} as LdapService,
    );
    const user = {
      id: 'test-user',
      email: 'apacs-dev-test-user@access-control.invalid',
      name: 'Testowy User',
      role: Role.OPERATOR,
    };
    database.user.upsert.mockResolvedValue(user);

    await expect(devService.cardLogin({ identifier: '0000' })).resolves.toEqual(
      {
        accessToken: 'token',
        user,
      },
    );
    expect(database.user.upsert).toHaveBeenCalledWith({
      where: {
        externalProvider_externalId: {
          externalProvider: 'APACS',
          externalId: 'dev-test-user',
        },
      },
      create: {
        externalProvider: 'APACS',
        externalId: 'dev-test-user',
        email: user.email,
        name: user.name,
        role: Role.OPERATOR,
      },
      update: { email: user.email, name: user.name, role: Role.OPERATOR },
      select: { id: true, email: true, name: true, role: true },
    });
  });
});

describe('AuthService development admin', () => {
  const database = { user: { upsert: jest.fn() } };
  const jwt = { signAsync: jest.fn().mockResolvedValue('admin-token') };
  const ldap = { authenticate: jest.fn() };
  const user = {
    id: 'dev-admin',
    email: 'admin@development.invalid',
    name: 'Testowy Admin',
    role: Role.ADMIN,
  };
  const createService = (nodeEnv?: string) =>
    new AuthService(
      database as never,
      jwt as unknown as JwtService,
      {} as AccessControlService,
      {
        get: (key: string) => (key === 'NODE_ENV' ? nodeEnv : undefined),
      } as ConfigService,
      ldap as unknown as LdapService,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    database.user.upsert.mockResolvedValue(user);
    ldap.authenticate.mockRejectedValue(new UnauthorizedException());
  });

  it('creates or refreshes the local admin and issues a DEV session without LDAP', async () => {
    const service = createService('development');
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(
        service.login({ username: 'admin', password: 'admin' }),
      ).resolves.toEqual({ accessToken: 'admin-token', user });
    }
    expect(database.user.upsert).toHaveBeenCalledTimes(2);
    expect(database.user.upsert).toHaveBeenCalledWith({
      where: {
        externalProvider_externalId: {
          externalProvider: 'DEV',
          externalId: 'admin',
        },
      },
      create: {
        externalProvider: 'DEV',
        externalId: 'admin',
        email: user.email,
        name: user.name,
        role: Role.ADMIN,
        passwordHash: null,
      },
      update: {
        email: user.email,
        name: user.name,
        role: Role.ADMIN,
        passwordHash: null,
      },
      select: { id: true, email: true, name: true, role: true },
    });
    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: user.id,
      provider: 'DEV',
      email: user.email,
    });
    expect(ldap.authenticate).not.toHaveBeenCalled();
  });

  it('rejects the wrong admin password in development', async () => {
    await expect(
      createService('development').login({
        username: 'admin',
        password: 'wrong',
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(database.user.upsert).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it.each(['production', 'test', 'staging', undefined])(
    'does not enable local admin when NODE_ENV=%s',
    async (nodeEnv) => {
      await expect(
        createService(nodeEnv).login({ username: 'admin', password: 'admin' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(database.user.upsert).not.toHaveBeenCalled();
      expect(jwt.signAsync).not.toHaveBeenCalled();
      expect(ldap.authenticate).toHaveBeenCalledWith('admin', 'admin');
    },
  );
});

describe('AuthService LDAP sessions', () => {
  const identity = {
    externalId: 'alice',
    email: 'alice@example.com',
    name: 'Alice',
    role: Role.OPERATOR,
  };
  const user = { ...identity, id: 'user-1' };
  const database = {
    $transaction: jest.fn(),
    user: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
  };
  const ldap = { authenticate: jest.fn() };
  const jwt = { signAsync: jest.fn().mockResolvedValue('token') };
  const service = new AuthService(
    database as never,
    jwt as unknown as JwtService,
    {} as AccessControlService,
    { get: jest.fn() } as unknown as ConfigService,
    ldap as unknown as LdapService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    ldap.authenticate.mockResolvedValue(identity);
    database.$transaction.mockImplementation(
      (callback: (tx: typeof database) => unknown) => callback(database),
    );
    database.user.create.mockResolvedValue(user);
    database.user.update.mockResolvedValue(user);
  });

  it('creates an AD identity without a local password', async () => {
    database.user.findUnique.mockResolvedValue(null);
    await expect(
      service.login({ username: 'DOMAIN\\alice', password: 'secret' }),
    ).resolves.toMatchObject({
      accessToken: 'token',
      user: { id: 'user-1', role: Role.OPERATOR },
    });
    expect(ldap.authenticate).toHaveBeenCalledWith('DOMAIN\\alice', 'secret');
    expect(database.user.create).toHaveBeenCalledWith({
      data: { ...identity, externalProvider: 'LDAP', passwordHash: null },
    });
  });

  it('replaces a legacy password and role while preserving history', async () => {
    database.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'legacy',
      externalProvider: null,
      role: Role.ADMIN,
    });
    await service.login({ username: 'alice', password: 'secret' });
    expect(database.user.update).toHaveBeenCalledWith({
      where: { id: 'legacy' },
      data: { ...identity, externalProvider: 'LDAP', passwordHash: null },
    });
  });

  it('refreshes an existing LDAP profile and role', async () => {
    database.user.findUnique.mockResolvedValueOnce({ id: 'ldap-user' });
    await service.login({ username: 'alice', password: 'secret' });
    expect(database.user.update).toHaveBeenCalledWith({
      where: { id: 'ldap-user' },
      data: expect.objectContaining({ role: Role.OPERATOR }),
    });
  });

  it('does not link another external provider by email', async () => {
    database.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'apacs', externalProvider: 'APACS' });
    await expect(
      service.login({ username: 'alice', password: 'secret' }),
    ).rejects.toThrow('Adres konta jest przypisany do innej tożsamości');
    expect(database.user.update).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('never falls back to a local password after AD rejection', async () => {
    ldap.authenticate.mockRejectedValue(new UnauthorizedException());
    await expect(
      service.login({ username: 'alice', password: 'secret' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
