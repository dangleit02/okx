import { Module } from "@nestjs/common";
import { TasksService } from "./tasks.service";
import { OkxService } from "src/okx.service";
import { AppLogger } from "src/common/logger.service";

@Module({
  providers: [TasksService, OkxService, AppLogger],
})
export class TasksModule { }
