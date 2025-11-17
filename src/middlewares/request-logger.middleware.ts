import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AppLogger } from 'src/common/logger.service';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  constructor(private readonly logger: AppLogger) {}

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();

    // log incoming request
    this.logger.log(
      {
        method: req.method,
        url: req.originalUrl,
        params: req.params,
        query: req.query,
        body: req.body,
      },
      'Request'
    );

    res.on('finish', () => {
      const duration = Date.now() - start;
      this.logger.log(
        {
          statusCode: res.statusCode,
          duration: `${duration}ms`,
        },
        'Response'
      );
    });

    next();
  }
}
