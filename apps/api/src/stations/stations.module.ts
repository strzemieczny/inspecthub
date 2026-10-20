import { MobileStationGuard } from './mobile-station.guard';
import { Module } from '@nestjs/common';
import { StationsController } from './stations.controller';
import { StationsService } from './stations.service';

@Module({
  controllers: [StationsController],
  providers: [StationsService, MobileStationGuard],
  exports: [StationsService, MobileStationGuard],
})
export class StationsModule {}
