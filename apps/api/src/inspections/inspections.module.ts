import { Module } from '@nestjs/common';
import { ScadaConnectorModule } from '../scada-connector/scada-connector.module';
import { InspectionsController } from './inspections.controller';
import { InspectionsService } from './inspections.service';
import { PublicReportsController } from './public-reports.controller';

@Module({
  imports: [ScadaConnectorModule],
  controllers: [InspectionsController, PublicReportsController],
  providers: [InspectionsService],
})
export class InspectionsModule {}
