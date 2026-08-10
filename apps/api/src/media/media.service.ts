import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import type { Readable } from 'node:stream';

@Injectable()
export class MediaService implements OnModuleInit {
  private readonly client: Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = config.get('MINIO_BUCKET', 'inspection-media');
    this.client = new Client({
      endPoint: config.get('MINIO_ENDPOINT', 'localhost'),
      port: Number(config.get('MINIO_PORT', 9000)),
      useSSL: config.get('MINIO_USE_SSL', 'false') === 'true',
      accessKey: config.get('MINIO_ACCESS_KEY', 'minio_admin'),
      secretKey: config.get('MINIO_SECRET_KEY', 'minio_password_123'),
    });
  }

  async onModuleInit(): Promise<void> {
    if (!(await this.client.bucketExists(this.bucket))) {
      await this.client.makeBucket(this.bucket);
    }
  }

  async upload(file: Express.Multer.File): Promise<{ objectName: string }> {
    const extension = extname(file.originalname).toLowerCase();
    const objectName = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}${extension}`;
    await this.client.putObject(
      this.bucket,
      objectName,
      file.buffer,
      file.size,
      {
        'Content-Type': file.mimetype,
      },
    );
    return { objectName };
  }

  async getObject(
    objectName: string,
  ): Promise<{ stream: Readable; contentType: string }> {
    const stat = await this.client.statObject(this.bucket, objectName);
    const stream = await this.client.getObject(this.bucket, objectName);
    const metadata = stat.metaData as Record<string, unknown> | undefined;
    const storedContentType = metadata?.['content-type'];
    return {
      stream,
      contentType:
        typeof storedContentType === 'string'
          ? storedContentType
          : 'application/octet-stream',
    };
  }
}
