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
  const database = {
    form: {
      create,
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
});
