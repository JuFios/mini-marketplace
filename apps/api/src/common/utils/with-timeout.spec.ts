import { withTimeout } from './with-timeout';

describe('withTimeout', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves with the value of a promise that settles in time', async () => {
    await expect(withTimeout(Promise.resolve('pong'), 1_000)).resolves.toBe('pong');
  });

  it('propagates the rejection of the wrapped promise', async () => {
    await expect(withTimeout(Promise.reject(new Error('down')), 1_000)).rejects.toThrow('down');
  });

  it('rejects when the promise does not settle within the limit', async () => {
    jest.useFakeTimers();

    const pending = withTimeout(new Promise<never>(() => undefined), 500);
    const assertion = expect(pending).rejects.toThrow('Timed out after 500 ms');
    await jest.advanceTimersByTimeAsync(500);

    await assertion;
  });
});
