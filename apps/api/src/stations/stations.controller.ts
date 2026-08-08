import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
} from './dto/station.dto';
import { StationsService } from './stations.service';

@Controller('stations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StationsController {
  constructor(private readonly stations: StationsService) {}

  @Get()
  @Roles('ADMIN', 'OPERATOR')
  findAll() {
    return this.stations.findAll();
  }

  @Get('current')
  @Roles('ADMIN', 'OPERATOR')
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
  @Roles('ADMIN', 'OPERATOR')
  async identify(
    @Body() dto: IdentifyStationDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.stations.identify(
      dto.code,
      this.clientIp(request),
    );
    this.setDeviceCookie(response, result.token);
    return result.station;
  }

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateStationDto) {
    return this.stations.create(dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateStationDto) {
    return this.stations.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
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
      secure: process.env.NODE_ENV === 'production',
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: '/api',
    });
  }
}
