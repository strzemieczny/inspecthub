import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { FormsModule } from './forms/forms.module';
import { InspectionsModule } from './inspections/inspections.module';
import { MediaModule } from './media/media.module';
import { ScadaConnectorModule } from './scada-connector/scada-connector.module';
import { StationsModule } from './stations/stations.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    DatabaseModule,
    AuthModule,
    MediaModule,
    ScadaConnectorModule,
    FormsModule,
    InspectionsModule,
    StationsModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
