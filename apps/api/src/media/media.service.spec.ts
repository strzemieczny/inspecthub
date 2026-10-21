import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { MediaService } from './media.service';

describe('MediaService', () => {
  const putObject = jest.fn<
    Promise<void>,
    [string, string, Buffer, number, Record<string, string>]
  >();
  const statObject = jest.fn();
  const getObject = jest.fn();
  let service: MediaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MediaService(
      new ConfigService({
        MINIO_ENDPOINT: 'localhost',
        MINIO_ACCESS_KEY: 'test',
        MINIO_SECRET_KEY: 'test-secret',
      }),
    );
    Object.assign(service, {
      client: { putObject, statObject, getObject },
    });
  });

  it('stores a verified image under a generated canonical name', async () => {
    putObject.mockResolvedValue(undefined);
    const buffer = await sharp({
      create: { width: 3200, height: 1600, channels: 3, background: '#c06030' },
    })
      .jpeg({ quality: 100 })
      .toBuffer();
    const result = await service.upload({
      buffer,
      mimetype: 'image/jpeg',
      originalname: 'untrusted.exe',
      size: buffer.length,
    } as Express.Multer.File);

    expect(result.objectName).toMatch(
      /^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.jpg$/,
    );
    expect(putObject).toHaveBeenCalledWith(
      'inspection-media',
      result.objectName,
      expect.any(Buffer),
      expect.any(Number),
      { 'Content-Type': 'image/jpeg' },
    );
    const stored = putObject.mock.calls[0][2];
    expect(stored.length).toBeLessThan(buffer.length);
    expect(putObject.mock.calls[0][3]).toBe(stored.length);
    expect(await sharp(stored).metadata()).toMatchObject({
      format: 'jpeg',
      width: 2560,
      height: 1280,
    });
  });

  it('applies EXIF orientation before removing metadata', async () => {
    const buffer = await sharp({
      create: { width: 3200, height: 1600, channels: 3, background: '#c06030' },
    })
      .jpeg({ quality: 100 })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    await service.upload({
      buffer,
      mimetype: 'image/jpeg',
    } as Express.Multer.File);
    const metadata = await sharp(putObject.mock.calls[0][2]).metadata();
    expect(metadata).toMatchObject({
      width: 1280,
      height: 2560,
    });
    expect(metadata.orientation).toBeUndefined();
  });

  it('preserves PNG transparency and never enlarges small images', async () => {
    const buffer = await sharp({
      create: { width: 100, height: 50, channels: 4, background: '#ffffff00' },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    await service.upload({
      buffer,
      mimetype: 'image/png',
    } as Express.Multer.File);
    expect(await sharp(putObject.mock.calls[0][2]).metadata()).toMatchObject({
      format: 'png',
      width: 100,
      height: 50,
      hasAlpha: true,
    });
  });

  it('keeps the original when re-encoding would increase its size', async () => {
    const buffer = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#c06030' },
    })
      .jpeg({ quality: 1 })
      .toBuffer();
    await service.upload({
      buffer,
      mimetype: 'image/jpeg',
    } as Express.Multer.File);
    expect(putObject.mock.calls[0][2]).toBe(buffer);
  });

  it.each(['image/heic', 'image/heif'])(
    'preserves %s uploads',
    async (mimetype) => {
      const brand = mimetype === 'image/heic' ? 'heic' : 'mif1';
      const buffer = Buffer.concat([
        Buffer.from([0, 0, 0, 12]),
        Buffer.from(`ftyp${brand}`),
      ]);
      await service.upload({ buffer, mimetype } as Express.Multer.File);
      expect(putObject.mock.calls[0][2]).toBe(buffer);
      expect(putObject.mock.calls[0][4]).toEqual({ 'Content-Type': mimetype });
    },
  );

  it('rejects truncated images even when their signature matches', async () => {
    await expect(
      service.upload({
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
        mimetype: 'image/jpeg',
      } as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(putObject).not.toHaveBeenCalled();
  });

  it('rejects content that does not match the declared image type', async () => {
    await expect(
      service.upload({
        buffer: Buffer.from('not an image'),
        mimetype: 'image/png',
      } as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(putObject).not.toHaveBeenCalled();
  });

  it('rejects arbitrary object names before accessing storage', async () => {
    await expect(service.getObject('../private-object')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(statObject).not.toHaveBeenCalled();
  });

  it('continues to serve legacy generated names and extensions', async () => {
    statObject.mockResolvedValue({
      metaData: { 'content-type': 'image/jpeg' },
    });
    getObject.mockResolvedValue(Readable.from(Buffer.from('image')));

    const result = await service.getObject(
      '2026-08-10/123e4567-e89b-42d3-a456-426614174000.jpeg',
    );

    expect(result.contentType).toBe('image/jpeg');
  });
});
