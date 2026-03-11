import { Module } from "@nestjs/common";
import { EmailService } from "./email.service";
import { LoggerModule } from "src/logger/logger.module";

@Module({
  providers: [EmailService],
  imports: [LoggerModule],
  exports: [EmailService],
})
export class EmailModule { }
