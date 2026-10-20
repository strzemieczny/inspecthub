import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Header,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  CreateStationDto,
  IdentifyStationDto,
  UpdateStationDto,
  PairMobileStationDto,
} from './dto/station.dto';
import { StationsService } from './stations.service';

@Controller('stations')
export class StationsController {
  constructor(private readonly stations: StationsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'OPERATOR')
  findAll() {
    return this.stations.findAll();
  }

  @Get('current')
  async current(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.stations.resolveCurrent(
      this.clientIp(request),
      this.deviceToken(request),
    );
    if (result.token) this.setDeviceCookie(response, result.token);
    return result.station;
  }

  @Post('identify')
  async identify(
    @Body() dto: IdentifyStationDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.stations.identify(dto, this.clientIp(request));
    this.setDeviceCookie(response, result.token);
    return result.station;
  }

  @Post('mobile/pair')
  @Header('Cache-Control', 'no-store')
  pairMobile(@Body() dto: PairMobileStationDto, @Req() request: Request) {
    return this.stations.pairMobile(dto, request.get('x-device-token'));
  }

  @Get('mobile/current')
  @Header('Cache-Control', 'no-store')
  currentMobile(@Req() request: Request) {
    return this.stations.currentMobile(
      request.get('x-device-id'),
      request.get('x-device-token'),
    );
  }

  @Delete(':id/mobile-device')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  unpairMobile(@Param('id') id: string) {
    return this.stations.unpairMobile(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  create(@Body() dto: CreateStationDto) {
    return this.stations.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  update(@Param('id') id: string, @Body() dto: UpdateStationDto) {
    return this.stations.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.stations.remove(id);
  }

  private clientIp(request: Request): string {
    return (request.ip || request.socket.remoteAddress || 'unknown').replace(
      /^::ffff:/,
      '',
    );
  }

  private deviceToken(request: Request): string | undefined {
    const item = request.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('inspect_hub_station='));
    if (!item) return undefined;
    return decodeURIComponent(item.slice('inspect_hub_station='.length));
  }

  private setDeviceCookie(response: Response, token: string): void {
    response.cookie('inspect_hub_station', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure:
        process.env.STATION_COOKIE_SECURE === undefined
          ? process.env.NODE_ENV === 'production'
          : process.env.STATION_COOKIE_SECURE === 'true',
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: '/api',
    });
  }
}
