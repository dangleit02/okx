import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppLogger } from './logger/logger.service';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { EmailService } from './email/email.service';
// (global as any).crypto = crypto;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true, // dùng để Nest log -> AppLogger
  });

  const logger = app.get(AppLogger);
  const emailService = app.get(EmailService);

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter(logger, emailService));

  await app.listen(process.env.PORT ?? 3000, () => {
    console.log(`Server is running on http://localhost:${process.env.PORT ?? 3000}`);
  });
}
bootstrap();
