import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RequestWithUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateFormDto, DuplicateFormDto, UpdateFormDto } from './dto/form.dto';
import { FormsService } from './forms.service';

@Controller('forms')
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  create(@Body() dto: CreateFormDto, @Req() request: RequestWithUser) {
    return this.forms.create(dto, request.user.userId);
  }

  @Post(':id/duplicate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  duplicate(
    @Param('id') id: string,
    @Body() dto: DuplicateFormDto,
    @Req() request: RequestWithUser,
  ) {
    return this.forms.duplicate(id, dto, request.user.userId);
  }

  @Get()
  findAll(@Query('stationId') stationId?: string) {
    return this.forms.findAll(stationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.forms.findOne(id);
  }

  @Get(':id/revisions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  findRevisions(@Param('id') id: string) {
    return this.forms.findRevisions(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFormDto,
    @Req() request: RequestWithUser,
  ) {
    return this.forms.update(id, dto, request.user.userId);
  }

  @Patch(':id/archive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(204)
  archive(@Param('id') id: string) {
    return this.forms.archive(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.forms.remove(id);
  }
}
