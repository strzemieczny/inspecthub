import { Module } from '@nestjs/common';
import { MesConnectorService } from './mes-connector.service';

@Module({ providers: [MesConnectorService], exports: [MesConnectorService] })
export class MesConnectorModule {}
