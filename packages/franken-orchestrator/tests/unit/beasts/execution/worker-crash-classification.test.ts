import { describe, expect, it } from 'vitest';
import { classifyWorkerCrash } from '../../../../src/beasts/execution/worker-crash-classification.js';

describe('worker crash classification taxonomy', () => {
  it('classifies clean exits as non-crashes', () => {
    expect(classifyWorkerCrash({ code: 0, signal: null })).toMatchObject({
      kind: 'clean_exit',
      severity: 'none',
      retryable: false,
    });
  });

  it('classifies spawn failures as non-retryable operator setup errors', () => {
    expect(classifyWorkerCrash({ stopReason: 'spawn_failed', spawnErrorCode: 'ENOENT' })).toMatchObject({
      kind: 'spawn_failure',
      severity: 'error',
      retryable: false,
      summary: expect.stringContaining('ENOENT'),
    });
  });

  it('classifies SIGKILL and exit code 137 as likely OOM kills', () => {
    expect(classifyWorkerCrash({ signal: 'SIGKILL' })).toMatchObject({
      kind: 'oom_killed',
      severity: 'critical',
      retryable: true,
    });
    expect(classifyWorkerCrash({ code: 137, stderrTail: ['Killed process after heap out of memory'] })).toMatchObject({
      kind: 'oom_killed',
      severity: 'critical',
      retryable: true,
    });
  });

  it('classifies runtime exception stderr separately from generic nonzero exits', () => {
    expect(classifyWorkerCrash({ code: 1, signal: null, stderrTail: ['TypeError: bad input'] })).toMatchObject({
      kind: 'runtime_error',
      severity: 'error',
      retryable: true,
    });
    expect(classifyWorkerCrash({ code: 2, signal: null, stderrTail: ['usage: missing --goal'] })).toMatchObject({
      kind: 'nonzero_exit',
      severity: 'error',
      retryable: true,
    });
  });

  it('classifies operator stop and force-kill as intentional lifecycle outcomes', () => {
    expect(classifyWorkerCrash({ stopReason: 'operator_stop' })).toMatchObject({
      kind: 'operator_stop',
      severity: 'info',
      retryable: false,
    });
    expect(classifyWorkerCrash({ stopReason: 'operator_kill' })).toMatchObject({
      kind: 'operator_kill',
      severity: 'warning',
      retryable: false,
    });
  });
});
