import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AppLogger } from '../common/logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url, body, params, query } = req;

    this.logger.log(
      `➡️  ${method} ${url}\n` +
      `params: ${JSON.stringify(params, null, 2)}\n` +
      `query:  ${JSON.stringify(query, null, 2)}\n` +
      `body:   ${JSON.stringify(body, null, 2)}`,
      'Request',
    );

    const now = Date.now();

    return next.handle().pipe(
      tap((responseData) => {
        const res = context.switchToHttp().getResponse();
        this.logger.log(
          `⬅️  ${method} ${url} | ${res.statusCode} | +${Date.now() - now}ms\n` +
          `response:\n${JSON.stringify(responseData, null, 2)}`,
          'Response',
        );
      }),
    );
  }
}
