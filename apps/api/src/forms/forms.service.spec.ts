import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@inspect-hub/database';
import { DatabaseService } from '../database/database.service';
import { FormsService } from './forms.service';
import { CreateFormDto } from './dto/form.dto';

const stored = {
  id: 'revision-1',
  title: 'Kontrola',
  code: 'QC',
  version: 1,
  nokStreakThreshold: 3,
  requiresLogin: false,
  allowedStatuses: ['OK', 'NOK'],
  questions: [],
  processes: [{ id: 'process-1' }],
  partNumbers: [],
  createdAt: new Date('2026-10-19T10:00:00Z'),
  archivedAt: null,
  createdById: 'author-1',
  createdByName: 'Jan Kowalski',
};

describe('form revision authors', () => {
  const create = jest.fn().mockResolvedValue(stored);
  const remove = jest.fn();
  const database = {
    form: {
      create,
      delete: remove,
      findUnique: jest.fn().mockResolvedValue(stored),
      findFirst: jest.fn().mockResolvedValue(stored),
      findMany: jest.fn(),
    },
    user: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ id: 'author-1', name: 'Jan Kowalski' }),
    },
  };
  const service = new FormsService(database as unknown as DatabaseService);

  beforeEach(() => jest.clearAllMocks());

  it('stores the authenticated author snapshot on creation, update, and duplication', async () => {
    await service.create(
      { ...stored, processIds: ['process-1'] } as CreateFormDto,
      'author-1',
    );
    await service.update(stored.id, { title: 'Nowa kontrola' }, 'author-1');
    await service.duplicate(
      stored.id,
      { title: 'Kopia', code: 'QC-COPY' },
      'author-1',
    );
    expect(create).toHaveBeenCalledTimes(3);
    for (const [input] of create.mock.calls as [
      { data: Record<string, unknown> },
    ][]) {
      expect(input.data).toMatchObject({
        createdById: 'author-1',
        createdByName: 'Jan Kowalski',
      });
    }
    const calls = create.mock.calls as [{ data: Record<string, unknown> }][];
    expect(calls[1][0].data.version).toBe(2);
  });

  it('removes legacy expected values from photo questions when saving', async () => {
    await service.create(
      {
        ...stored,
        processIds: ['process-1'],
        questions: [
          {
            id: 'photo',
            label: 'Zdjęcie',
            type: 'PHOTO_UPLOAD',
            isRequired: true,
            expectedValue: 'legacy.jpg',
          },
          {
            id: 'check',
            label: 'Kontrola',
            type: 'CHECKBOX',
            isRequired: true,
            expectedValue: true,
          },
        ],
      } as CreateFormDto,
      'author-1',
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          questions: [
            expect.objectContaining({ id: 'photo', expectedValue: undefined }),
            expect.objectContaining({ id: 'check', expectedValue: true }),
          ],
        }),
      }),
    );
  });

  it('cleans questions, expected answers and translations on create, revision and copy', async () => {
    const dirtyQuestion = {
      id: 'q1',
      type: 'SELECT',
      isRequired: true,
      label: ' \ufeffCzy  część jest\u00a0OK?\u200b ',
      description: '  Krok  1. \r\n  Krok  2.  ',
      options: ['  Tak  ', ' Nie\u00a0  dotyczy  '],
      expectedValue: '  Nie  dotyczy\ufeff ',
      translations: {
        en: {
          label: ' Is  it OK? ',
          description: ' First  step.\n Next  step. ',
          options: [' Yes ', ' Not  applicable '],
        },
        uk: { label: '  ', options: [' Так ', ' Не  стосується '] },
      },
      okImageUrl: 'https://example.com/a%20b.png?token=a+b',
    };
    const legacy = { ...stored, questions: [dirtyQuestion] };
    database.form.findUnique
      .mockResolvedValueOnce(legacy)
      .mockResolvedValueOnce(legacy);
    database.form.findFirst.mockResolvedValueOnce(legacy);
    await service.create(
      {
        ...stored,
        questions: [dirtyQuestion],
        processIds: ['process-1'],
      } as CreateFormDto,
      'author-1',
    );
    await service.update(stored.id, { title: 'Rewizja' }, 'author-1');
    await service.duplicate(
      stored.id,
      { title: 'Kopia', code: 'COPY' },
      'author-1',
    );
    for (const [input] of create.mock.calls) {
      expect(input.data.questions).toEqual([
        expect.objectContaining({
          id: 'q1',
          label: 'Czy część jest OK?',
          description: 'Krok 1.\nKrok 2.',
          options: ['Tak', 'Nie dotyczy'],
          expectedValue: 'Nie dotyczy',
          translations: {
            en: {
              label: 'Is it OK?',
              description: 'First step.\nNext step.',
              options: ['Yes', 'Not applicable'],
            },
            uk: {
              label: undefined,
              description: undefined,
              options: ['Так', 'Не стосується'],
            },
          },
          okImageUrl: dirtyQuestion.okImageUrl,
        }),
      ]);
    }
    expect(dirtyQuestion.label).toContain('  ');
    expect(dirtyQuestion.options).toEqual(['  Tak  ', ' Nie\u00a0  dotyczy  ']);
  });

  it.each([
    { label: ' \u200b  ', type: 'TEXT' },
    { label: 'Wybór', type: 'SELECT', options: ['Tak', ' \ufeff '] },
  ])('rejects text that is empty after cleaning: %j', async (question) => {
    await expect(
      service.create(
        {
          ...stored,
          processIds: ['process-1'],
          questions: [{ id: 'q1', isRequired: true, ...question }],
        } as CreateFormDto,
        'author-1',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('returns immutable author snapshots and explicitly marks missing historical authors', async () => {
    database.form.findMany.mockResolvedValue([
      stored,
      { ...stored, id: 'legacy', createdById: null, createdByName: null },
    ]);
    const revisions = await service.findRevisions(stored.id);
    expect(revisions[0].createdBy).toEqual({
      id: 'author-1',
      name: 'Jan Kowalski',
    });
    expect(revisions[1].createdBy).toBeNull();
    expect(revisions[0].createdAt).toBe('2026-10-19T10:00:00.000Z');
  });

  it('does not expose author identity in public form endpoints', async () => {
    expect(await service.findOne(stored.id)).not.toHaveProperty('createdBy');
  });

  it('rejects deleting a form referenced by existing inspections with 409 Conflict', async () => {
    remove.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        {
          code: 'P2003',
          clientVersion: '6.19.3',
        },
      ),
    );
    await expect(service.remove(stored.id)).rejects.toThrow(ConflictException);
  });
});
