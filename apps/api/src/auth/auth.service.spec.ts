import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from '@inspect-hub/database';
import { AccessControlService } from './access-control.service';
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
});

describe('AuthService setupStatus', () => {
  const database = {
    user: { count: jest.fn() },
  };
  const service = new AuthService(
    database as never,
    {} as unknown as JwtService,
    {} as unknown as AccessControlService,
    {} as unknown as ConfigService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('allows initial setup when no administrator exists', async () => {
    database.user.count.mockResolvedValue(0);
    await expect(service.setupStatus()).resolves.toEqual({
      registrationAvailable: true,
    });
    expect(database.user.count).toHaveBeenCalledWith({
      where: { role: Role.ADMIN },
    });
  });

  it('hides initial setup when an administrator exists', async () => {
    database.user.count.mockResolvedValue(2);
    await expect(service.setupStatus()).resolves.toEqual({
      registrationAvailable: false,
    });
  });
});

describe('AuthService register', () => {
  const database = {
    $transaction: jest.fn(),
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('admin-jwt-token') };
  const service = new AuthService(
    database as never,
    jwt as unknown as JwtService,
    {} as unknown as AccessControlService,
    {} as unknown as ConfigService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('creates the first administrator and issues a session', async () => {
    const tx = {
      user: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({
          id: 'admin-1',
          email: 'admin@example.com',
          name: 'Jan Administrator',
          role: Role.ADMIN,
        }),
      },
    };
    database.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) =>
      cb(tx),
    );

    const result = await service.register({
      name: 'Jan Administrator',
      email: 'Admin@Example.COM',
      password: 'password123',
    });

    expect(result).toEqual({
      accessToken: 'admin-jwt-token',
      user: {
        id: 'admin-1',
        email: 'admin@example.com',
        name: 'Jan Administrator',
        role: Role.ADMIN,
      },
    });
    expect(tx.user.count).toHaveBeenCalledWith({ where: { role: Role.ADMIN } });
    expect(database.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'admin@example.com',
        name: 'Jan Administrator',
        role: Role.ADMIN,
      }),
      select: { id: true, email: true, name: true, role: true },
    });
  });

  it('rejects registration when an administrator already exists', async () => {
    const tx = {
      user: {
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn(),
      },
    };
    database.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) =>
      cb(tx),
    );

    await expect(
      service.register({
        name: 'Admin',
        email: 'admin@example.com',
        password: 'password123',
      }),
    ).rejects.toThrow(
      'Rejestracja startowa jest dostępna tylko przed utworzeniem pierwszego administratora',
    );
    expect(tx.user.create).not.toHaveBeenCalled();
  });
});
