import {
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sql from 'mssql';

export interface AccessControlOperator {
  externalId: string;
  firstName: string;
  lastName: string;
  email: string | null;
}

interface ApacsRow {
  assignmentId: number;
  employeeId: number;
  firstName: string;
  lastName: string;
  email: string | null;
  active: number | null;
  status: number | null;
  validFrom: Date | null;
  validTo: Date | null;
  overrideActive: number | null;
  matchedBy: string;
  numericCardNumber: number;
}

interface NumericCandidate {
  label: string;
  value: number;
}

@Injectable()
export class AccessControlService implements OnModuleDestroy {
  private readonly logger = new Logger(AccessControlService.name);
  private poolPromise?: Promise<sql.ConnectionPool>;

  constructor(private readonly config: ConfigService) {}

  async findActiveOperator(
    rawIdentifier: string,
  ): Promise<AccessControlOperator | null> {
    const identifier = rawIdentifier.trim();
    const numericCandidates = this.numericCandidates(identifier);
    const cardNumbers = Array.from(
      { length: 6 },
      (_, index) => numericCandidates[index]?.value ?? null,
    );
    const maskedIdentifier = this.maskIdentifier(identifier);
    this.logger.log(
      `Sprawdzanie karty ${maskedIdentifier} (długość=${identifier.length}); warianty tekstowe + ${numericCandidates.length} konwersji do FCARDNUM`,
    );
    const pool = await this.getPool();
    try {
      const request = pool
        .request()
        .input('identifier', sql.VarChar(30), identifier);
      cardNumbers.forEach((value, index) =>
        request.input(`cardNumber${index}`, sql.Int, value),
      );
      const result = await request.query<ApacsRow>(`
          SELECT TOP (5)
            ci.FID AS assignmentId,
            ch.FCARDHOLDERID AS employeeId,
            ch.FFIRST AS firstName,
            ch.FLAST AS lastName,
            ch.FEMAIL AS email,
            ci.FACTIVE AS active,
            ci.FSTATUS AS status,
            ci.FDATEFROM AS validFrom,
            ci.FDATETO AS validTo,
            ci.FOVERRIDEACTIVE AS overrideActive,
            ci.FCARDNUM AS numericCardNumber,
            CASE
              WHEN UPPER(LTRIM(RTRIM(ci.FLONGCARDNUM))) = UPPER(@identifier) THEN 'FLONGCARDNUM'
              WHEN UPPER(LTRIM(RTRIM(ci.FUUID))) = UPPER(@identifier) THEN 'FUUID'
              WHEN ci.FCARDNUM IN (@cardNumber0, @cardNumber1, @cardNumber2, @cardNumber3, @cardNumber4, @cardNumber5) THEN 'FCARDNUM'
              ELSE 'UNKNOWN'
            END AS matchedBy
          FROM dbo.TCARDISSUE AS ci
          INNER JOIN dbo.TCARDHOLDERS AS ch ON ch.FID = ci.FCHID
          WHERE
            (
              UPPER(LTRIM(RTRIM(ci.FLONGCARDNUM))) = UPPER(@identifier)
              OR UPPER(LTRIM(RTRIM(ci.FUUID))) = UPPER(@identifier)
              OR ci.FCARDNUM IN (@cardNumber0, @cardNumber1, @cardNumber2, @cardNumber3, @cardNumber4, @cardNumber5)
            )
          ORDER BY ci.FID DESC
        `);
      if (result.recordset.length === 0) {
        this.logger.warn(
          `Karta ${maskedIdentifier}: brak przypisania w TCARDISSUE`,
        );
        return null;
      }

      const now = new Date();
      const operator = result.recordset.find((candidate) => {
        const numericMatch = numericCandidates.find(
          (item) => item.value === candidate.numericCardNumber,
        );
        const active = candidate.active === 1;
        const started = !candidate.validFrom || candidate.validFrom <= now;
        const notExpired = !candidate.validTo || candidate.validTo >= now;
        const datesOverridden = candidate.overrideActive === 1;
        const accepted = active && (datesOverridden || (started && notExpired));
        this.logger.log(
          `Karta ${maskedIdentifier}: dopasowanie=${candidate.matchedBy}${numericMatch ? ` (${numericMatch.label})` : ''}, przypisanie FID=${candidate.assignmentId}, ` +
            `FACTIVE=${candidate.active ?? 'NULL'}, FSTATUS=${candidate.status ?? 'NULL'}, ` +
            `FOVERRIDEACTIVE=${candidate.overrideActive ?? 'NULL'}, ` +
            `FDATEFROM=${this.formatDate(candidate.validFrom)}, ` +
            `FDATETO=${this.formatDate(candidate.validTo)} => ${accepted ? (datesOverridden ? 'ważna: FOVERRIDEACTIVE=1' : 'ważna') : this.rejectionReason(active, started, notExpired)}`,
        );
        return accepted;
      });
      if (!operator) return null;
      return {
        externalId: String(operator.employeeId),
        firstName: operator.firstName?.trim() ?? '',
        lastName: operator.lastName?.trim() ?? '',
        email: operator.email?.trim().toLowerCase() || null,
      };
    } catch (error) {
      this.handleReadError(error);
    }
  }

  async onModuleDestroy() {
    if (this.poolPromise) await (await this.poolPromise).close();
  }

  private getPool(): Promise<sql.ConnectionPool> {
    if (this.poolPromise) return this.poolPromise;
    const server = this.config.get<string>('APACS_DB_SERVER');
    const user = this.config.get<string>('APACS_DB_USER');
    const password = this.config.get<string>('APACS_DB_PASSWORD');
    if (!server || !user || !password) {
      throw new ServiceUnavailableException(
        'Logowanie kartą nie zostało jeszcze skonfigurowane',
      );
    }
    this.poolPromise = new sql.ConnectionPool({
      server,
      port: this.numberConfig('APACS_DB_PORT', 1433),
      database: this.config.get<string>('APACS_DB_NAME') ?? 'APACS',
      user,
      password,
      connectionTimeout: this.numberConfig(
        'APACS_DB_CONNECTION_TIMEOUT_MS',
        5000,
      ),
      requestTimeout: this.numberConfig('APACS_DB_REQUEST_TIMEOUT_MS', 5000),
      pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
      options: {
        encrypt: this.config.get<string>('APACS_DB_ENCRYPT') !== 'false',
        trustServerCertificate:
          this.config.get<string>('APACS_DB_TRUST_CERTIFICATE') === 'true',
      },
    })
      .connect()
      .catch((error: unknown) => {
        this.poolPromise = undefined;
        this.logger.error(
          'Nie udało się połączyć z APACS',
          error instanceof Error ? error.stack : undefined,
        );
        throw new ServiceUnavailableException(
          'System kontroli dostępu jest chwilowo niedostępny',
        );
      });
    return this.poolPromise;
  }

  private numberConfig(key: string, fallback: number): number {
    const value = Number(this.config.get<string>(key) ?? fallback);
    return Number.isFinite(value) ? value : fallback;
  }

  private handleReadError(error: unknown): never {
    this.logger.error(
      'Nie udało się odczytać danych z APACS',
      error instanceof Error ? error.stack : undefined,
    );
    throw new ServiceUnavailableException(
      'System kontroli dostępu jest chwilowo niedostępny',
    );
  }

  private maskIdentifier(identifier: string): string {
    if (identifier.length <= 4) return '*'.repeat(identifier.length);
    return `${'*'.repeat(identifier.length - 4)}${identifier.slice(-4)}`;
  }

  private numericCandidates(identifier: string): NumericCandidate[] {
    const candidates: NumericCandidate[] = [];
    const add = (label: string, rawValue: bigint) => {
      if (rawValue < 0n || rawValue > 2147483647n) return;
      const value = Number(rawValue);
      if (!candidates.some((candidate) => candidate.value === value)) {
        candidates.push({ label, value });
      }
    };

    if (/^\d+$/.test(identifier)) add('liczba dziesiętna', BigInt(identifier));
    return candidates;
  }

  private formatDate(value: Date | null): string {
    return value ? value.toISOString() : 'NULL';
  }

  private rejectionReason(
    active: boolean,
    started: boolean,
    notExpired: boolean,
  ): string {
    if (!active) return 'odrzucona: nieaktywna';
    if (!started) return 'odrzucona: okres ważności jeszcze się nie rozpoczął';
    if (!notExpired) return 'odrzucona: wygasła';
    return 'odrzucona';
  }
}
