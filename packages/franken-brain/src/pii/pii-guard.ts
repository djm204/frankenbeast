import { EventEmitter } from 'node:events';
import type { IPiiScanner } from './pii-scanner-interface.js';

export interface PiiDetectedEvent {
  fields: string[];
  data: unknown;
}

export class PiiDetectedError extends Error {
  constructor(
    public readonly fields: string[],
    public readonly data: unknown,
  ) {
    super(`PII detected in fields: ${fields.join(', ')}`);
    this.name = 'PiiDetectedError';
  }
}

export class PiiGuard extends EventEmitter {
  constructor(private readonly scanner: IPiiScanner) {
    super();
  }

  async check(data: unknown): Promise<void> {
    const result = await this.scanner.scan(data);
    if (result.clean) return;

    const event: PiiDetectedEvent = { fields: result.fields, data };
    this.emit('pii-detected', event);

    if (result.mode === 'block') {
      throw new PiiDetectedError(result.fields, data);
    }
  }
}
