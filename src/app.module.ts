import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { SpotController } from './spot.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import okxConfig from './config/okx.config';
import { OkxService } from './okx.service';
import coinConfig from './config/coin.config';
import config from './config/config';
import { AppLogger } from './common/logger.service';
import { TasksModule } from './tasks/tasks.module';
import { ScheduleModule } from '@nestjs/schedule';
import { FutureController } from './future.controller';
import { OkxFutureService } from './okx-future.service';
import { FutureHedgeController } from './future-hedge.controller';
import { FutureOneWayController } from './future-oneway.controller';
import { OkxFutureHedgeService } from './okx.future.hedge.service';
import { OkxFutureOneWayService } from './okx.future.oneway.service';
import { RequestLoggerMiddleware } from './middlewares/request-logger.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,   // để tất cả module đều truy cập được
      load: [config, okxConfig, coinConfig],
    }),
    ScheduleModule.forRoot(),
    TasksModule,
  ],
  controllers: [SpotController, FutureController, FutureHedgeController, FutureOneWayController],
  providers: [AppService, OkxService, OkxFutureService, AppLogger, OkxFutureHedgeService, OkxFutureOneWayService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
