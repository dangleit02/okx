import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppLogger } from './common/logger.service';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import * as crypto from 'crypto';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { RequestLoggerMiddleware } from './middlewares/request-logger.middleware';
(global as any).crypto = crypto;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true, // dùng để Nest log -> AppLogger
  });

  const logger = app.get(AppLogger);

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter(logger));

  await app.listen(process.env.PORT ?? 3000, () => {
    console.log(`Server is running on http://localhost:${process.env.PORT ?? 3000}`);
  });
}
bootstrap();
