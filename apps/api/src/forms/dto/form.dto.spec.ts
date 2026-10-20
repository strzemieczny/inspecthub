import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { CreateFormDto, UpdateFormDto } from './form.dto';

describe('form question image URL validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  const question = {
    id: 'question-1',
    label: 'Visual inspection',
    type: 'CHECKBOX',
    isRequired: true,
  };

  const fields = ['instructionImageUrl', 'okImageUrl', 'nokImageUrl'];

  describe.each([CreateFormDto, UpdateFormDto])('%p', (metatype) => {
    function validate(imageFields: Record<string, unknown>) {
      return pipe.transform(
        {
          ...(metatype === CreateFormDto
            ? {
                title: 'Inspection',
                code: 'QC',
                nokStreakThreshold: 3,
                requiresLogin: false,
                allowedStatuses: ['OK', 'NOK'],
                processIds: ['process-1'],
              }
            : {}),
          questions: [{ ...question, ...imageFields }],
        },
        { type: 'body', metatype },
      );
    }

    it.each([
      '/api/media/object?name=forms%2Fimage.png',
      '/inspect-hub/api/media/object?name=image.png',
      'https://example.com/image.png',
      'http://localhost:3000/api/media/object?name=image.png',
    ])('accepts image URL %s in all image fields', async (url) => {
      const images = Object.fromEntries(fields.map((field) => [field, url]));
      await expect(validate(images)).resolves.toMatchObject({
        questions: [expect.objectContaining(images)],
      });
    });

    it('allows omitted optional images', async () => {
      await expect(validate({})).resolves.toBeInstanceOf(metatype);
    });

    it.each([
      '',
      'not a URL',
      '/other/image.png',
      '/api/media/object',
      '/api/media/object?name=has spaces.png',
      'javascript:alert(1)',
      123,
    ])('rejects invalid image value %p', async (url) => {
      for (const field of fields) {
        await expect(validate({ [field]: url })).rejects.toThrow('Bad Request');
      }
    });
  });
});
