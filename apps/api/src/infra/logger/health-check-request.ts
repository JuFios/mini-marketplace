import { API_PREFIX } from '../../common/api-prefix';

const HEALTH_PATH = `/${API_PREFIX}/health`;

/** Whether a request URL (with or without a query string) is the health probe. */
export function isHealthCheck(url: string | undefined): boolean {
  return url?.split('?')[0] === HEALTH_PATH;
}
