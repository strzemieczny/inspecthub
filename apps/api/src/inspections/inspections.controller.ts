import { MobileStationGuard } from '../stations/mobile-station.guard';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { RequestWithOptionalUser } from '../auth/auth.types';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CreateInspectionDto } from './dto/create-inspection.dto';
import { InspectionsService } from './inspections.service';

@Controller('inspections')
export class InspectionsController {
  constructor(private readonly inspections: InspectionsService) {}

  @Get('shift-summary')
  shiftSummary(
    @Query('stationCode') stationCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.inspections.getShiftSummary(stationCode, from, to);
  }

  @Get('public-dashboard')
  dashboard(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('processId') processId?: string,
    @Query('stationId') stationId?: string,
    @Query('formCode') formCode?: string,
    @Query('formIds') formIds?: string,
    @Query('result') result?: string,
    @Query('search') search?: string,
    @Query('timeZone') timeZone?: string,
    @Query('completeness') completeness?: string,
    @Query('partNumber') partNumber?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.inspections.getPublicDashboard({
      from,
      to,
      processId,
      stationId,
      formCode,
      formIds,
      result,
      search,
      timeZone,
      completeness,
      partNumber,
      page,
      pageSize,
    });
  }

  @Get('analytics/v1')
  analytics(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('processId') processId?: string,
    @Query('stationId') stationId?: string,
    @Query('formCode') formCode?: string,
    @Query('formIds') formIds?: string,
    @Query('result') result?: string,
    @Query('search') search?: string,
    @Query('timeZone') timeZone?: string,
    @Query('completeness') completeness?: string,
    @Query('partNumber') partNumber?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.inspections.getPublicDashboard({
      from,
      to,
      processId,
      stationId,
      formCode,
      formIds,
      result,
      search,
      timeZone,
      completeness,
      partNumber,
      page,
      pageSize,
    });
  }

  @Get('analytics/v1/export')
  async export(
    @Res() response: Response,
    @Query('format') format = 'csv',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('processId') processId?: string,
    @Query('stationId') stationId?: string,
    @Query('formCode') formCode?: string,
    @Query('formIds') formIds?: string,
    @Query('result') result?: string,
    @Query('search') search?: string,
    @Query('timeZone') timeZone?: string,
    @Query('completeness') completeness?: string,
    @Query('partNumber') partNumber?: string,
  ) {
    if (!['csv', 'xlsx', 'pdf'].includes(format)) {
      throw new BadRequestException('Obsługiwane formaty: csv, xlsx, pdf');
    }
    const file = await this.inspections.exportAnalytics(
      {
        from,
        to,
        processId,
        stationId,
        formCode,
        formIds,
        result,
        search,
        timeZone,
        completeness,
        partNumber,
      },
      format as 'csv' | 'xlsx' | 'pdf',
    );
    response.setHeader('Content-Type', file.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    response.send(file.buffer);
  }

  @Get('quality-dashboard')
  qualityDashboard() {
    return this.inspections.getQualityDashboard();
  }

  @Post()
  @UseGuards(OptionalJwtAuthGuard, MobileStationGuard)
  create(
    @Body() dto: CreateInspectionDto,
    @Req() request: RequestWithOptionalUser,
  ) {
    return this.inspections.create(dto, request.user?.userId ?? null);
  }
}
