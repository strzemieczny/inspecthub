import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Param,
} from '@nestjs/common';
import {
  DevScadaInspectionResultDto,
  DevScadaRouteCheckDto,
} from './dto/scada.dto';

/** Local SCADA simulator. It is intentionally unavailable in production. */
@Controller('dev/scada')
export class DevScadaController {
  @Post('route-check')
  routeCheck(@Body() dto: DevScadaRouteCheckDto) {
    this.ensureDevelopment();
    const serialNumber = dto.serialNumber.trim().toUpperCase();
    if (serialNumber.endsWith('_OK')) {
      return {
        allowed: true as const,
        serverUrl: `http://localhost:3000/api/dev/scada/product-history/${encodeURIComponent(dto.serialNumber.trim())}`,
        product: {
          partNumber: `DEV-${serialNumber.slice(0, -3) || 'PRODUCT'}`,
          productFamily: 'DEV',
        },
      };
    }
    if (serialNumber.endsWith('_NOK')) return { allowed: false as const };
    throw new BadRequestException(
      'Deweloperski numer seryjny musi kończyć się na _OK albo _NOK',
    );
  }

  @Get('product-history/:serialNumber')
  productHistory(@Param('serialNumber') serialNumber: string) {
    this.ensureDevelopment();
    return {
      serialNumber,
      source: 'development-scada',
      message: 'Deweloperska historia produktu SCADA',
    };
  }

  @Post('inspection-result')
  inspectionResult(@Body() dto: DevScadaInspectionResultDto) {
    this.ensureDevelopment();
    return {
      accepted: true,
      received: {
        serialNumber: dto.serialNumber,
        processName: dto.processName,
        result: dto.result,
        reportUrl: dto.reportUrl,
      },
    };
  }

  private ensureDevelopment(): void {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
  }
}
