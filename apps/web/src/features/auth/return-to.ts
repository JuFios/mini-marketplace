function hasControlCharacter(value: string): boolean {
  return [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
}

/**
 * Where to go after logging in, from the untrusted `?returnTo=` parameter. Only an in-app path is
 * accepted: `https://evil.example`, `//evil.example` and `/\evil.example` (browsers read the last
 * two as another site, and strip tabs and newlines before parsing) would turn the login page into
 * an open redirect.
 */
export function safeReturnTo(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    hasControlCharacter(value)
  ) {
    return '/';
  }
  return value;
}

/** `/login` or `/register`, carrying the page to return to unless it is the home page. */
export function authPath(page: '/login' | '/register', returnTo: string): string {
  return returnTo === '/' ? page : `${page}?returnTo=${encodeURIComponent(returnTo)}`;
}
