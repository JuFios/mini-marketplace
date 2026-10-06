const REFRESH_LOCK = 'auth-refresh';

/**
 * Runs `task` so that no other tab of this browser runs it at the same time.
 *
 * Every refresh rotates the refresh cookie, which all tabs share. Two tabs presenting the same
 * cookie at once would look like a stolen token to the API (reuse detection) and end the whole
 * session; with the lock the second tab starts only after the first has stored the new cookie.
 */
export function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  // Web Locks exist only in secure contexts (HTTPS or localhost); elsewhere the tabs are not
  // coordinated, which is the best that can be done.
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    return navigator.locks.request(REFRESH_LOCK, task);
  }
  return task();
}
