import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import okxConfig from './config/okx.config';
import coinConfig from './config/coin.config';
import config from './config/config';
import { TasksModule } from './tasks/tasks.module';
import { ScheduleModule } from '@nestjs/schedule';
import { RequestLoggerMiddleware } from './middlewares/request-logger.middleware';
import { OkxModule } from './okx/okx.module';
import { LoggerModule } from './logger/logger.module';
import { EmailModule } from './email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,   // để tất cả module đều truy cập được
      load: [config, okxConfig, coinConfig],
    }),
    ScheduleModule.forRoot(),
    TasksModule,
    OkxModule,
    LoggerModule,
    EmailModule,
  ],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
