import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');

  // Required on purpose: without CORS declared the app does not start,
  // instead of silently allowing `*`. Comma-separated list of origins.
  const origin = config
    .getOrThrow<string>('CORS')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  app.enableCors({ origin });

  await app.listen(config.get<number>('PORT') ?? 3000);
}
await bootstrap();
