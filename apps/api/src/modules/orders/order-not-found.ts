import { ResourceNotFoundException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';

/** One answer for "no such order" and "not your order", so ids cannot be probed for existence. */
export function orderNotFound(): ResourceNotFoundException {
  return new ResourceNotFoundException('Order not found', ErrorCode.ORDER_NOT_FOUND);
}
