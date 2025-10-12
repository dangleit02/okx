import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import okxConfig from './config/okx.config';
import { OkxService } from './okx.service';
import coinConfig from './config/coin.config';
import config from './config/config';
import { AppLogger } from './common/logger.service';
import { TasksModule } from './tasks/tasks.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,   // để tất cả module đều truy cập được
      load: [config, okxConfig, coinConfig],
    }),
    ScheduleModule.forRoot(),
    TasksModule,
  ],
  controllers: [AppController],
  providers: [AppService, OkxService, AppLogger],
})
export class AppModule {}
