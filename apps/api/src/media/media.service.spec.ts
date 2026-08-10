import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import { MediaService } from './media.service';

describe('MediaService', () => {
  const putObject = jest.fn();
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
    const result = await service.upload({
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      mimetype: 'image/jpeg',
      originalname: 'untrusted.exe',
      size: 4,
    } as Express.Multer.File);

    expect(result.objectName).toMatch(
      /^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.jpg$/,
    );
    expect(putObject).toHaveBeenCalledWith(
      'inspection-media',
      result.objectName,
      expect.any(Buffer),
      4,
      { 'Content-Type': 'image/jpeg' },
    );
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
