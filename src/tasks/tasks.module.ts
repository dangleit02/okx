import { Module } from "@nestjs/common";
import { TasksService } from "./tasks.service";
import { OkxService } from "src/okx.service";
import { AppLogger } from "src/common/logger.service";
import { OkxFutureBaseService } from "src/okx.future.base.service";
import { OkxFutureHedgeService } from "src/okx.future.hedge.service";

@Module({
  providers: [TasksService, OkxService, AppLogger, OkxFutureHedgeService],
})
export class TasksModule { }
