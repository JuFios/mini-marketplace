import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { SerializedRequest, SerializedResponse } from 'pino';
import { AppConfigService } from '../../config/app-config.service';
import { assignRequestId } from '../../common/request-id';
import { LOG_REDACT_CENSOR, LOG_REDACT_PATHS } from './redaction';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.logLevel,
          genReqId: assignRequestId,
          // Application logs written while a request is handled carry only `requestId`
          // instead of repeating the whole serialised request on every line.
          quietReqLogger: true,
          customAttributeKeys: { reqId: 'requestId' },
          customLogLevel: (_req, res, error) => {
            if (error || res.statusCode >= 500) return 'error';
            return res.statusCode >= 400 ? 'warn' : 'info';
          },
          // Headers are not logged at all: they carry credentials (Authorization, Cookie) and,
          // on responses, only security headers that would repeat on every line. Redaction
          // below stays as the safety net should a serializer ever start including them.
          // pino-http hands these functions the standard serialised form, not the raw objects.
          serializers: {
            req: (req: SerializedRequest) => ({
              id: req.id,
              method: req.method,
              url: req.url,
              remoteAddress: req.remoteAddress,
            }),
            res: (res: SerializedResponse) => ({ statusCode: res.statusCode }),
          },
          redact: { paths: [...LOG_REDACT_PATHS], censor: LOG_REDACT_CENSOR },
        },
      }),
    }),
  ],
})
export class AppLoggerModule {}
