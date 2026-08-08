import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { MediaService } from './media.service';

@Controller('media')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('upload')
  @Roles('ADMIN', 'OPERATOR')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_request, file, callback) =>
        callback(
          null,
          ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype),
        ),
    }),
  )
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file)
      throw new BadRequestException('Wymagany jest obraz JPEG, PNG lub WebP');
    return this.media.upload(file);
  }
}
