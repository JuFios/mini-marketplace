import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../exceptions/error-codes';
import { readRequestId } from '../request-id';
import { toAppException } from './exception-mapper';

/** Shape of every error response (see the API error envelope). */
export interface ErrorResponseBody {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
  requestId: string;
  timestamp: string;
  path: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@InjectPinoLogger(AllExceptionsFilter.name) private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const appException = toAppException(exception);
    const requestId = readRequestId(request, response);

    // 4xx are the client's mistakes and already appear in the request log; 5xx need the
    // original error (stack included), which is never sent to the client.
    if (appException.httpStatus >= 500) {
      this.logger.error({ err: exception, requestId }, 'Request failed');
    }

    // Headers are already out (an error in the middle of a streamed body): the status can no
    // longer change, so the only option left is to terminate the response.
    if (response.headersSent) {
      response.end();
      return;
    }

    const body: ErrorResponseBody = {
      statusCode: appException.httpStatus,
      code: appException.code,
      message: appException.message,
      ...(appException.details !== undefined && { details: appException.details }),
      requestId,
      timestamp: new Date().toISOString(),
      path: request.path,
    };
    response.status(appException.httpStatus).json(body);
  }
}
