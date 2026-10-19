import { FormsModule } from '../forms/forms.module';
import { Module } from '@nestjs/common';
import { ScadaConnectorController } from './scada-connector.controller';
import { ScadaConnectorService } from './scada-connector.service';
import { DevScadaController } from './dev-scada.controller';

@Module({
  imports: [FormsModule],
  controllers: [ScadaConnectorController, DevScadaController],
  providers: [ScadaConnectorService],
  exports: [ScadaConnectorService],
})
export class ScadaConnectorModule {}
