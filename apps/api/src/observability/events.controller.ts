import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { RequestWithUser } from '../auth/auth.types';
import { CollectEventDto, EventQueryDto } from './dto/event.dto';
import { EventsService } from './events.service';

@Controller('events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  collect(@Body() dto: CollectEventDto, @Req() request: RequestWithUser) {
    return this.events.collect(dto, request.user.userId);
  }

  @Get()
  @Roles('ADMIN')
  find(@Query() query: EventQueryDto) {
    return this.events.find(query);
  }
}
