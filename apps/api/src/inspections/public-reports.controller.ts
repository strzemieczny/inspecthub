import { Controller, Get, Param } from '@nestjs/common';
import { InspectionsService } from './inspections.service';

@Controller('public/reports')
export class PublicReportsController {
  constructor(private readonly inspections: InspectionsService) {}

  @Get(':publicReportId')
  getReport(@Param('publicReportId') publicReportId: string) {
    return this.inspections.getPublicReport(publicReportId);
  }
}
