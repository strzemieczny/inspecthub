import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  RouteCheckResult,
  ScadaInspectionResultRequest,
  ScadaRouteCheckResponse,
  ScadaSettings,
} from '@inspect-hub/types';
import { DatabaseService } from '../database/database.service';
import type { UpdateScadaSettingsDto } from './dto/scada.dto';

const SETTINGS_ID = 'default';

@Injectable()
export class ScadaConnectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScadaConnectorService.name);
  private timer?: NodeJS.Timeout;
  private processing = false;

  constructor(private readonly database: DatabaseService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.processPending(), 5000);
    this.timer.unref();
    void this.processPending();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async getSettings(): Promise<ScadaSettings> {
    return this.database.scadaSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
      select: {
        enabled: true,
        baseUrl: true,
        routeCheckPath: true,
        submitResultPath: true,
        publicWebUrl: true,
        timeoutMs: true,
      },
    });
  }

  async updateSettings(
    dto: UpdateScadaSettingsDto,
    userId: string,
  ): Promise<ScadaSettings> {
    const settings = this.normalizeSettings(dto);
    return this.database.scadaSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...settings, updatedBy: userId },
      update: { ...settings, updatedBy: userId },
      select: {
        enabled: true,
        baseUrl: true,
        routeCheckPath: true,
        submitResultPath: true,
        publicWebUrl: true,
        timeoutMs: true,
      },
    });
  }

  async routeCheck(
    serialNumberInput: string,
    stationCodeInput: string,
  ): Promise<RouteCheckResult> {
    const serialNumber = serialNumberInput.trim();
    const stationCode = stationCodeInput.trim().toUpperCase();
    const station = await this.database.station.findUnique({
      where: { code: stationCode },
      include: { process: true },
    });
    if (!station?.active)
      throw new NotFoundException('Nie znaleziono aktywnego stanowiska');
    if (!station.process)
      throw new BadRequestException('Stanowisko nie ma przypisanego procesu');

    const settings = await this.getSettings();
    if (!settings.enabled) {
      if (this.isDevelopmentSimulation()) {
        return this.storeRouteCheck(
          this.simulateRouteCheck(serialNumber),
          serialNumber,
          stationCode,
          station.process.name,
        );
      }
      throw new ServiceUnavailableException(
        'Connector SCADA jest wyłączony. Włącz go w ustawieniach administratora.',
      );
    }
    if (!settings.baseUrl)
      throw new ServiceUnavailableException(
        'Connector SCADA nie ma skonfigurowanego URL',
      );

    const response = await this.requestJson<ScadaRouteCheckResponse>(
      this.endpoint(settings.baseUrl, settings.routeCheckPath),
      { serialNumber, processName: station.process.name },
      settings.timeoutMs,
    );
    this.validateRouteCheckResponse(response);
    return this.storeRouteCheck(
      response,
      serialNumber,
      stationCode,
      station.process.name,
    );
  }

  private async storeRouteCheck(
    response: ScadaRouteCheckResponse,
    serialNumber: string,
    stationCode: string,
    processName: string,
  ): Promise<RouteCheckResult> {
    const record = await this.database.routeCheck.create({
      data: {
        serialNumber,
        stationCode,
        processName,
        allowed: response.allowed,
        partNumber: response.allowed ? response.product.partNumber : null,
        productFamily: response.allowed ? response.product.productFamily : null,
        serverUrl: response.allowed ? response.serverUrl : null,
      },
    });
    return { ...response, routeCheckId: record.id, integrationEnabled: true };
  }

  private simulateRouteCheck(serialNumber: string): ScadaRouteCheckResponse {
    const normalized = serialNumber.toUpperCase();
    if (normalized.endsWith('_NOK')) return { allowed: false };
    if (normalized.endsWith('_OK')) {
      return {
        allowed: true,
        serverUrl: `http://localhost:3000/api/dev/scada/product-history/${encodeURIComponent(serialNumber)}`,
        product: {
          partNumber: `DEV-${normalized.slice(0, -3) || 'PRODUCT'}`,
          productFamily: 'DEV',
        },
      };
    }
    throw new BadRequestException(
      'W trybie deweloperskim numer seryjny musi kończyć się na _OK albo _NOK',
    );
  }

  private isDevelopmentSimulation(): boolean {
    return (
      process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test'
    );
  }

  async processPending(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      const settings = await this.getSettings();
      if (!settings.enabled || !settings.baseUrl) return;
      const deliveries = await this.database.scadaDelivery.findMany({
        where: {
          status: { in: ['PENDING', 'RETRYING'] },
          nextAttemptAt: { lte: new Date() },
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
      for (const delivery of deliveries)
        await this.deliver(
          delivery.id,
          delivery.payload as unknown as ScadaInspectionResultRequest,
          settings,
        );
    } catch (error) {
      this.logger.error(
        `Przetwarzanie kolejki SCADA nie powiodło się: ${this.errorMessage(error)}`,
      );
    } finally {
      this.processing = false;
    }
  }

  private async deliver(
    id: string,
    payload: ScadaInspectionResultRequest,
    settings: ScadaSettings,
  ): Promise<void> {
    try {
      const response = await this.requestJson<{ accepted: boolean }>(
        this.endpoint(settings.baseUrl, settings.submitResultPath),
        payload,
        Math.max(settings.timeoutMs, 10000),
      );
      if (response.accepted !== true)
        throw new BadGatewayException('SCADA odrzuciła wynik inspekcji');
      await this.database.scadaDelivery.update({
        where: { id },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
          lastError: null,
          inspectionResult: { update: { mesSynced: true } },
        },
      });
    } catch (error) {
      const current = await this.database.scadaDelivery.findUniqueOrThrow({
        where: { id },
        select: { attemptCount: true },
      });
      const attempts = current.attemptCount + 1;
      const failed = attempts >= 10;
      const delayMinutes = Math.min(2 ** Math.max(attempts - 1, 0), 60);
      await this.database.scadaDelivery.update({
        where: { id },
        data: {
          status: failed ? 'FAILED' : 'RETRYING',
          attemptCount: attempts,
          lastError: this.errorMessage(error).slice(0, 1000),
          nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000),
        },
      });
      this.logger.warn(
        `Wysyłka wyniku SCADA ${id} nie powiodła się (próba ${attempts}): ${this.errorMessage(error)}`,
      );
    }
  }

  private async requestJson<T>(
    url: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        `Brak połączenia ze SCADA: ${this.errorMessage(error)}`,
      );
    }
    if (!response.ok)
      throw new BadGatewayException(`SCADA zwróciła HTTP ${response.status}`);
    try {
      return (await response.json()) as T;
    } catch {
      throw new BadGatewayException('SCADA zwróciła nieprawidłowy JSON');
    }
  }

  private validateRouteCheckResponse(response: ScadaRouteCheckResponse): void {
    if (!response || typeof response.allowed !== 'boolean')
      throw new BadGatewayException('Odpowiedź SCADA nie zawiera pola allowed');
    if (
      response.allowed &&
      (!response.serverUrl ||
        !response.product?.partNumber ||
        !response.product?.productFamily)
    ) {
      throw new BadGatewayException(
        'SCADA zezwoliła na inspekcję bez serverUrl lub kompletnych danych produktu',
      );
    }
  }

  private normalizeSettings(dto: UpdateScadaSettingsDto): ScadaSettings {
    const path = (value: string) => `/${value.trim().replace(/^\/+/, '')}`;
    return {
      enabled: dto.enabled,
      baseUrl: dto.baseUrl.trim().replace(/\/+$/, ''),
      routeCheckPath: path(dto.routeCheckPath),
      submitResultPath: path(dto.submitResultPath),
      publicWebUrl: dto.publicWebUrl.trim().replace(/\/+$/, ''),
      timeoutMs: dto.timeoutMs,
    };
  }

  private endpoint(baseUrl: string, path: string): string {
    return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
