import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { EmailService } from 'src/email/email.service';
import { AppLogger } from 'src/logger/logger.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly logger: AppLogger,
    private readonly emailService: EmailService,
  ) {}

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = exception.message || 'Internal server error';

    // extract Axios / external API error details
    const extraErrorData =
      exception?.response?.data ??
      exception?.response ??
      undefined;

    // log chi tiết
    const content = {
        method: request.method,
        url: request.url,
        params: request.params,
        query: request.query,
        body: request.body,
        user: request['user'] ?? null,
        message,
        stack: exception.stack,
        extra: extraErrorData, // Axios/HTTP response body
      };
    this.logger.error(
      content,
      undefined,
      'Exception',
    );

    this.emailService.sendEmail(process.env.EMAIL_TO, "Exception", content);

    // trả response chuẩn cho client
    response.status(status).json({
      statusCode: status,
      message,
      errorData: extraErrorData, // optional, gửi luôn cho client nếu muốn
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
