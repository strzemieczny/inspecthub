import { createHash } from 'node:crypto';
import { Client, CopyConditions } from 'minio';
import { Prisma, PrismaClient } from '@inspect-hub/database';
import { LEGACY_OBJECT_NAME_PATTERN, type MediaPurpose } from './media-paths';

/** Only recognized local media references can be migrated; arbitrary text is kept. */
export function legacyMediaReference(value: unknown, bucket: string) {
  if (typeof value !== 'string') return null;
  if (LEGACY_OBJECT_NAME_PATTERN.test(value)) {
    return { name: value, rewrite: (name: string) => name };
  }
  try {
    const url = new URL(value, 'http://inspect-hub.invalid');
    if (
      url.pathname === '/api/media/object' ||
      url.pathname === '/inspect-hub/api/media/object'
    ) {
      const name = url.searchParams.get('name');
      if (!name || !LEGACY_OBJECT_NAME_PATTERN.test(name)) return null;
      return {
        name,
        rewrite: (replacement: string) => {
          url.searchParams.set('name', replacement);
          return `${value.split('?')[0]}${url.search}${url.hash}`;
        },
      };
    }
    // Earlier clients also saved direct local MinIO URLs.
    if (url.hostname === 'localhost' && url.port === '9000') {
      const path = decodeURIComponent(url.pathname);
      const prefix = `/${bucket}/`;
      const name = path.startsWith(prefix) ? path.slice(prefix.length) : '';
      if (LEGACY_OBJECT_NAME_PATTERN.test(name)) {
        return {
          name,
          rewrite: (replacement: string) =>
            `/api/media/object?name=${encodeURIComponent(replacement)}`,
        };
      }
    }
  } catch {
    // Malformed URLs are not rewritten.
  }
  return null;
}

export class MediaMigration {
  private readonly verified = new Set<string>();
  readonly missingObjects = new Set<string>();
  readonly counts = {
    copied: 0,
    verified: 0,
    forms: 0,
    inspections: 0,
    missing: 0,
  };

  constructor(
    private readonly database: PrismaClient,
    private readonly client: Client,
    private readonly bucket: string,
    private readonly apply: boolean,
  ) {}

  private async checksum(name: string): Promise<string> {
    const stream = await this.client.getObject(this.bucket, name);
    const hash = createHash('sha256');
    for await (const chunk of stream as AsyncIterable<Buffer>)
      hash.update(chunk);
    return hash.digest('hex');
  }

  private async copyAndVerify(
    source: string,
    target: string,
  ): Promise<boolean> {
    if (this.verified.has(target)) return true;
    if (this.missingObjects.has(source)) return false;
    let original: Awaited<ReturnType<Client['statObject']>>;
    try {
      original = await this.client.statObject(this.bucket, source);
    } catch (error) {
      if (
        !['NotFound', 'NoSuchKey'].includes(
          (error as { code?: string }).code ?? '',
        )
      )
        throw error;
      // A historical broken reference must not block unrelated media or be
      // rewritten to an unverified copy. Only a missing source is recoverable.
      this.missingObjects.add(source);
      this.counts.missing++;
      return false;
    }
    let existing = false;
    try {
      await this.client.statObject(this.bucket, target);
      existing = true;
    } catch (error) {
      if (
        !['NotFound', 'NoSuchKey'].includes(
          (error as { code?: string }).code ?? '',
        )
      )
        throw error;
    }
    if (!existing && this.apply) {
      const conditions = new CopyConditions();
      conditions.setMatchETag(original.etag);
      await this.client.copyObject(
        this.bucket,
        target,
        `/${this.bucket}/${source}`,
        conditions,
      );
      this.counts.copied++;
    }
    if (existing || this.apply) {
      // Read actual bytes, not just ETags (which differ for multipart objects).
      const [sourceHash, targetHash] = await Promise.all([
        this.checksum(source),
        this.checksum(target),
      ]);
      const copied = await this.client.statObject(this.bucket, target);
      if (
        sourceHash !== targetHash ||
        original.size !== copied.size ||
        original.metaData?.['content-type'] !==
          copied.metaData?.['content-type']
      ) {
        throw new Error(
          `Copy verification failed: ${target}; original retained`,
        );
      }
    }
    this.verified.add(target);
    this.counts.verified++;
    return true;
  }

  private async reference(value: unknown, purpose: MediaPurpose) {
    const reference = legacyMediaReference(value, this.bucket);
    if (!reference) return value;
    const target = `${purpose}/${reference.name}`;
    if (!(await this.copyAndVerify(reference.name, target))) return value;
    return reference.rewrite(target);
  }

  async questions(value: Prisma.JsonValue): Promise<Prisma.JsonValue> {
    if (!Array.isArray(value)) return value;
    const result: Prisma.JsonValue[] = [];
    for (const item of value) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        result.push(item);
        continue;
      }
      const question = { ...item };
      for (const field of [
        'instructionImageUrl',
        'okImageUrl',
        'nokImageUrl',
      ]) {
        if (field in question) {
          question[field] = (await this.reference(
            question[field],
            'forms',
          )) as Prisma.JsonValue;
        }
      }
      result.push(question);
    }
    return result;
  }

  async answers(
    value: Prisma.JsonValue,
    questions: Prisma.JsonValue,
  ): Promise<Prisma.JsonValue> {
    if (!Array.isArray(value) || !Array.isArray(questions)) return value;
    const photoIds = new Set(
      questions.flatMap((question) =>
        question &&
        typeof question === 'object' &&
        !Array.isArray(question) &&
        question.type === 'PHOTO_UPLOAD'
          ? [question.id]
          : [],
      ),
    );
    const result: Prisma.JsonValue[] = [];
    for (const item of value) {
      if (
        item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        photoIds.has(item.questionId)
      ) {
        result.push({
          ...item,
          value: (await this.reference(
            item.value,
            'inspections',
          )) as Prisma.JsonValue,
        });
      } else result.push(item);
    }
    return result;
  }

  async run() {
    // MinIO can return a generic NotFound for an absent bucket as well. Verify
    // storage before treating individual missing source objects as warnings.
    if (!(await this.client.bucketExists(this.bucket))) {
      throw new Error(`Media bucket does not exist: ${this.bucket}`);
    }
    // Keyset pagination covers archived forms and every historical version.
    let cursor: string | undefined;
    for (;;) {
      const rows = await this.database.form.findMany({
        take: 100,
        orderBy: { id: 'asc' },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, questions: true },
      });
      if (!rows.length) break;
      for (const row of rows) {
        if (!Array.isArray(row.questions)) continue;
        const questions = await this.questions(row.questions);
        if (JSON.stringify(questions) === JSON.stringify(row.questions))
          continue;
        if (this.apply) {
          const updated = await this.database.form.updateMany({
            where: { id: row.id, questions: { equals: row.questions } },
            data: { questions: questions as Prisma.InputJsonValue },
          });
          if (updated.count !== 1)
            throw new Error(
              `Form changed concurrently: ${row.id}; rerun migration`,
            );
        }
        this.counts.forms++;
      }
      cursor = rows[rows.length - 1].id;
    }
    cursor = undefined;
    for (;;) {
      const rows: {
        id: string;
        answers: Prisma.JsonValue;
        form: { questions: Prisma.JsonValue };
      }[] = await this.database.inspectionResult.findMany({
        take: 100,
        orderBy: { id: 'asc' },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          answers: true,
          form: { select: { questions: true } },
        },
      });
      if (!rows.length) break;
      for (const row of rows) {
        if (!Array.isArray(row.answers)) continue;
        const answers = await this.answers(row.answers, row.form.questions);
        if (JSON.stringify(answers) === JSON.stringify(row.answers)) continue;
        if (this.apply) {
          const updated = await this.database.inspectionResult.updateMany({
            where: { id: row.id, answers: { equals: row.answers } },
            data: { answers: answers as Prisma.InputJsonValue },
          });
          if (updated.count !== 1)
            throw new Error(
              `Inspection changed concurrently: ${row.id}; rerun migration`,
            );
        }
        this.counts.inspections++;
      }
      cursor = rows[rows.length - 1].id;
    }
    return this.counts;
  }
}
