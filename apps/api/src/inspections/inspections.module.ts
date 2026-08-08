import { Module } from '@nestjs/common';
import { MesConnectorModule } from '../mes-connector/mes-connector.module';
import { InspectionsController } from './inspections.controller';
import { InspectionsService } from './inspections.service';

@Module({
  imports: [MesConnectorModule],
  controllers: [InspectionsController],
  providers: [InspectionsService],
})
export class InspectionsModule {}
