import { EventOutcome } from '@inspect-hub/database';
import { DatabaseService } from '../database/database.service';
import { EventsService } from './events.service';

describe('EventsService', () => {
  interface CreateArgs {
    data: { payloadHash: string; [key: string]: unknown };
  }
  const create = jest.fn((args: CreateArgs) => args);
  const database = {
    auditEvent: { create, findMany: jest.fn() },
  } as unknown as DatabaseService;
  const service = new EventsService(database);

  beforeEach(() => jest.clearAllMocks());

  it('normalizes events, redacts secrets and creates an integrity hash', async () => {
    await service.record({
      type: 'inspection_completed',
      category: 'quality',
      outcome: EventOutcome.SUCCESS,
      payload: {
        result: 'PASS',
        authorization: 'Bearer secret',
        cardCode: '1234',
        nested: { password: 'secret', safe: true },
      },
      correlationId: 'trace-1',
    });

    const saved = create.mock.calls[0][0].data;
    expect(saved.type).toBe('INSPECTION_COMPLETED');
    expect(saved.category).toBe('QUALITY');
    expect(saved.correlationId).toBe('trace-1');
    expect(saved.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.payload).toEqual({
      result: 'PASS',
      authorization: '[REDACTED]',
      cardCode: '[REDACTED]',
      nested: { password: '[REDACTED]', safe: true },
    });
  });

  it('produces the same payload hash regardless of object key order', async () => {
    await service.record({
      type: 'TEST',
      category: 'SYSTEM',
      correlationId: 'one',
      payload: { b: 2, a: 1 },
    });
    await service.record({
      type: 'TEST',
      category: 'SYSTEM',
      correlationId: 'two',
      payload: { a: 1, b: 2 },
    });

    const first = create.mock.calls[0][0];
    const second = create.mock.calls[1][0];
    expect(first.data.payloadHash).toBe(second.data.payloadHash);
  });
});
