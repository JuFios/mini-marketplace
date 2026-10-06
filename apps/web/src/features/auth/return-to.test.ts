import { describe, expect, it } from 'vitest';
import { authPath, safeReturnTo } from './return-to';

describe('safeReturnTo', () => {
  it.each(['/', '/cart', '/orders/123?tab=items', '/products/1#reviews'])('keeps %s', (path) => {
    expect(safeReturnTo(path)).toBe(path);
  });

  it.each([
    ['nothing', null],
    ['an empty value', ''],
    ['an absolute URL', 'https://evil.example/phish'],
    ['a protocol-relative URL', '//evil.example'],
    ['a backslash variant of it', '/\\evil.example'],
    ['a backslash further in', '/ok\\@evil.example'],
    ['a tab that browsers strip', '/\t/evil.example'],
    ['a newline', '/ok\n'],
    ['a relative path', 'cart'],
    ['a javascript: URL', 'javascript:alert(1)'],
  ])('falls back to the home page for %s', (_label, value) => {
    expect(safeReturnTo(value)).toBe('/');
  });
});

describe('authPath', () => {
  it('carries the page to return to', () => {
    expect(authPath('/login', '/orders?tab=open')).toBe('/login?returnTo=%2Forders%3Ftab%3Dopen');
  });

  it('omits it for the home page', () => {
    expect(authPath('/register', '/')).toBe('/register');
  });
});
