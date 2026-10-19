import { EventEmitter } from 'node:events';
import {
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ldap from 'ldapjs';
import { LdapService } from './ldap.service';

jest.mock('ldapjs', () => ({
  ...jest.requireActual<typeof ldap>('ldapjs'),
  createClient: jest.fn(),
}));

describe('LdapService', () => {
  let service: LdapService;
  let warn: jest.SpyInstance;
  let search: jest.Mock;
  let clients: (EventEmitter & { bind: jest.Mock; destroy: jest.Mock })[];
  let groups: string[];
  let userBindError: Error | null;
  let searchStatus: number;
  let entryCount: number;
  const settings: Record<string, string> = {
    LDAP_URL: 'ldaps://ad.example.com',
    LDAP_BIND_DN: 'CN=Service,DC=example',
    LDAP_BIND_PASSWORD: 'service-secret',
    LDAP_SEARCH_BASE: 'DC=example',
    LDAP_ADMIN_GROUP: 'Inspect-Hub-Admins',
    LDAP_REQUIRED_GROUP: 'Inspect-Hub-Operators',
  };

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    groups = ['CN=Inspect-Hub-Operators,OU=Groups,DC=example'];
    userBindError = null;
    searchStatus = 0;
    entryCount = 1;
    clients = [];
    search = jest.fn(
      (
        _base: string,
        _options: unknown,
        callback: (error: null, response: EventEmitter) => void,
      ) => {
        const response = new EventEmitter();
        callback(null, response);
        queueMicrotask(() => {
          for (let index = 0; index < entryCount; index++)
            response.emit('searchEntry', {
              pojo: {
                objectName: 'CN=Alice,DC=example',
                attributes: [
                  { type: 'sAMAccountName', values: ['Alice'] },
                  { type: 'mail', values: ['Alice@example.com'] },
                  { type: 'displayName', values: ['Alice Example'] },
                  { type: 'memberOf', values: groups },
                ],
              },
            });
          response.emit('end', { status: searchStatus });
        });
      },
    );
    jest.mocked(ldap.createClient).mockImplementation(() => {
      const isUser = clients.length === 1;
      const client = Object.assign(new EventEmitter(), {
        bind: jest.fn(
          (_dn: string, _password: string, cb: (error: Error | null) => void) =>
            cb(isUser ? userBindError : null),
        ),
        search,
        destroy: jest.fn(),
      });
      clients.push(client);
      return client as unknown as ldap.Client;
    });
    service = new LdapService({
      get: (key: string) => settings[key],
    } as ConfigService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it.each([
    ['alice', 'sAMAccountName=alice'],
    ['DOMAIN\\alice', 'sAMAccountName=alice'],
    ['alice.email@example.com', 'userPrincipalName=alice.email@example.com'],
  ])(
    'accepts %s and searches the right AD attribute',
    async (username, filter) => {
      await expect(service.authenticate(username, 'secret')).resolves.toEqual({
        externalId: 'alice',
        email: 'alice@example.com',
        name: 'Alice Example',
        role: 'OPERATOR',
      });
      expect(search).toHaveBeenCalledWith(
        'DC=example',
        expect.objectContaining({
          filter: expect.stringContaining(`(${filter})`),
        }),
        expect.any(Function),
      );
      expect(clients[1]!.bind).toHaveBeenCalledWith(
        'CN=Alice,DC=example',
        'secret',
        expect.any(Function),
      );
      clients.forEach((client) => expect(client.destroy).toHaveBeenCalled());
    },
  );

  it('escapes filter injection characters', async () => {
    await service.authenticate('a*(b)\0', 'secret');
    expect(search).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        filter: expect.stringContaining('sAMAccountName=a\\2a\\28b\\29\\00'),
      }),
      expect.any(Function),
    );
  });

  it('gives the admin group precedence, case insensitively', async () => {
    groups.push('CN=inspect-hub-admins,OU=Groups,DC=example');
    await expect(
      service.authenticate('alice', 'secret'),
    ).resolves.toMatchObject({ role: 'ADMIN' });
  });

  it('rejects unauthorized groups', async () => {
    groups = ['CN=Visitors,DC=example'];
    await expect(
      service.authenticate('alice', 'secret'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('logs only the AD failure stage and substatus without credentials or raw diagnostics', async () => {
    userBindError = Object.assign(
      new Error('sensitive account details, data 775, v4563'),
      { code: 49 },
    );
    await expect(
      service.authenticate('alice', 'private-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(warn).toHaveBeenCalledWith({
      type: 'LDAP_AUTH_FAILED',
      stage: 'user_bind',
      reason: 'AD_REJECTED_CREDENTIALS',
      adStatus: '775',
    });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(
      /private-password|sensitive|alice|service-secret/,
    );
  });

  it('distinguishes a missing account from an AD password rejection', async () => {
    entryCount = 0;
    await expect(
      service.authenticate('alice', 'private-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(warn).toHaveBeenCalledWith({
      type: 'LDAP_AUTH_FAILED',
      stage: 'user_search',
      reason: 'ACCOUNT_NOT_FOUND',
    });
  });

  it('rejects invalid AD credentials and cleans up clients', async () => {
    userBindError = Object.assign(new Error('invalid'), { code: 49 });
    await expect(service.authenticate('alice', 'wrong')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    clients.forEach((client) => expect(client.destroy).toHaveBeenCalled());
  });

  it.each([0, 2])('rejects a search returning %i identities', async (count) => {
    entryCount = count;
    await expect(
      service.authenticate('alice', 'secret'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects nonzero search status even if an entry was received', async () => {
    searchStatus = 4;
    await expect(
      service.authenticate('alice', 'secret'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects empty passwords before connecting', async () => {
    await expect(service.authenticate('alice', '')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(ldap.createClient).not.toHaveBeenCalled();
  });

  it('bounds the whole request when search never completes', async () => {
    jest.useFakeTimers();
    search.mockImplementation(() => {});
    const result = expect(
      service.authenticate('alice', 'secret'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await jest.advanceTimersByTimeAsync(10000);
    await result;
    expect(clients[0]!.destroy).toHaveBeenCalled();
    expect(clients).toHaveLength(1);
  });

  it('maps transport errors to 503 and tolerates late errors', async () => {
    search.mockImplementation(() => {
      queueMicrotask(() => clients[0]!.emit('error', new Error('offline')));
    });
    await expect(
      service.authenticate('alice', 'secret'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(() => clients[0]!.emit('error', new Error('late'))).not.toThrow();
  });
});
