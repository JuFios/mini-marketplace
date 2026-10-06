import { redisOptionsFromUrl } from './redis-options';

describe('redisOptionsFromUrl', () => {
  it('reads host, port and database index', () => {
    expect(redisOptionsFromUrl('redis://cache.internal:6380/3')).toMatchObject({
      host: 'cache.internal',
      port: 6380,
      db: 3,
    });
  });

  it('defaults the port to 6379 and the database to 0', () => {
    expect(redisOptionsFromUrl('redis://localhost')).toMatchObject({
      host: 'localhost',
      port: 6379,
      db: 0,
    });
    expect(redisOptionsFromUrl('redis://localhost:6379/')).toMatchObject({ db: 0 });
  });

  it('passes credentials, decoding percent-escapes, and only when present', () => {
    expect(redisOptionsFromUrl('redis://app:p%40ss@localhost')).toMatchObject({
      username: 'app',
      password: 'p@ss',
    });
    const plain = redisOptionsFromUrl('redis://localhost');
    expect(plain).not.toHaveProperty('username');
    expect(plain).not.toHaveProperty('password');
  });

  it('turns rediss:// into TLS', () => {
    expect(redisOptionsFromUrl('rediss://localhost')).toHaveProperty('tls');
    expect(redisOptionsFromUrl('redis://localhost')).not.toHaveProperty('tls');
  });

  it('strips the brackets of an IPv6 host', () => {
    expect(redisOptionsFromUrl('redis://[::1]:6379/1')).toMatchObject({ host: '::1', db: 1 });
  });
});
