import { Injectable, Logger } from '@nestjs/common';
import type { MesTraceabilityPayload } from '@inspect-hub/types';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class MesConnectorService {
  private readonly logger = new Logger(MesConnectorService.name);

  constructor(private readonly database: DatabaseService) {}

  async sendTraceabilityData(
    inspectionResultId: string,
    payload: MesTraceabilityPayload,
  ): Promise<void> {
    const traceabilityRecord = {
      schema: 'inspect-hub.traceability.v1',
      source: 'inspect-hub',
      ...payload,
      completedAt: payload.completedAt.toISOString(),
    };

    // Adapter boundary: replace this log with an HTTP/MQ transport for the target MES.
    this.logger.log(`MES traceability: ${JSON.stringify(traceabilityRecord)}`);
    await this.database.inspectionResult.update({
      where: { id: inspectionResultId },
      data: { mesSynced: true },
    });
  }
}
