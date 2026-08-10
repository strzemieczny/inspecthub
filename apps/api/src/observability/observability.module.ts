import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { HttpLoggingInterceptor } from './http-logging.interceptor';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [EventsController],
  providers: [
    EventsService,
    { provide: APP_INTERCEPTOR, useClass: HttpLoggingInterceptor },
  ],
  exports: [EventsService],
})
export class ObservabilityModule {}
