import { EventEmitter } from 'node:events';
export class PiiDetectedError extends Error {
    fields;
    data;
    constructor(fields, data) {
        super(`PII detected in fields: ${fields.join(', ')}`);
        this.fields = fields;
        this.data = data;
        this.name = 'PiiDetectedError';
    }
}
export class PiiGuard extends EventEmitter {
    scanner;
    constructor(scanner) {
        super();
        this.scanner = scanner;
    }
    async check(data) {
        const result = await this.scanner.scan(data);
        if (result.clean)
            return;
        const event = { fields: result.fields, data };
        this.emit('pii-detected', event);
        if (result.mode === 'block') {
            throw new PiiDetectedError(result.fields, data);
        }
    }
}
//# sourceMappingURL=pii-guard.js.map