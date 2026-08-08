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
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateFormDto, UpdateFormDto } from './dto/form.dto';
import { FormsService } from './forms.service';

@Controller('forms')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateFormDto) {
    return this.forms.create(dto);
  }

  @Get()
  @Roles('ADMIN', 'OPERATOR')
  findAll(@Query('stationId') stationId?: string) {
    return this.forms.findAll(stationId);
  }

  @Get(':id')
  @Roles('ADMIN', 'OPERATOR')
  findOne(@Param('id') id: string) {
    return this.forms.findOne(id);
  }

  @Get(':id/revisions')
  @Roles('ADMIN')
  findRevisions(@Param('id') id: string) {
    return this.forms.findRevisions(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateFormDto) {
    return this.forms.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.forms.remove(id);
  }
}
