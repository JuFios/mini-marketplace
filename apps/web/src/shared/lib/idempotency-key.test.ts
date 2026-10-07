import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIdempotencyKey } from './idempotency-key';

// What the API accepts in the `Idempotency-Key` header.
const ACCEPTED_BY_API = /^[A-Za-z0-9_-]{8,64}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createIdempotencyKey', () => {
  it('makes a key the API accepts, a different one each time', () => {
    const first = createIdempotencyKey();
    const second = createIdempotencyKey();

    expect(first).toMatch(ACCEPTED_BY_API);
    expect(first).not.toBe(second);
  });

  it('still makes a valid UUID where randomUUID is unavailable (insecure context)', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });

    const key = createIdempotencyKey();

    expect(key).toMatch(UUID_V4);
    expect(key).toMatch(ACCEPTED_BY_API);
    expect(createIdempotencyKey()).not.toBe(key);
  });
});
