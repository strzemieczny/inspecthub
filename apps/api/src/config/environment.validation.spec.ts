import { validateEnvironment } from './environment.validation';

const productionEnvironment = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:strong-password@postgres:5432/inspect_hub',
  JWT_SECRET: 'a-production-secret-with-at-least-32-characters',
  MINIO_ENDPOINT: 'minio',
  MINIO_ACCESS_KEY: 'inspect-hub-service',
  MINIO_SECRET_KEY: 'a-long-production-object-storage-secret',
  WEB_ORIGIN: 'https://inspect.example.com',
};

describe('validateEnvironment', () => {
  it('accepts a complete production configuration', () => {
    expect(validateEnvironment(productionEnvironment)).toBe(
      productionEnvironment,
    );
  });

  it.each(['JWT_SECRET', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY'])(
    'rejects an insecure %s',
    (key) => {
      expect(() =>
        validateEnvironment({ ...productionEnvironment, [key]: 'replace-me' }),
      ).toThrow(key);
    },
  );

  it('rejects a CORS origin containing a path', () => {
    expect(() =>
      validateEnvironment({
        ...productionEnvironment,
        WEB_ORIGIN: 'https://inspect.example.com/app',
      }),
    ).toThrow('WEB_ORIGIN');
  });

  it('does not impose production requirements in development', () => {
    expect(validateEnvironment({ NODE_ENV: 'development' })).toEqual({
      NODE_ENV: 'development',
    });
  });
});
