import { Injectable } from '@nestjs/common';
import { OkxFutureBaseService } from './okx.future.base.service';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from './common/logger.service';

@Injectable()
export class OkxFutureOneWayService extends OkxFutureBaseService {
  constructor(protected config: ConfigService, protected readonly logger: AppLogger) {
    super(config, logger);
  }

  protected includePosSide(): boolean {
    // One-way mode: don't include posSide in requests
    return false;
  }

  protected getPosSide(direction: 'long' | 'short'): undefined {
    return undefined;
  }
}
