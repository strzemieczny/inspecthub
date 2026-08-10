const INSECURE_VALUES = new Set([
  'replace-with-at-least-32-random-characters',
  'minio_admin',
  'minio_password_123',
  'inspect_pass',
  'replace-me',
]);

function requireSecureValue(
  environment: Record<string, unknown>,
  key: string,
  minimumLength = 1,
): string {
  const value =
    typeof environment[key] === 'string' ? environment[key].trim() : '';
  if (value.length < minimumLength || INSECURE_VALUES.has(value)) {
    throw new Error(
      `${key} musi być ustawione na bezpieczną wartość dla środowiska produkcyjnego`,
    );
  }
  return value;
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): Record<string, unknown> {
  if (environment.NODE_ENV !== 'production') return environment;

  requireSecureValue(environment, 'DATABASE_URL');
  requireSecureValue(environment, 'JWT_SECRET', 32);
  requireSecureValue(environment, 'MINIO_ENDPOINT');
  requireSecureValue(environment, 'MINIO_ACCESS_KEY', 3);
  requireSecureValue(environment, 'MINIO_SECRET_KEY', 16);
  const webOrigin = requireSecureValue(environment, 'WEB_ORIGIN');
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(webOrigin);
  } catch {
    throw new Error('WEB_ORIGIN musi być poprawnym adresem URL');
  }
  if (
    !['http:', 'https:'].includes(parsedOrigin.protocol) ||
    parsedOrigin.origin !== webOrigin
  ) {
    throw new Error('WEB_ORIGIN musi zawierać wyłącznie origin, bez ścieżki');
  }
  return environment;
}
