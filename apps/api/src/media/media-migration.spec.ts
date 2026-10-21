import { Readable } from 'node:stream';
import { PrismaClient } from '@inspect-hub/database';
import { Client } from 'minio';
import { legacyMediaReference, MediaMigration } from './media-migration';

const name = '2026-10-21/123e4567-e89b-42d3-a456-426614174000.jpg';
const url = `/api/media/object?name=${encodeURIComponent(name)}`;
const ref = (purpose: string) =>
  `/api/media/object?name=${encodeURIComponent(`${purpose}/${name}`)}`;

function fixture(apply = true) {
  const objects = new Map<string, Buffer>([
    [name, Buffer.from('original image bytes')],
  ]);
  const client = {
    bucketExists: jest.fn().mockResolvedValue(true),
    statObject: jest.fn((_bucket: string, object: string) => {
      const data = objects.get(object);
      if (!data)
        return Promise.reject(
          Object.assign(new Error('missing'), { code: 'NotFound' }),
        );
      return Promise.resolve({
        size: data.length,
        etag: 'original-etag',
        metaData: { 'content-type': 'image/jpeg' },
      });
    }),
    getObject: jest.fn((_bucket: string, object: string) =>
      Promise.resolve(Readable.from(objects.get(object)!)),
    ),
    copyObject: jest.fn((_bucket: string, target: string, source: string) => {
      objects.set(
        target,
        Buffer.from(objects.get(source.replace('/inspection-media/', ''))!),
      );
      return Promise.resolve();
    }),
  };
  const database = {
    form: {
      findMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    inspectionResult: {
      findMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const migration = new MediaMigration(
    database as unknown as PrismaClient,
    client as unknown as Client,
    'inspection-media',
    apply,
  );
  return { objects, client, database, migration };
}

const questions = [
  {
    id: 'photo',
    type: 'PHOTO_UPLOAD',
    instructionImageUrl: url,
    okImageUrl: url,
    nokImageUrl: url,
  },
];

describe('legacyMediaReference', () => {
  it.each([
    url,
    url.replace('/api/', '/inspect-hub/api/'),
    `https://production.example${url}`,
    `http://localhost:9000/inspection-media/${name}`,
    name,
  ])('recognizes old reference %s', (value) => {
    expect(legacyMediaReference(value, 'inspection-media')?.name).toBe(name);
  });

  it.each([
    null,
    'plain text',
    '/api/media/object?name=../secret',
    ref('forms'),
    'https://external.example/photo.jpg',
  ])(
    'leaves unrelated and already migrated references unchanged: %s',
    (value) => {
      expect(legacyMediaReference(value, 'inspection-media')).toBeNull();
    },
  );
});

describe('MediaMigration', () => {
  it('copies a shared photo to both folders, checks bytes, then updates all form versions and inspection answers', async () => {
    const { migration, database, objects, client } = fixture();
    database.form.findMany
      .mockResolvedValueOnce([
        { id: 'archived-version', questions },
        { id: 'current-version', questions },
      ])
      .mockResolvedValue([]);
    database.inspectionResult.findMany
      .mockResolvedValueOnce([
        {
          id: 'inspection',
          answers: [
            { questionId: 'photo', value: url },
            { questionId: 'text', value: url },
          ],
          form: { questions },
        },
      ])
      .mockResolvedValue([]);
    const counts = await migration.run();
    expect(counts).toEqual({
      copied: 2,
      verified: 2,
      forms: 2,
      inspections: 1,
      missing: 0,
    });
    expect(client.copyObject).toHaveBeenCalledTimes(2);
    expect(database.form.updateMany).toHaveBeenCalledWith({
      where: { id: 'archived-version', questions: { equals: questions } },
      data: {
        questions: [
          {
            ...questions[0],
            instructionImageUrl: ref('forms'),
            okImageUrl: ref('forms'),
            nokImageUrl: ref('forms'),
          },
        ],
      },
    });
    expect(database.inspectionResult.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          answers: [
            { questionId: 'photo', value: ref('inspections') },
            { questionId: 'text', value: url },
          ],
        },
      }),
    );
    expect(objects.get(name)).toEqual(Buffer.from('original image bytes'));
    expect(objects.get(`forms/${name}`)).toEqual(objects.get(name));
    expect(objects.get(`inspections/${name}`)).toEqual(objects.get(name));
    expect(client.getObject).toHaveBeenCalledTimes(4);
  });

  it('can resume after copying but before a database update without overwriting copies', async () => {
    const { migration, objects, client } = fixture();
    objects.set(`forms/${name}`, Buffer.from(objects.get(name)!));
    await expect(migration.questions(questions)).resolves.toEqual([
      {
        ...questions[0],
        instructionImageUrl: ref('forms'),
        okImageUrl: ref('forms'),
        nokImageUrl: ref('forms'),
      },
    ]);
    expect(client.copyObject).not.toHaveBeenCalled();
    expect(objects.has(name)).toBe(true);
  });

  it('does nothing on a second run with migrated references', async () => {
    const { migration, client } = fixture();
    const migrated = await migration.questions(questions);
    client.statObject.mockClear();
    await expect(migration.questions(migrated)).resolves.toEqual(migrated);
    expect(client.statObject).not.toHaveBeenCalled();
  });

  it('aborts without updating the row when the copy has different bytes of the same size', async () => {
    const { migration, objects, database, client } = fixture();
    objects.set(`forms/${name}`, Buffer.from('corrupted image byte'));
    expect(objects.get(`forms/${name}`)!.length).toBe(
      objects.get(name)!.length,
    );
    database.form.findMany.mockResolvedValueOnce([{ id: 'form', questions }]);
    await expect(migration.run()).rejects.toThrow('Copy verification failed');
    expect(database.form.updateMany).not.toHaveBeenCalled();
    expect(client.copyObject).not.toHaveBeenCalled();
    expect(objects.get(name)).toEqual(Buffer.from('original image bytes'));
  });

  it.each([true, false])(
    'retains missing source references and finishes (apply=%s)',
    async (apply) => {
      const { migration, objects, database, client } = fixture(apply);
      objects.clear();
      database.form.findMany
        .mockResolvedValueOnce([{ id: 'form', questions }])
        .mockResolvedValue([]);
      database.inspectionResult.findMany
        .mockResolvedValueOnce([
          {
            id: 'inspection',
            answers: [{ questionId: 'photo', value: url }],
            form: { questions },
          },
        ])
        .mockResolvedValue([]);
      await expect(migration.run()).resolves.toEqual({
        copied: 0,
        verified: 0,
        forms: 0,
        inspections: 0,
        missing: 1,
      });
      expect([...migration.missingObjects]).toEqual([name]);
      expect(database.form.updateMany).not.toHaveBeenCalled();
      expect(database.inspectionResult.updateMany).not.toHaveBeenCalled();
      expect(client.copyObject).not.toHaveBeenCalled();
      expect(client.statObject).toHaveBeenCalledTimes(1);
    },
  );

  it('migrates available media in the same row while preserving a missing photo', async () => {
    const { migration, database, client } = fixture();
    const missingName = name.replace('123e4567', '223e4567');
    const missingUrl = `/api/media/object?name=${encodeURIComponent(missingName)}`;
    const mixedQuestions = [
      { ...questions[0], instructionImageUrl: missingUrl },
    ];
    const answers = [
      { questionId: 'photo', value: missingUrl },
      { questionId: 'photo', value: url },
    ];
    database.form.findMany
      .mockResolvedValueOnce([{ id: 'form', questions: mixedQuestions }])
      .mockResolvedValue([]);
    database.inspectionResult.findMany
      .mockResolvedValueOnce([
        { id: 'inspection', answers, form: { questions } },
      ])
      .mockResolvedValue([]);
    await expect(migration.run()).resolves.toEqual({
      copied: 2,
      verified: 2,
      forms: 1,
      inspections: 1,
      missing: 1,
    });
    expect(database.form.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          questions: [
            {
              ...mixedQuestions[0],
              okImageUrl: ref('forms'),
              nokImageUrl: ref('forms'),
            },
          ],
        },
      }),
    );
    expect(database.inspectionResult.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          answers: [
            answers[0],
            { questionId: 'photo', value: ref('inspections') },
          ],
        },
      }),
    );
    expect(client.copyObject).toHaveBeenCalledTimes(2);
  });

  it('can migrate a previously missing source after it is restored and the migration is rerun', async () => {
    const { objects, database, client } = fixture();
    objects.clear();
    const first = new MediaMigration(
      database as unknown as PrismaClient,
      client as unknown as Client,
      'inspection-media',
      true,
    );
    await expect(first.questions(questions)).resolves.toEqual(questions);
    objects.set(name, Buffer.from('restored bytes'));
    const retry = new MediaMigration(
      database as unknown as PrismaClient,
      client as unknown as Client,
      'inspection-media',
      true,
    );
    const result = await retry.questions(questions);
    expect(result).toEqual([
      {
        ...questions[0],
        instructionImageUrl: ref('forms'),
        okImageUrl: ref('forms'),
        nokImageUrl: ref('forms'),
      },
    ]);
    expect(retry.counts.missing).toBe(0);
    expect(objects.get(`forms/${name}`)).toEqual(objects.get(name));
  });

  it('does not reuse an unverified target when the source is absent', async () => {
    const { migration, objects, client } = fixture();
    objects.set(`forms/${name}`, Buffer.from('unverified bytes'));
    objects.delete(name);
    await expect(migration.questions(questions)).resolves.toEqual(questions);
    expect(client.getObject).not.toHaveBeenCalled();
    expect(client.copyObject).not.toHaveBeenCalled();
  });

  it('fails before reading rows when the bucket does not exist', async () => {
    const { migration, client, database } = fixture();
    client.bucketExists.mockResolvedValue(false);
    await expect(migration.run()).rejects.toThrow(
      'Media bucket does not exist',
    );
    expect(database.form.findMany).not.toHaveBeenCalled();
    expect(client.statObject).not.toHaveBeenCalled();
  });

  it.each(['AccessDenied', 'NoSuchBucket', 'ECONNRESET'])(
    'does not skip storage error %s',
    async (code) => {
      const { migration, client, database } = fixture();
      client.statObject.mockRejectedValue(
        Object.assign(new Error(code), { code }),
      );
      database.form.findMany.mockResolvedValueOnce([{ id: 'form', questions }]);
      await expect(migration.run()).rejects.toThrow(code);
      expect(migration.counts.missing).toBe(0);
      expect(database.form.updateMany).not.toHaveBeenCalled();
    },
  );

  it('still fails if a source disappears during checksum verification', async () => {
    const { migration, client, database } = fixture();
    client.getObject.mockRejectedValue(
      Object.assign(new Error('missing during verification'), {
        code: 'NotFound',
      }),
    );
    database.form.findMany.mockResolvedValueOnce([{ id: 'form', questions }]);
    await expect(migration.run()).rejects.toThrow(
      'missing during verification',
    );
    expect(migration.counts.missing).toBe(0);
    expect(database.form.updateMany).not.toHaveBeenCalled();
  });

  it('does not overwrite a concurrently changed database row', async () => {
    const { migration, database, objects } = fixture();
    database.form.findMany.mockResolvedValueOnce([{ id: 'form', questions }]);
    database.form.updateMany.mockResolvedValue({ count: 0 });
    await expect(migration.run()).rejects.toThrow('changed concurrently');
    expect(objects.has(name)).toBe(true);
    expect(objects.has(`forms/${name}`)).toBe(true);
  });

  it('dry run checks sources without writing objects or database records', async () => {
    const { migration, database, client, objects } = fixture(false);
    database.form.findMany
      .mockResolvedValueOnce([{ id: 'form', questions }])
      .mockResolvedValue([]);
    database.inspectionResult.findMany.mockResolvedValue([]);
    expect(await migration.run()).toEqual({
      copied: 0,
      verified: 1,
      forms: 1,
      inspections: 0,
      missing: 0,
    });
    expect(client.copyObject).not.toHaveBeenCalled();
    expect(database.form.updateMany).not.toHaveBeenCalled();
    expect(objects.size).toBe(1);
  });
});
