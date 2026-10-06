import type { CookieOptions, Response } from 'express';
import { API_PREFIX } from '../../common/api-prefix';
import { AppConfigService } from '../../config/app-config.service';

export const REFRESH_COOKIE = 'refresh_token';

// Scoped to the auth routes: the browser never attaches the refresh token to other requests.
const REFRESH_COOKIE_PATH = `/${API_PREFIX}/auth`;

function baseOptions(config: AppConfigService): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSecure,
    path: REFRESH_COOKIE_PATH,
  };
}

export function setRefreshCookie(
  response: Response,
  token: string,
  config: AppConfigService,
): void {
  response.cookie(REFRESH_COOKIE, token, {
    ...baseOptions(config),
    maxAge: config.jwtRefreshTtlSeconds * 1000,
  });
}

/** Attributes must match those used to set the cookie, or the browser keeps the old one. */
export function clearRefreshCookie(response: Response, config: AppConfigService): void {
  response.clearCookie(REFRESH_COOKIE, baseOptions(config));
}
