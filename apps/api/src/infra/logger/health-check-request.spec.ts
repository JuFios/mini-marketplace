import { isHealthCheck } from './health-check-request';

describe('isHealthCheck', () => {
  it('recognises the probe, with or without a query string', () => {
    expect(isHealthCheck('/api/v1/health')).toBe(true);
    expect(isHealthCheck('/api/v1/health?verbose=1')).toBe(true);
  });

  it.each([
    '/api/v1/health/extra',
    '/api/v1/healthy',
    '/api/v1/orders',
    '/health',
    '/api/v1/orders?next=/api/v1/health',
    '',
    undefined,
  ])('does not mistake %j for it', (url) => {
    expect(isHealthCheck(url)).toBe(false);
  });
});
