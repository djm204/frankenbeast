import { describe, expect, it } from 'vitest';
import {
  CodexRuntimeAdapter,
  HermesRuntimeAdapter,
  RuntimeEventPageSchema,
  RuntimeProviderSchema,
  RuntimeSnapshotSchema,
  type RuntimeAdapter,
} from '../../../src/runtime/index.js';

interface AdapterCase {
  name: string;
  create: () => RuntimeAdapter;
}

const cases: AdapterCase[] = [
  {
    name: 'Hermes',
    create: () => new HermesRuntimeAdapter({ env: {}, now: () => new Date('2026-07-26T12:00:00.000Z') }),
  },
  {
    name: 'Codex',
    create: () => new CodexRuntimeAdapter({
      now: () => new Date('2026-07-26T12:00:00.000Z'),
      request: async () => ({ data: [], nextCursor: null }),
    }),
  },
];

describe.each(cases)('$name runtime adapter conformance', ({ create }) => {
  it('returns provider and snapshot values accepted by the normalized schemas', async () => {
    const adapter = create();
    const provider = await adapter.describe();
    const snapshot = await adapter.getSnapshot();

    expect(() => RuntimeProviderSchema.parse(provider)).not.toThrow();
    expect(() => RuntimeSnapshotSchema.parse(snapshot)).not.toThrow();
  });

  it('returns normalized event pages and uses the shared invalid-cursor error code', async () => {
    const adapter = create();
    const page = await adapter.getEvents({ limit: 1 });

    expect(() => RuntimeEventPageSchema.parse(page)).not.toThrow();
    await expect(adapter.getEvents({ cursor: 'malformed' })).rejects.toMatchObject({
      code: 'INVALID_CURSOR',
    });
  });

  it('rejects unbounded read limits', async () => {
    const adapter = create();

    await expect(adapter.getSnapshot({ activityLimit: 501 })).rejects.toBeInstanceOf(RangeError);
    await expect(adapter.getEvents({ limit: 501 })).rejects.toBeInstanceOf(RangeError);
  });
});
