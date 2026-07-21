import { describe, expect, it } from 'vitest';
import {
  redactAbsoluteHostPathValues,
  redactHostExecutionData,
} from '../../../src/http/beast-response-redaction.js';

describe('Beast response redaction', () => {
  it('removes project roots and recursively redacts absolute config paths', () => {
    expect(redactAbsoluteHostPathValues({
      projectRoot: '/srv/private/project',
      chunkDirectory: '/srv/private/project/docs/chunks',
      nested: { outputPath: 'C:\\private\\report.md', relativePath: 'docs/report.md' },
    })).toEqual({
      chunkDirectory: '[REDACTED_HOST_PATH]',
      nested: { outputPath: '[REDACTED_HOST_PATH]', relativePath: 'docs/report.md' },
    });
  });

  it('recursively removes host execution fields from SSE event data', () => {
    expect(redactHostExecutionData({
      runId: 'run-1',
      event: {
        type: 'attempt.started',
        payload: {
          pid: 1234,
          command: '/srv/private/project/bin/frankenbeast',
          nested: { worktreePath: '/srv/private/project/.worktrees/agent-1', safe: true },
        },
      },
    })).toEqual({
      runId: 'run-1',
      event: {
        type: 'attempt.started',
        payload: { pid: 1234, nested: { safe: true } },
      },
    });
  });
});
