import { Module } from "@nestjs/common";
import { SpotController } from "./spot.controller";
import { FutureController } from "./future.controller";
import { FutureHedgeController } from "./future-hedge.controller";
import { FutureOneWayController } from "./future-oneway.controller";
import { OkxService } from "./okx.service";
import { OkxFutureService } from "./okx-future.service";
import { OkxFutureHedgeService } from "./okx.future.hedge.service";
import { OkxFutureOneWayService } from "./okx.future.oneway.service";
import { LoggerModule } from "src/logger/logger.module";
import { EmailModule } from "src/email/email.module";

@Module({
    controllers: [SpotController, FutureController, FutureHedgeController, FutureOneWayController],
    providers: [OkxService, OkxFutureService, OkxFutureHedgeService, OkxFutureOneWayService],
    imports: [LoggerModule, EmailModule],
    exports: [OkxService, OkxFutureService, OkxFutureHedgeService, OkxFutureOneWayService],
})
export class OkxModule { }
