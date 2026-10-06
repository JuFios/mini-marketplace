import { ApiError } from './errors';

const GENERIC = 'Something went wrong. Please try again.';

// Codes whose server message is not the wording a user should read.
const MESSAGES: Record<string, string | undefined> = {
  NETWORK_ERROR: 'Cannot reach the server. Check your connection and try again.',
  INVALID_CREDENTIALS: 'Invalid email or password.',
  EMAIL_ALREADY_REGISTERED: 'An account with this email already exists.',
  TOO_MANY_REQUESTS: 'Too many attempts. Please wait a moment and try again.',
  VALIDATION_FAILED: 'Some of the entered values are invalid.',
  UNAUTHORIZED: 'Your session has expired. Please log in again.',
  FORBIDDEN: 'You do not have permission to do that.',
};

/**
 * What to show a person for a failed call. Business errors (4xx) carry a readable message from the
 * API; anything unexpected (5xx, parse failures, non-API errors) gets a generic text, so internals
 * never reach the screen.
 */
export function getErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return GENERIC;
  const known = MESSAGES[error.code];
  if (known) return known;
  return error.status >= 400 && error.status < 500 ? error.message : GENERIC;
}
