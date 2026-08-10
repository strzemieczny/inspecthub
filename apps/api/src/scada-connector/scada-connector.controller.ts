import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RequestWithUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RouteCheckDto, UpdateScadaSettingsDto } from './dto/scada.dto';
import { ScadaConnectorService } from './scada-connector.service';

@Controller('scada')
export class ScadaConnectorController {
  constructor(private readonly scada: ScadaConnectorService) {}

  @Post('route-check')
  routeCheck(@Body() dto: RouteCheckDto) {
    return this.scada.routeCheck(dto.serialNumber, dto.stationCode);
  }

  @Get('settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  settings() {
    return this.scada.getSettings();
  }

  @Patch('settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  updateSettings(
    @Body() dto: UpdateScadaSettingsDto,
    @Req() request: RequestWithUser,
  ) {
    return this.scada.updateSettings(dto, request.user.userId);
  }
}
