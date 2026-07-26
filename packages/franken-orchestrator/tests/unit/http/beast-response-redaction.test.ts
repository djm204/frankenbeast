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

  it('preserves slash commands and API routes while redacting embedded filesystem paths', () => {
    expect(redactAbsoluteHostPathValues(
      'Sent /plan --design-doc through GET /v1/smart-swarm after reading /home/alice/private-repo/config.json',
    )).toBe(
      'Sent /plan --design-doc through GET /v1/smart-swarm after reading [REDACTED_HOST_PATH]',
    );
  });

  it('preserves standalone slash commands and API routes', () => {
    expect(redactAbsoluteHostPathValues('/plan')).toBe('/plan');
    expect(redactAbsoluteHostPathValues('/v1/users')).toBe('/v1/users');
  });

  it('redacts host paths embedded after a leading application route', () => {
    expect(redactAbsoluteHostPathValues('/api/tasks?root=/home/alice/project'))
      .toBe('/api/tasks?root=[REDACTED_HOST_PATH]');
  });

  it('redacts embedded host paths after key-value delimiters', () => {
    expect(redactAbsoluteHostPathValues('workspace=/home/alice/private-repo'))
      .toBe('workspace=[REDACTED_HOST_PATH]');
  });

  it('preserves quoted API routes', () => {
    expect(redactAbsoluteHostPathValues('Call "/v1/users" after setup'))
      .toBe('Call "/v1/users" after setup');
  });

  it('preserves known non-versioned application routes', () => {
    expect(redactAbsoluteHostPathValues('Check /comms/health and /webhooks/slack/events'))
      .toBe('Check /comms/health and /webhooks/slack/events');
  });

  it('redacts quoted host paths rooted outside the common host allowlist', () => {
    expect(redactAbsoluteHostPathValues("ENOTDIR: scandir '/data/hermes/kanban/boards'"))
      .toBe("ENOTDIR: scandir '[REDACTED_HOST_PATH]'");
    expect(redactAbsoluteHostPathValues('failed under /data/hermes/kanban/boards'))
      .toBe('failed under [REDACTED_HOST_PATH]');
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
