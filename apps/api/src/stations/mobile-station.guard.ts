import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { StationsService } from './stations.service';

@Injectable()
export class MobileStationGuard implements CanActivate {
  constructor(private readonly stations: StationsService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const deviceId = request.get('x-device-id');
    const token = request.get('x-device-token');
    // Browser clients retain their existing cookie flow. Mobile always sends its UUID.
    if (deviceId === undefined && token === undefined) return true;
    const body = request.body as
      | { stationCode?: unknown; stationId?: unknown }
      | undefined;
    const stationCode = body?.stationCode ?? body?.stationId;
    await this.stations.currentMobile(
      deviceId,
      token,
      typeof stationCode === 'string' ? stationCode : '',
    );
    return true;
  }
}
