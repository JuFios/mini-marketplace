import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerLimitDetail } from '@nestjs/throttler/dist/throttler.guard.interface';

/**
 * Always answers with the plain `Retry-After` header. The stock guard suffixes it with the name
 * of the limiter that tripped (`Retry-After-login-identity`), which clients would not look for.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { res } = this.getRequestResponse(context);
    (res as { header(name: string, value: string): unknown }).header(
      'Retry-After',
      String(detail.timeToBlockExpire),
    );
    return super.throwThrottlingException(context, detail);
  }
}
