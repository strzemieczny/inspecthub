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
