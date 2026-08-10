import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { WsAdapter } from '@nestjs/platform-ws';
import type { NextFunction, Request, Response } from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.disable('x-powered-by');
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader(
      'Permissions-Policy',
      'camera=(self), microphone=(), geolocation=()',
    );
    next();
  });
  app.useWebSocketAdapter(new WsAdapter(app));
  if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin:
      process.env.NODE_ENV === 'production'
        ? (process.env.WEB_ORIGIN ?? false)
        : true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000, process.env.HOST ?? 'localhost');
}
void bootstrap();
