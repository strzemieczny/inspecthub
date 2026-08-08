import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { RequestWithUser } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OPERATOR')
  create(@Body() dto: CreateInspectionDto, @Req() request: RequestWithUser) {
    return this.inspections.create(dto, request.user.userId);
  }
}
