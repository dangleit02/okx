import { Injectable } from '@nestjs/common';
import { OkxFutureBaseService } from './okx.future.base.service';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from './common/logger.service';

@Injectable()
export class OkxFutureHedgeService extends OkxFutureBaseService {
  constructor(protected config: ConfigService, protected readonly logger: AppLogger) {
    super(config, logger);
  }

  protected includePosSide(): boolean {
    return true;
  }

  protected getPosSide(direction: 'long' | 'short'): 'long' | 'short' {
    // In hedge mode, posSide is required and equals direction
    return direction;
  }
}
