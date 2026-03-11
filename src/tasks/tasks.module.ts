import { Module } from "@nestjs/common";
import { TasksService } from "./tasks.service";
import { OkxModule } from "src/okx/okx.module";
import { LoggerModule } from "src/logger/logger.module";

@Module({
  providers: [TasksService],
  imports: [OkxModule, LoggerModule],
})
export class TasksModule { }
