import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@inspect-hub/database';
import * as ldap from 'ldapjs';

interface DirectoryEntry {
  objectName?: string;
  attributes: { type: string; values: string[] }[];
}

// Uses the service-account search and user bind flow from BW-Mind.
@Injectable()
export class LdapService {
  private readonly logger = new Logger(LdapService.name);
  constructor(private readonly config: ConfigService) {}

  private required(key: string): string {
    const value = this.config.get<string>(key)?.trim();
    if (!value) throw new ServiceUnavailableException('Brak konfiguracji LDAP');
    return value;
  }

  private timeout(key: string, fallback: number): number {
    const value = Number(this.config.get<string>(key) ?? fallback);
    if (!Number.isInteger(value) || value < 100 || value > 120000) {
      throw new ServiceUnavailableException('Nieprawidłowy timeout LDAP');
    }
    return value;
  }

  private values(entry: DirectoryEntry, name: string): string[] {
    return (
      entry.attributes.find((a) => a.type.toLowerCase() === name.toLowerCase())
        ?.values ?? []
    );
  }

  private matches(groups: string[], expected: string): boolean {
    // Full DNs match exactly; a short configured group name matches its CN.
    return groups.some((group) => {
      if (expected.toLowerCase().startsWith('cn=')) {
        return group.toLowerCase() === expected.toLowerCase();
      }
      return (
        ldap.parseDN(group).shift().toString().toLowerCase() ===
        new ldap.RDN({ cn: expected }).toString().toLowerCase()
      );
    });
  }

  async authenticate(username: string, password: string) {
    const login = username.trim().split('\\').pop()?.trim() ?? '';
    if (!login || !password)
      throw new UnauthorizedException('Nieprawidłowy login lub hasło');
    const url = this.required('LDAP_URL');
    const bindDn = this.required('LDAP_BIND_DN');
    const bindPassword = this.config.get<string>('LDAP_BIND_PASSWORD');
    if (!bindPassword)
      throw new ServiceUnavailableException('Brak konfiguracji LDAP');
    const searchBase = this.required('LDAP_SEARCH_BASE');
    const adminGroup = this.required('LDAP_ADMIN_GROUP');
    const requiredGroup = this.required('LDAP_REQUIRED_GROUP');
    const requestTimeout = this.timeout('LDAP_REQUEST_TIMEOUT_MS', 10000);
    const options = {
      url,
      timeout: this.timeout('LDAP_TIMEOUT_MS', 5000),
      connectTimeout: this.timeout('LDAP_CONNECT_TIMEOUT_MS', 5000),
      reconnect: false,
    };
    const clients: ldap.Client[] = [];
    let closed = false;
    let stage = 'service_bind';
    let reason: string | undefined;
    let adStatus: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const createClient = () => {
      if (closed)
        throw new ServiceUnavailableException(
          'Przekroczono czas połączenia z LDAP',
        );
      const client = ldap.createClient(options);
      client.on('error', () => {}); // Keep late transport errors from crashing Node.
      clients.push(client);
      return client;
    };
    const bind = (client: ldap.Client, dn: string, secret: string) => {
      let onError: (error: Error) => void;
      return new Promise<void>((resolve, reject) => {
        onError = reject;
        client.once('error', onError);
        client.bind(dn, secret, (error) => (error ? reject(error) : resolve()));
      }).finally(() => client.removeListener('error', onError));
    };
    try {
      const operation = async () => {
        const client = createClient();
        await bind(client, bindDn, bindPassword);
        stage = 'user_search';
        const escaped = login.replace(
          /[\\()*\0]/g,
          (char) => `\\${char.charCodeAt(0).toString(16).padStart(2, '0')}`,
        );
        const entry = await new Promise<DirectoryEntry>((resolve, reject) => {
          const entries: DirectoryEntry[] = [];
          const onError = (error: Error) => reject(error);
          client.once('error', onError);
          client.search(
            searchBase,
            {
              scope: 'sub',
              filter: `(&(objectCategory=person)(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2))(${login.includes('@') ? 'userPrincipalName' : 'sAMAccountName'}=${escaped}))`,
              attributes: [
                'sAMAccountName',
                'userPrincipalName',
                'mail',
                'displayName',
                'cn',
                'memberOf',
              ],
              sizeLimit: 2,
              timeLimit: Math.max(1, Math.ceil(requestTimeout / 1000)),
            },
            (error, response) => {
              if (error) {
                reject(error);
                return;
              }
              response.on('searchEntry', (result: ldap.SearchEntry) =>
                entries.push(result.pojo),
              );
              response.on('error', reject);
              response.on('end', (result?: { status?: number }) => {
                client.removeListener('error', onError);
                if (result?.status) {
                  reject(new Error('LDAP search failed'));
                  return;
                }
                if (entries.length !== 1) {
                  reason =
                    entries.length === 0
                      ? 'ACCOUNT_NOT_FOUND'
                      : 'AMBIGUOUS_ACCOUNT';
                  reject(
                    new UnauthorizedException('Nieprawidłowy login lub hasło'),
                  );
                  return;
                }
                resolve(entries[0]!);
              });
            },
          );
        });
        if (!entry.objectName) throw new Error('Missing LDAP DN');
        stage = 'user_bind';
        const userClient = createClient();
        try {
          await bind(userClient, entry.objectName, password);
        } catch (error) {
          // AD substatus is safe to log; never log the raw diagnostic or credentials.
          const diagnostic = error as {
            code?: number;
            message?: string;
            lde_message?: string;
          };
          const status =
            `${diagnostic.message ?? ''} ${diagnostic.lde_message ?? ''}`
              .match(/\bdata\s+([0-9a-f]+)\b/i)?.[1]
              ?.toLowerCase();
          if (
            status &&
            [
              '525',
              '52e',
              '530',
              '531',
              '532',
              '533',
              '701',
              '773',
              '775',
            ].includes(status)
          )
            adStatus = status;
          if (diagnostic.code === 49) {
            reason = 'AD_REJECTED_CREDENTIALS';
            throw new UnauthorizedException('Nieprawidłowy login lub hasło');
          }
          throw error;
        }
        stage = 'group_authorization';
        const groups = this.values(entry, 'memberOf');
        const role = this.matches(groups, adminGroup)
          ? Role.ADMIN
          : this.matches(groups, requiredGroup)
            ? Role.OPERATOR
            : null;
        if (!role)
          throw new ForbiddenException(
            'Brak uprawnień do Inspect Hub w Active Directory',
          );
        const account = this.values(entry, 'sAMAccountName')[0]
          ?.trim()
          .toLowerCase();
        if (!account) throw new Error('Missing LDAP account name');
        const email = (
          this.values(entry, 'mail')[0] ||
          this.values(entry, 'userPrincipalName')[0] ||
          `${account}@ldap.invalid`
        )
          .trim()
          .toLowerCase();
        return {
          externalId: account,
          email,
          name:
            this.values(entry, 'displayName')[0] ||
            this.values(entry, 'cn')[0] ||
            account,
          role,
        };
      };
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new ServiceUnavailableException(
                  'Przekroczono czas połączenia z LDAP',
                ),
              ),
            requestTimeout,
          );
        }),
      ]);
    } catch (error) {
      this.logger.warn({
        type: 'LDAP_AUTH_FAILED',
        stage,
        reason:
          reason ??
          (error instanceof ForbiddenException
            ? 'GROUP_ACCESS_DENIED'
            : 'DIRECTORY_ERROR'),
        ...(adStatus ? { adStatus } : {}),
      });
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException ||
        error instanceof ServiceUnavailableException
      )
        throw error;
      throw new ServiceUnavailableException(
        'Usługa Active Directory jest niedostępna',
      );
    } finally {
      closed = true;
      clearTimeout(timer);
      for (const client of clients) client.destroy();
    }
  }
}
