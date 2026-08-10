import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

const MEDIA_TYPES: Record<
  string,
  { extension: string; signatures: number[][] }
> = {
  'image/jpeg': { extension: '.jpg', signatures: [[0xff, 0xd8, 0xff]] },
  'image/png': {
    extension: '.png',
    signatures: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  },
  'image/webp': { extension: '.webp', signatures: [] },
  'image/heic': { extension: '.heic', signatures: [] },
  'image/heif': { extension: '.heif', signatures: [] },
};

const OBJECT_NAME_PATTERN =
  /^\d{4}-\d{2}-\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:\.[a-z0-9]{1,10})?$/i;

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
    const mediaType = MEDIA_TYPES[file.mimetype];
    if (!mediaType || !this.hasValidSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException(
        'Zawartość pliku nie pasuje do typu obrazu',
      );
    }
    const objectName = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}${mediaType.extension}`;
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
    if (!OBJECT_NAME_PATTERN.test(objectName)) {
      throw new BadRequestException('Nieprawidłowa nazwa pliku');
    }
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

  private hasValidSignature(buffer: Buffer, mimetype: string): boolean {
    if (mimetype === 'image/webp') {
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    }
    if (mimetype === 'image/heic' || mimetype === 'image/heif') {
      if (
        buffer.length < 12 ||
        buffer.subarray(4, 8).toString('ascii') !== 'ftyp'
      )
        return false;
      const brand = buffer.subarray(8, 12).toString('ascii');
      return mimetype === 'image/heic'
        ? ['heic', 'heix', 'hevc', 'hevx'].includes(brand)
        : ['mif1', 'msf1', 'heif'].includes(brand);
    }
    const mediaType = MEDIA_TYPES[mimetype];
    return Boolean(
      mediaType?.signatures.some((signature) =>
        signature.every((byte, index) => buffer[index] === byte),
      ),
    );
  }
}
