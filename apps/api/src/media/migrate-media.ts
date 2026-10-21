import { PrismaClient } from '@inspect-hub/database';
import { Client } from 'minio';
import { MediaMigration } from './media-migration';

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--apply', '--dry-run'].includes(args[0])) {
    throw new Error(
      'Usage: node dist/media/migrate-media.js --dry-run|--apply',
    );
  }
  for (const key of [
    'DATABASE_URL',
    'MINIO_ENDPOINT',
    'MINIO_ACCESS_KEY',
    'MINIO_SECRET_KEY',
  ]) {
    if (!process.env[key]) throw new Error(`Missing ${key}`);
  }
  const database = new PrismaClient();
  const client = new Client({
    endPoint: process.env.MINIO_ENDPOINT!,
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY!,
    secretKey: process.env.MINIO_SECRET_KEY!,
  });
  try {
    const migration = new MediaMigration(
      database,
      client,
      process.env.MINIO_BUCKET ?? 'inspection-media',
      args[0] === '--apply',
    );
    console.log(
      `[media migration] ${args[0]}; original objects are never deleted or overwritten`,
    );
    console.log('[media migration]', await migration.run());
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error('[media migration] failed; original objects retained', error);
  process.exitCode = 1;
});
