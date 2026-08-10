import { Module } from '@nestjs/common';
import { ScadaConnectorModule } from '../scada-connector/scada-connector.module';
import { AuthModule } from '../auth/auth.module';
import { InspectionsController } from './inspections.controller';
import { InspectionsService } from './inspections.service';
import { PublicReportsController } from './public-reports.controller';
import { QualityLiveGateway } from './quality-live.gateway';

@Module({
  imports: [ScadaConnectorModule, AuthModule],
  controllers: [InspectionsController, PublicReportsController],
  providers: [InspectionsService, QualityLiveGateway],
})
export class InspectionsModule {}
