import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppLogger } from './common/logger.service';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import * as crypto from 'crypto';
(global as any).crypto = crypto;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new AppLogger(), // use custom logger
  });

  app.useGlobalInterceptors(new LoggingInterceptor(new AppLogger()));
  
  await app.listen(process.env.PORT ?? 3000, () => {
    console.log(`Server is running on http://localhost:${process.env.PORT ?? 3000}`);
  });
}
bootstrap();
