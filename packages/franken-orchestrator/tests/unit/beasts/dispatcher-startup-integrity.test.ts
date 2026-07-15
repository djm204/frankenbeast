import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { BEAST_DEFINITIONS } from '../../../src/beasts/definitions/catalog.js';
import type { BeastDefinition } from '../../../src/beasts/types.js';
import {
  assertDispatcherStartupIntegrity,
  checkDispatcherStartupIntegrity,
  DispatcherStartupIntegrityError,
} from '../../../src/beasts/services/dispatcher-startup-integrity.js';

const executors = {
  process: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() },
  container: { start: vi.fn(), stop: vi.fn(), kill: vi.fn() },
};

function definition(overrides: Partial<BeastDefinition> = {}): BeastDefinition {
  return {
    id: 'example-beast',
    version: 1,
    label: 'Example Beast',
    description: 'Example definition used by startup integrity tests.',
    executionModeDefault: 'process',
    configSchema: z.object({ objective: z.string().min(1) }).strict(),
    interviewPrompts: [
      { key: 'objective', prompt: 'What should this Beast do?', kind: 'string', required: true },
    ],
    buildProcessSpec: (config) => ({
      command: process.execPath,
      args: ['frankenbeast', 'run', String(config.objective)],
    }),
    telemetryLabels: { family: 'example' },
    ...overrides,
  };
}

describe('dispatcher startup integrity checks', () => {
  it('passes the shipped catalog and executor wiring with structured operator guidance', () => {
    const report = assertDispatcherStartupIntegrity({
      definitions: BEAST_DEFINITIONS,
      executors,
    });

    expect(report).toMatchObject({
      ok: true,
      definitionsChecked: BEAST_DEFINITIONS.length,
      executorModes: ['process', 'container'],
      errors: [],
    });
    expect(report.operatorGuidance).toContain('passed');
  });

  it('fails closed when a definition defaults to an executor that is not wired at startup', () => {
    const report = checkDispatcherStartupIntegrity({
      definitions: [definition({ executionModeDefault: 'container' })],
      executors: { process: executors.process },
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'invalid_executor_contract',
        mode: 'container',
      }),
      expect.objectContaining({
        code: 'missing_executor',
        definitionId: 'example-beast',
        mode: 'container',
      }),
    ]));
    expect(report.operatorGuidance).toContain('fails closed');
  });

  it('reports duplicate catalog ids and invalid prompt contracts before dispatch accepts work', () => {
    const invalid = definition({
      interviewPrompts: [
        { key: 'objective', prompt: 'Objective?', kind: 'string' },
        { key: 'objective', prompt: '', kind: 'file' },
      ],
    });

    expect(() => assertDispatcherStartupIntegrity({
      definitions: [definition(), invalid],
      executors,
    })).toThrow(DispatcherStartupIntegrityError);

    try {
      assertDispatcherStartupIntegrity({ definitions: [definition(), invalid], executors });
    } catch (error) {
      expect(error).toBeInstanceOf(DispatcherStartupIntegrityError);
      expect((error as DispatcherStartupIntegrityError).report.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'duplicate_definition_id', definitionId: 'example-beast' }),
        expect.objectContaining({ code: 'invalid_prompt_contract', definitionId: 'example-beast' }),
      ]));
      expect(String(error)).toContain('Beast dispatcher startup integrity check failed');
    }
  });
});
