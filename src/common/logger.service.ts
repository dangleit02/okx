import { Injectable, LoggerService } from '@nestjs/common';

@Injectable()
export class AppLogger implements LoggerService {
  log(message: any, context?: string) {
    console.log(`[LOG]${context ? ' [' + context + ']' : ''} -`, message);
  }

  error(message: any, trace?: string, context?: string) {
    console.error(`[ERROR]${context ? ' [' + context + ']' : ''} -`, message);
    if (trace) console.error(trace);
  }

  warn(message: any, context?: string) {
    console.warn(`[WARN]${context ? ' [' + context + ']' : ''} -`, message);
  }

  debug(message: any, context?: string) {
    console.debug(`[DEBUG]${context ? ' [' + context + ']' : ''} -`, message);
  }

  verbose(message: any, context?: string) {
    console.info(`[VERBOSE]${context ? ' [' + context + ']' : ''} -`, message);
  }
}
