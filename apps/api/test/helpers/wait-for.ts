/**
 * Polls `read` until it returns a value that satisfies `done`, and returns that value. For
 * results that appear asynchronously (a queue worker finishing a job): it waits only as long as
 * needed and fails with the last value seen, which says more than a bare timeout.
 */
export async function waitFor<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  { timeoutMs = 8_000, intervalMs = 25 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() >= deadline) {
      throw new Error(`Timed out after ${timeoutMs} ms; last value: ${JSON.stringify(value)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
