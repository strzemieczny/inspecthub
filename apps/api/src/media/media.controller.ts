import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { MediaService } from './media.service';

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_request, file, callback) =>
        callback(
          null,
          [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/heic',
            'image/heif',
          ].includes(file.mimetype),
        ),
    }),
  )
  async upload(
    @Req() request: Request,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file)
      throw new BadRequestException(
        'Wymagany jest obraz JPEG, PNG, WebP, HEIC lub HEIF',
      );
    const { objectName } = await this.media.upload(file);
    const url = `${request.protocol}://${request.get('host')}/api/media/object?name=${encodeURIComponent(objectName)}`;
    return { objectName, url };
  }

  @Get('object')
  async getObject(@Query('name') objectName?: string) {
    if (!objectName) throw new BadRequestException('Wymagana jest nazwa pliku');
    const { stream, contentType } = await this.media.getObject(objectName);
    return new StreamableFile(stream, { type: contentType });
  }
}
