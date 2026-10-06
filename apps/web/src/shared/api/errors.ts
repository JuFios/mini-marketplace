import axios from 'axios';

/** Failures that never reached the API (offline, DNS, CORS, timeout) have no HTTP status. */
const NETWORK_ERROR = 'NETWORK_ERROR';
const UNKNOWN_ERROR = 'UNKNOWN_ERROR';
const VALIDATION_FAILED = 'VALIDATION_FAILED';

export interface ApiErrorInit {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string | undefined;
}

/** The API's error envelope (`code`, `message`, `details`, `requestId`) as one throwable type. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor({ status, code, message, details, requestId }: ApiErrorInit) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Turns anything an HTTP call can throw into an `ApiError`. Idempotent. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (axios.isAxiosError(error)) {
    const { response } = error;
    if (!response) {
      return new ApiError({
        status: 0,
        code: NETWORK_ERROR,
        message: 'Cannot reach the server.',
      });
    }
    const body: unknown = response.data;
    const headerId: unknown = response.headers['x-request-id'];
    const headerRequestId = typeof headerId === 'string' ? headerId : undefined;

    // Anything that is not our envelope (a proxy's HTML 502 page, say) keeps just the status.
    if (isRecord(body) && typeof body.code === 'string' && typeof body.message === 'string') {
      return new ApiError({
        status: response.status,
        code: body.code,
        message: body.message,
        details: body.details,
        requestId: typeof body.requestId === 'string' ? body.requestId : headerRequestId,
      });
    }
    return new ApiError({
      status: response.status,
      code: UNKNOWN_ERROR,
      message: `Request failed with status ${response.status}.`,
      requestId: headerRequestId,
    });
  }

  return new ApiError({
    status: 0,
    code: UNKNOWN_ERROR,
    message: error instanceof Error ? error.message : 'Unexpected error.',
  });
}

export interface FieldError {
  field: string;
  message: string;
}

/**
 * Per-field problems of a `VALIDATION_FAILED` response (`details: [{ field, messages }]`),
 * first message of each field. Empty for every other error.
 */
export function getFieldErrors(error: unknown): FieldError[] {
  if (!(error instanceof ApiError) || error.code !== VALIDATION_FAILED) return [];
  if (!Array.isArray(error.details)) return [];

  const details: unknown[] = error.details;
  const result: FieldError[] = [];
  for (const item of details) {
    if (!isRecord(item) || typeof item.field !== 'string' || !Array.isArray(item.messages)) {
      continue;
    }
    const messages: unknown[] = item.messages;
    const first = messages.find((message): message is string => typeof message === 'string');
    if (first !== undefined) result.push({ field: item.field, message: first });
  }
  return result;
}
