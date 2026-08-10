import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateInspectionDto } from './dto/create-inspection.dto';
import { InspectionsService } from './inspections.service';

@Controller('inspections')
export class InspectionsController {
  constructor(private readonly inspections: InspectionsService) {}

  @Get('public-dashboard')
  dashboard() {
    return this.inspections.getPublicDashboard();
  }

  @Post()
  create(@Body() dto: CreateInspectionDto) {
    return this.inspections.create(dto, null);
  }
}
