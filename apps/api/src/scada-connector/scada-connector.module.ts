import { Module } from '@nestjs/common';
import { ScadaConnectorController } from './scada-connector.controller';
import { ScadaConnectorService } from './scada-connector.service';
import { DevScadaController } from './dev-scada.controller';

@Module({
  controllers: [ScadaConnectorController, DevScadaController],
  providers: [ScadaConnectorService],
  exports: [ScadaConnectorService],
})
export class ScadaConnectorModule {}
