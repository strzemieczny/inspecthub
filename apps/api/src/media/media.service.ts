import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import sharp from 'sharp';
import { isMediaObjectName, type MediaPurpose } from './media-paths';

const MAX_IMAGE_DIMENSION = 2560;
const IMAGE_QUALITY = 82;

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

  async upload(
    file: Express.Multer.File,
    purpose: MediaPurpose = 'inspections',
  ): Promise<{ objectName: string }> {
    if (purpose !== 'forms' && purpose !== 'inspections') {
      throw new BadRequestException('Nieprawidłowy rodzaj zdjęcia');
    }
    const mediaType = MEDIA_TYPES[file.mimetype];
    if (!mediaType || !this.hasValidSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException(
        'Zawartość pliku nie pasuje do typu obrazu',
      );
    }
    const buffer = await this.compressImage(file.buffer, file.mimetype);
    const objectName = `${purpose}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${mediaType.extension}`;
    await this.client.putObject(
      this.bucket,
      objectName,
      buffer,
      buffer.length,
      {
        'Content-Type': file.mimetype,
      },
    );
    return { objectName };
  }

  private async compressImage(
    buffer: Buffer,
    mimetype: string,
  ): Promise<Buffer> {
    // Standard sharp binaries cannot decode HEIC/HEIF with HEVC compression.
    if (mimetype === 'image/heic' || mimetype === 'image/heif') return buffer;

    try {
      const image = sharp(buffer, { limitInputPixels: 50_000_000 });
      const metadata = await image.metadata();
      // Preserve animated uploads rather than silently keeping only one frame.
      if ((metadata.pages ?? 1) > 1) return buffer;

      image.rotate().resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      });
      if (mimetype === 'image/jpeg') image.jpeg({ quality: IMAGE_QUALITY });
      if (mimetype === 'image/webp') image.webp({ quality: IMAGE_QUALITY });
      if (mimetype === 'image/png') image.png({ compressionLevel: 9 });

      const compressed = await image.toBuffer();
      return compressed.length < buffer.length ? compressed : buffer;
    } catch {
      throw new BadRequestException('Nie można odczytać przesłanego obrazu');
    }
  }

  async getObject(
    objectName: string,
  ): Promise<{ stream: Readable; contentType: string }> {
    if (!isMediaObjectName(objectName)) {
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
