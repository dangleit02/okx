import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import okxConfig from './config/okx.config';
import { OkxService } from './okx.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,   // để tất cả module đều truy cập được
      load: [okxConfig],
    }),
  ],
  controllers: [AppController],
  providers: [AppService, OkxService],
})
export class AppModule {}
