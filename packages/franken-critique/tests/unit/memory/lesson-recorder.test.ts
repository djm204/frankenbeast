import { describe, it, expect, vi } from 'vitest';
import {
  LessonRecorder,
  applyHumanFeedbackToLesson,
  detectLessonContradictions,
  isLessonApplicable,
  quarantineLesson,
  quarantineLessonForRepeatedFailures,
  unquarantineLesson,
} from '../../../src/memory/lesson-recorder.js';
import { EVALUATOR_EXCEPTION_LOCATION } from '../../../src/types/evaluation.js';
import type { MemoryPort, CritiqueLesson } from '../../../src/types/contracts.js';
import type {
  CritiqueLoopResult,
  CritiqueIteration,
} from '../../../src/types/loop.js';
import type {
  CritiqueResult,
  EvaluationFinding,
} from '../../../src/types/evaluation.js';

function createMockMemoryPort(): MemoryPort {
  return {
    searchADRs: vi.fn().mockResolvedValue([]),
    searchEpisodic: vi.fn().mockResolvedValue([]),
    recordLesson: vi.fn().mockResolvedValue(undefined),
  };
}

function createIteration(
  index: number,
  verdict: 'pass' | 'warn' | 'fail',
  evaluatorName = 'mock',
  findings: EvaluationFinding[] = [],
): CritiqueIteration {
  const result: CritiqueResult = {
    verdict,
    overallScore: verdict === 'pass' ? 1 : 0.3,
    results: [
      {
        evaluatorName,
        verdict,
        score: verdict === 'pass' ? 1 : 0.3,
        findings,
      },
    ],
    shortCircuited: false,
  };
  return createIterationFromResult(index, result);
}

function createIterationFromResult(
  index: number,
  result: CritiqueResult,
): CritiqueIteration {
  return {
    index,
    input: { content: `iteration ${index}`, metadata: {} },
    result,
    completedAt: new Date().toISOString(),
  };
}

function createLesson(overrides: Partial<CritiqueLesson> = {}): CritiqueLesson {
  return {
    evaluatorName: 'factuality',
    failureDescription: 'Cache guidance allowed unaudited stale responses',
    correctionApplied: 'Require cache verification before reuse',
    taskId: 'lesson-task',
    timestamp: '2026-07-11T00:00:00.000Z',
    ...overrides,
  };
}

describe('LessonRecorder', () => {
  it('does not record when critique passes on first iteration', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [createIteration(0, 'pass')],
    };

    await recorder.record(result, 'test-task');

    expect(port.recordLesson).not.toHaveBeenCalled();
  });

  it('redacts secrets before recording critique lessons', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);
    const fakeToken = `ghp_${'FAKE'.padEnd(36, '0')}`;
    const lowercaseBearer = `bearer ${'opaque'.padEnd(24, 'x')}`;
    const fakeConnectionString = `postgresql://user:${'pass'.padEnd(12, 'x')}@db.internal/app`;

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'privacy', [
          {
            message: `Reviewer pasted Authorization: Bearer *** and ${lowercaseBearer} and ${fakeConnectionString}`,
            severity: 'critical',
            suggestion: `Move token ${fakeToken} into a secret manager before retrying.`,
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const recording = await recorder.record(result, 'privacy-task');

    expect(recording.recorded).toBe(1);
    expect(recording.rejectedByPrivacy).toEqual([]);
    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(JSON.stringify(lesson)).not.toContain(fakeToken);
    expect(JSON.stringify(lesson)).not.toContain(lowercaseBearer);
    expect(JSON.stringify(lesson)).not.toContain(fakeConnectionString);
    expect(lesson.failureDescription).toContain('Bearer [REDACTED_TOKEN]');
    expect(lesson.failureDescription).toContain(
      '[REDACTED_CONNECTION_STRING]',
    );
    expect(lesson.reviewerFeedback?.findings[0]?.suggestion).toContain(
      '[REDACTED_GITHUB_TOKEN]',
    );
    expect(lesson.privacyFilter).toEqual(
      expect.objectContaining({
        schemaVersion: 'lesson-privacy-filter-v1',
        action: 'admit',
        sensitive: true,
        approvalRequired: true,
        redactions: expect.arrayContaining([
          expect.objectContaining({ label: 'github-token' }),
          expect.objectContaining({ label: 'bearer-token' }),
          expect.objectContaining({ label: 'connection-string' }),
        ]),
      }),
    );
    expect(JSON.stringify(lesson.privacyFilter)).not.toContain(fakeToken);
  });

  it('flags personal and customer data for explicit approval after redaction', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);
    const emailAddress = `operator${'@'}example.test`;
    const customerAccount = 'customer account ACME-Enterprise-42';

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'privacy', [
          {
            message: `${customerAccount} handoff included ${emailAddress}`,
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'privacy-personal-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(JSON.stringify(lesson)).not.toContain(emailAddress);
    expect(JSON.stringify(lesson)).not.toContain(customerAccount);
    expect(lesson.failureDescription).toContain('[REDACTED_EMAIL]');
    expect(lesson.failureDescription).toContain('[REDACTED_CUSTOMER_DATA]');
    expect(lesson.privacyFilter).toEqual(
      expect.objectContaining({
        action: 'admit',
        sensitive: true,
        approvalRequired: true,
        flags: expect.arrayContaining([
          'customer-data',
          'email-address',
          'personal-data',
        ]),
      }),
    );
  });

  it('redacts customer-only findings before recording lessons', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);
    const customerAccount = 'customer account ACME-Enterprise-42';

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'privacy-customer', [
          {
            message: `Reviewer pasted ${customerAccount} in the lesson candidate`,
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'privacy-customer-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(JSON.stringify(lesson)).not.toContain(customerAccount);
    expect(lesson.failureDescription).toContain('[REDACTED_CUSTOMER_DATA]');
    expect(lesson.privacyFilter).toEqual(
      expect.objectContaining({
        action: 'admit',
        sensitive: true,
        approvalRequired: true,
        flags: expect.arrayContaining(['customer-data']),
        redactions: expect.arrayContaining([
          expect.objectContaining({ label: 'customer-context' }),
        ]),
      }),
    );
  });

  it('binds privacy approval hashes to sensitive suggestions and locations', async () => {
    const firstPort = createMockMemoryPort();
    const secondPort = createMockMemoryPort();
    const firstRecorder = new LessonRecorder(firstPort);
    const secondRecorder = new LessonRecorder(secondPort);
    const firstEmail = `first${'@'}example.test`;
    const secondEmail = `second${'@'}example.test`;

    const createResult = (emailAddress: string): CritiqueLoopResult => ({
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'privacy-suggestion', [
          {
            message: 'Validate privacy evidence before recording lessons',
            severity: 'critical',
            location: `owner ${emailAddress}`,
            suggestion: `Do not persist ${emailAddress}`,
          },
        ]),
        createIteration(1, 'pass'),
      ],
    });

    await firstRecorder.record(createResult(firstEmail), 'privacy-hash-task');
    await secondRecorder.record(createResult(secondEmail), 'privacy-hash-task');

    const firstLesson = (firstPort.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    const secondLesson = (secondPort.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(JSON.stringify(firstLesson)).not.toContain(firstEmail);
    expect(JSON.stringify(secondLesson)).not.toContain(secondEmail);
    expect(firstLesson.privacyFilter?.originalHash).not.toEqual(
      secondLesson.privacyFilter?.originalHash,
    );
  });

  it('rejects sensitive lesson metadata before durable recording', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);
    const sensitiveEvaluator = `reviewer-${'operator'}${'@'}example.test`;

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', sensitiveEvaluator, [
          {
            message: 'Validate evidence before recording a durable lesson',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const recording = await recorder.record(result, 'privacy-metadata-task');

    expect(recording.recorded).toBe(0);
    expect(port.recordLesson).not.toHaveBeenCalled();
    expect(JSON.stringify(recording)).not.toContain(sensitiveEvaluator);
    expect(recording.rejectedByPrivacy).toEqual([
      expect.objectContaining({
        action: 'reject',
        sensitive: true,
        flags: expect.arrayContaining(['email-address', 'personal-data']),
      }),
    ]);
  });

  it('rejects customer lesson metadata before durable recording', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const recording = await recorder.record(
      {
        verdict: 'pass',
        iterations: [
          createIteration(0, 'fail', 'customer account ACME', [
            {
              message: 'Validate evidence before recording a durable lesson',
              severity: 'warning',
            },
          ]),
          createIteration(1, 'pass'),
        ],
      },
      'privacy-customer-metadata-task',
    );

    expect(recording.recorded).toBe(0);
    expect(port.recordLesson).not.toHaveBeenCalled();
    expect(recording.rejectedByPrivacy).toEqual([
      expect.objectContaining({
        action: 'reject',
        sensitive: true,
        flags: expect.arrayContaining(['customer-data']),
      }),
    ]);
  });

  it('classifies safe environment facts without redacting false-positive learning terms', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning', [
          {
            message:
              'Repository uses token budget metadata for cooldown scoring',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'privacy-environment-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.failureDescription).toContain('token budget metadata');
    expect(lesson.privacyFilter).toEqual(
      expect.objectContaining({
        category: 'environment-fact',
        action: 'admit',
        sensitive: false,
        approvalRequired: false,
        redactions: [],
      }),
    );
  });

  it('classifies reusable procedures as durable candidates', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning', [
          {
            message:
              'Before recording lessons, validate evidence and include the verification command',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'privacy-procedure-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.privacyFilter).toEqual(
      expect.objectContaining({
        category: 'procedure',
        action: 'admit',
      }),
    );
  });

  it('preserves reusable findings when mixed with task-state findings', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message: 'Merged PR #123 after CI turned green',
            severity: 'warning',
          },
          {
            message:
              'Before recording lessons, validate evidence and include the verification command',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const recording = await recorder.record(result, 'privacy-mixed-task');

    expect(recording.recorded).toBe(1);
    expect(recording.rejectedByPrivacy).toEqual([
      expect.objectContaining({
        category: 'task-state',
        action: 'reject',
      }),
    ]);
    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.failureDescription).toContain('validate evidence');
    expect(lesson.failureDescription).not.toContain('PR #123');
  });

  it('preserves reusable findings that cite issue IDs after redacting the transient reference', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message:
              'Regression for issue #69: validate evidence before recording lessons',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const recording = await recorder.record(result, 'privacy-issue-ref-task');

    expect(recording.recorded).toBe(1);
    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.failureDescription).toContain('validate evidence');
    expect(lesson.failureDescription).toContain('[REDACTED_TASK_REFERENCE]');
    expect(lesson.failureDescription).not.toContain('issue #69');
  });

  it('redacts all admitted task references consistently', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message:
              'Regression in pull request #123 at commit abcdef1 and task t_abcdef: validate evidence before recording lessons',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const recording = await recorder.record(result, 'privacy-task-ref-task');

    expect(recording.recorded).toBe(1);
    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.failureDescription).toContain('[REDACTED_TASK_REFERENCE]');
    expect(lesson.failureDescription).not.toContain('pull request #123');
    expect(lesson.failureDescription).not.toContain('commit abcdef1');
    expect(lesson.failureDescription).not.toContain('task t_abcdef');
  });

  it('redacts generated issue task references consistently', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message:
              'Regression in impl:issue-42 and harden:issue-42: validate evidence before recording lessons',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'privacy-generated-issue-ref-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.failureDescription).toContain('[REDACTED_TASK_REFERENCE]');
    expect(lesson.failureDescription).not.toContain('impl:issue-42');
    expect(lesson.failureDescription).not.toContain('harden:issue-42');
  });

  it('does not flag ordinary client or account wording as customer data', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning', [
          {
            message:
              'HTTP client should validate retries and always account for flaky tests',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'privacy-customer-false-positive-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.failureDescription).toContain('HTTP client should validate retries');
    expect(lesson.failureDescription).toContain('account for flaky tests');
    expect(lesson.privacyFilter).toEqual(
      expect.objectContaining({
        sensitive: false,
        approvalRequired: false,
        flags: [],
        redactions: [],
      }),
    );
  });

  it('does not flag generic customer-facing wording as customer data', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning', [
          {
            message: 'Customer-facing checkout should validate retries',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'privacy-generic-customer-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.failureDescription).toContain('Customer-facing checkout');
    expect(lesson.privacyFilter).toEqual(
      expect.objectContaining({
        sensitive: false,
        approvalRequired: false,
        flags: [],
        redactions: [],
      }),
    );
  });

  it('rejects chronology-only task-state findings despite reusable verbs', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message: 'Merged PR #123 before tests ran',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const recording = await recorder.record(result, 'privacy-chronology-task');

    expect(recording.recorded).toBe(0);
    expect(port.recordLesson).not.toHaveBeenCalled();
    expect(recording.rejectedByPrivacy).toEqual([
      expect.objectContaining({
        category: 'task-state',
        action: 'reject',
      }),
    ]);
  });

  it('preserves specific personal-data redactions when customer spans overlap', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);
    const emailAddress = `operator${'@'}example.test`;

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'privacy', [
          {
            message: `Customer account ${emailAddress} needs validation before recording lessons`,
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'privacy-overlap-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(JSON.stringify(lesson)).not.toContain(emailAddress);
    expect(lesson.failureDescription).toContain('[REDACTED_EMAIL]');
    expect(lesson.failureDescription).not.toContain('@example.test');
    expect(lesson.failureDescription).toContain('[REDACTED_CUSTOMER_DATA]');
  });

  it('redacts lowercase customer identifiers fully', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);
    const customerAccount = 'customer account acme-42';

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'privacy', [
          {
            message: `${customerAccount} needs validation before recording lessons`,
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'privacy-lowercase-customer-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(JSON.stringify(lesson)).not.toContain(customerAccount);
    expect(JSON.stringify(lesson)).not.toContain('acme-42');
    expect(lesson.failureDescription).toContain('[REDACTED_CUSTOMER_DATA]');
  });

  it('detects capitalized tenant and client customer references', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'privacy', [
          {
            message:
              'Tenant ACME and Client account Foo need validation before recording lessons',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'privacy-capitalized-customer-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(JSON.stringify(lesson)).not.toContain('Tenant ACME');
    expect(JSON.stringify(lesson)).not.toContain('Client account Foo');
    expect(lesson.privacyFilter?.flags).toEqual(
      expect.arrayContaining(['customer-data']),
    );
  });

  it('rejects ticket-only task references before durable recording', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message: 'Closed ticket #123 after deploy',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const recording = await recorder.record(result, 'privacy-ticket-task');

    expect(recording.recorded).toBe(0);
    expect(port.recordLesson).not.toHaveBeenCalled();
    expect(recording.rejectedByPrivacy).toEqual([
      expect.objectContaining({ category: 'task-state' }),
    ]);
  });

  it('keeps cross-field secret detections from leaking reviewer feedback', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);
    const tokenValue = 'opaque-token-value'.padEnd(24, 'x');

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'privacy', [
          {
            message: 'Token:',
            severity: 'critical',
            suggestion: `${tokenValue} should be moved before recording lessons`,
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'privacy-cross-field-secret-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(JSON.stringify(lesson)).not.toContain(tokenValue);
    expect(lesson.reviewerFeedback?.findings[0]?.suggestion).not.toContain(
      tokenValue,
    );
  });

  it('preserves overlapping customer redactions that contain personal data', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);
    const phoneNumber = '4155551212';

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'privacy', [
          {
            message: `customer ${phoneNumber} ACME needs validation before recording lessons`,
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'privacy-overlap-customer-phone-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(JSON.stringify(lesson)).not.toContain(phoneNumber);
    expect(JSON.stringify(lesson)).not.toContain('ACME');
    expect(lesson.failureDescription).toContain('[REDACTED_CUSTOMER_DATA]');
  });

  it('redacts customer identifiers that follow email contacts', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);
    const emailAddress = `operator${'@'}example.test`;

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'privacy', [
          {
            message: `Customer account ${emailAddress} ACME needs validation before recording lessons`,
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'privacy-email-customer-id-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(JSON.stringify(lesson)).not.toContain(emailAddress);
    expect(JSON.stringify(lesson)).not.toContain('ACME');
    expect(lesson.failureDescription).toContain('[REDACTED_CUSTOMER_DATA]');
  });

  it('redacts suggestion secrets when locations are present', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);
    const tokenValue = 'opaque-suggestion-secret'.padEnd(28, 'x');

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'privacy', [
          {
            message: 'Token:',
            severity: 'critical',
            location: 'src/file.ts',
            suggestion: `${tokenValue} should be moved before recording lessons`,
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'privacy-location-suggestion-secret-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(JSON.stringify(lesson)).not.toContain(tokenValue);
    expect(lesson.reviewerFeedback?.findings[0]?.suggestion).not.toContain(
      tokenValue,
    );
  });

  it('keeps durable guidance despite merge chronology task state', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message: 'Merged PR #123; always run CI before merging',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const recording = await recorder.record(result, 'privacy-merge-guidance-task');

    expect(recording.recorded).toBe(1);
    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.failureDescription).toContain('always run CI');
    expect(lesson.failureDescription).not.toContain('PR #123');
  });

  it('rejects transient task-state candidates before durable recording', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message: 'Merged PR #123 after CI turned green',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const recording = await recorder.record(result, 'privacy-task-state');

    expect(recording.recorded).toBe(0);
    expect(port.recordLesson).not.toHaveBeenCalled();
    expect(recording.rejectedByPrivacy).toEqual([
      expect.objectContaining({
        schemaVersion: 'lesson-privacy-filter-v1',
        category: 'task-state',
        action: 'reject',
        sensitive: true,
        approvalRequired: false,
      }),
    ]);
  });

  it('records a lesson when multi-iteration pass occurs (fail then pass)', async () => {
    const unsafeDynamicCallName = 'executeUntrustedCode';

    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'safety', [
          {
            message: `${unsafeDynamicCallName}() detected`,
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'test-task');

    expect(port.recordLesson).toHaveBeenCalledTimes(1);
    expect(port.recordLesson).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluatorName: 'safety',
        failureDescription: expect.stringContaining(
          `${unsafeDynamicCallName}()`,
        ),
        taskId: 'test-task',
      }),
    );
  });

  it('adds a deterministic lesson-to-test traceability map to recorded lessons', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'Safety Gate', [
          { message: 'plain HTTP endpoint needs HTTPS', severity: 'critical' },
        ]),
        createIteration(2, 'pass'),
      ],
    };

    await recorder.record(result, 'Task 123');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.testTraceability).toEqual([
      {
        lessonId: 'task-123:safety-gate:iteration-0',
        taskId: 'Task 123',
        evaluatorName: 'Safety Gate',
        failingIteration: 0,
        resolvedIteration: 2,
        sourceFindingMessages: ['plain HTTP endpoint needs HTTPS'],
        testId: 'task-123:safety-gate:iteration-0:regression',
        verificationCommand:
          'npm run test --workspace @franken/critique -- --run tests/unit/memory/lesson-recorder.test.ts',
      },
    ]);
  });

  it('captures reviewer feedback messages, suggestions, severities, and source locations with the lesson', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message: 'PR summary omits the verification command',
            severity: 'warning',
            location: 'pull-request-body',
            suggestion:
              'Add the exact targeted test command and result to the PR description.',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'review-feedback-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.reviewerFeedback).toEqual({
      summary: 'PR summary omits the verification command',
      findings: [
        {
          sourceIteration: 0,
          evaluatorName: 'reviewer',
          message: 'PR summary omits the verification command',
          severity: 'warning',
          location: 'pull-request-body',
          suggestion:
            'Add the exact targeted test command and result to the PR description.',
        },
      ],
      suggestionsComplete: true,
    });
  });

  it('flags recovered failed-test findings as skill candidate signals', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message:
              'Failed test tests/unit/handoff.test.ts: expected PR body to include verification evidence',
            severity: 'critical',
            location: 'tests/unit/handoff.test.ts',
            suggestion:
              'Run npm run test --workspace @franken/critique before handoff.',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'failed-test-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.failedTestSkillCandidate).toEqual({
      detector: 'failed-test-to-skill-candidate',
      candidate: true,
      sourceIteration: 0,
      evaluatorName: 'reviewer',
      matchedSignals: ['failed-test wording', 'test command', 'test file path'],
      sourceFindingMessages: [
        'Failed test tests/unit/handoff.test.ts: expected PR body to include verification evidence',
      ],
      operatorGuidance:
        'This recovered critique failure looks like a concrete failed test. PM handoffs should consider creating or updating a skill only after the failure recurs or the regression exposes a reusable workflow gap; keep one-off product bugs in the issue/PR instead of promoting them as durable skill guidance.',
    });
  });

  it('does not flag generic reviewer findings as failed-test skill candidates', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message: 'PR summary omits the issue link',
            severity: 'warning',
            suggestion: 'Add the issue URL to the PR description.',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'generic-review-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.failedTestSkillCandidate).toBeUndefined();
  });

  it('does not flag generic review guidance that only suggests running tests', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message:
              'Expected PR body to include an issue link and verification evidence; got an empty description',
            severity: 'warning',
            suggestion:
              'Run npm run test before handoff and update the PR body.',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'generic-test-command-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.failedTestSkillCandidate).toBeUndefined();
  });

  it('flags reversed failed-test wording as a skill candidate signal', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message: 'Tests failed in CI after the latest handoff update',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'reversed-failed-test-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.failedTestSkillCandidate).toEqual(
      expect.objectContaining({
        matchedSignals: ['failed-test wording'],
        sourceFindingMessages: [
          'Tests failed in CI after the latest handoff update',
        ],
      }),
    );
  });

  it('detects copied multiline test-runner failure output', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message:
              'Review pasted runner output:\nvitest v2.1.0\n\nTests 1 failed | 7 passed',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'multiline-runner-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.failedTestSkillCandidate).toEqual(
      expect.objectContaining({
        matchedSignals: ['test runner output'],
        sourceFindingMessages: [
          'Review pasted runner output:\nvitest v2.1.0\n\nTests 1 failed | 7 passed',
        ],
      }),
    );
  });

  it('detects fail-prefixed runner output with assertion details', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message:
              'FAIL packages/foo.test.ts\nExpected PR body to include evidence\nReceived empty description',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'fail-prefixed-runner-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.failedTestSkillCandidate).toEqual(
      expect.objectContaining({
        matchedSignals: [
          'assertion expected-received',
          'fail-prefixed runner output',
          'test file path',
        ],
      }),
    );
  });

  it('does not combine weak primary assertion prose with strong suggestion-only failures', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message:
              'Expected PR body to include an issue link; received empty description',
            severity: 'warning',
            suggestion: 'Run the failed tests before handoff.',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'weak-primary-strong-suggestion-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.failedTestSkillCandidate).toBeUndefined();
  });

  it('marks reviewer-feedback lessons with missing suggestions for PM follow-up', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message:
              'Review identified a handoff gap without remediation guidance',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'missing-suggestion-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.reviewerFeedback).toEqual({
      summary: 'Review identified a handoff gap without remediation guidance',
      findings: [
        {
          sourceIteration: 0,
          evaluatorName: 'reviewer',
          message:
            'Review identified a handoff gap without remediation guidance',
          severity: 'critical',
        },
      ],
      suggestionsComplete: false,
      missingSuggestionGuidance:
        'Reviewer feedback did not include suggestions for every finding; PM handoffs should preserve the original message and ask a reviewer to attach remediation guidance before promotion.',
    });
  });

  it('attaches a deterministic per-agent improvement scorecard to recorded lessons when an agent id is configured', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port, {
      agentId: 'worker-alpha',
      now: (): string => '2026-07-12T00:00:00.000Z',
    });

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'quality-gate', [
          {
            message: 'PR handoff omitted verification evidence',
            severity: 'warning',
            suggestion: 'Add the targeted test command and result.',
          },
          {
            message: 'Reviewer blocker was left unresolved',
            severity: 'critical',
            suggestion: 'Resolve the review thread before merge.',
          },
        ]),
        createIteration(1, 'fail', 'quality-gate', [
          {
            message: 'Verification evidence is present but incomplete',
            severity: 'warning',
          },
        ]),
        createIteration(2, 'pass'),
      ],
    };

    await recorder.record(result, 'scorecard-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.agentImprovementScorecard).toEqual({
      schemaVersion: 'agent-improvement-scorecard-v1',
      agentId: 'worker-alpha',
      taskId: 'scorecard-task',
      evaluatorName: 'quality-gate',
      generatedAt: '2026-07-12T00:00:00.000Z',
      initialScore: 0.3,
      finalScore: 1,
      scoreDelta: 0.7,
      failingIterations: [0, 1],
      resolvedIteration: 2,
      findingCounts: {
        critical: 1,
        warning: 2,
        info: 0,
        total: 3,
      },
      improvementSignals: [
        'Recovered from 2 failing critique iterations before pass.',
        'Improved quality-gate score by 0.7.',
        'Resolved 1 critical blocker finding.',
      ],
      guidance:
        'Use this per-agent scorecard in worker retrospectives and PM handoff summaries to compare improvement over time without parsing free-form lesson prose.',
    });
  });

  it('uses the first failed evaluator score and recovered evaluator score in per-agent scorecards', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port, { agentId: 'worker-alpha' });

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIterationFromResult(0, {
          verdict: 'fail',
          overallScore: 0.2,
          shortCircuited: false,
          results: [
            {
              evaluatorName: 'quality-gate',
              verdict: 'fail',
              score: 0.1,
              findings: [{ message: 'missing verifier', severity: 'warning' }],
            },
            {
              evaluatorName: 'style-gate',
              verdict: 'pass',
              score: 0.9,
              findings: [],
            },
          ],
        }),
        createIterationFromResult(1, {
          verdict: 'fail',
          overallScore: 0.4,
          shortCircuited: false,
          results: [
            {
              evaluatorName: 'quality-gate',
              verdict: 'fail',
              score: 0.5,
              findings: [{ message: 'partial verifier', severity: 'warning' }],
            },
          ],
        }),
        createIterationFromResult(2, {
          verdict: 'pass',
          overallScore: 0.6,
          shortCircuited: false,
          results: [
            {
              evaluatorName: 'quality-gate',
              verdict: 'pass',
              score: 0.95,
              findings: [],
            },
            {
              evaluatorName: 'style-gate',
              verdict: 'warn',
              score: 0.25,
              findings: [{ message: 'style nit', severity: 'warning' }],
            },
          ],
        }),
      ],
    };

    await recorder.record(result, 'scorecard-task');

    const firstLesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(firstLesson.agentImprovementScorecard).toMatchObject({
      evaluatorName: 'quality-gate',
      initialScore: 0.1,
      finalScore: 0.95,
      scoreDelta: 0.85,
      failingIterations: [0, 1],
      resolvedIteration: 2,
      findingCounts: {
        critical: 0,
        warning: 2,
        info: 0,
        total: 2,
      },
    });
  });

  it('excludes evaluator infrastructure exceptions from per-agent scorecards', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port, { agentId: 'worker-alpha' });

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIterationFromResult(0, {
          verdict: 'fail',
          overallScore: 0.05,
          shortCircuited: false,
          results: [
            {
              evaluatorName: 'quality-gate',
              verdict: 'fail',
              score: 0.05,
              findings: [
                {
                  message: 'evaluator crashed',
                  severity: 'critical',
                  location: EVALUATOR_EXCEPTION_LOCATION,
                },
              ],
            },
          ],
        }),
        createIterationFromResult(1, {
          verdict: 'fail',
          overallScore: 0.4,
          shortCircuited: false,
          results: [
            {
              evaluatorName: 'quality-gate',
              verdict: 'fail',
              score: 0.4,
              findings: [{ message: 'missing verifier', severity: 'warning' }],
            },
          ],
        }),
        createIterationFromResult(2, {
          verdict: 'pass',
          overallScore: 1,
          shortCircuited: false,
          results: [
            {
              evaluatorName: 'quality-gate',
              verdict: 'pass',
              score: 1,
              findings: [],
            },
          ],
        }),
      ],
    };

    await recorder.record(result, 'scorecard-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(port.recordLesson).toHaveBeenCalledTimes(1);
    expect(lesson.agentImprovementScorecard).toMatchObject({
      initialScore: 0.4,
      finalScore: 1,
      scoreDelta: 0.6,
      failingIterations: [1],
      findingCounts: {
        critical: 0,
        warning: 1,
        info: 0,
        total: 1,
      },
    });
  });

  it('rejects blank per-agent scorecard ids so PM summaries do not group lessons under an ambiguous agent', () => {
    expect(
      () => new LessonRecorder(createMockMemoryPort(), { agentId: '  ' }),
    ).toThrow(
      'LessonRecorder agentId must be a non-empty string when provided.',
    );
  });

  it('returns an LLM-friendly learning backlog prioritization report for PM handoffs', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port, {
      agentId: 'worker-alpha',
      now: (): string => '2026-07-12T00:00:00.000Z',
    });

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'quality-gate', [
          {
            message: 'Codex blocker was left unresolved',
            severity: 'critical',
            suggestion: 'Resolve the current-head review thread before merge.',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const summary = await recorder.record(result, 'learning-backlog-task');

    expect(summary.learningBacklogPrioritizationReport).toEqual({
      schemaVersion: 'learning-backlog-prioritization-report-v1',
      generatedAt: '2026-07-12T00:00:00.000Z',
      guidance:
        'Use this report to sort newly observed learning backlog items before promotion, retirement, or PM routing; higher priority items should receive durable mitigation before low-risk documentation follow-up.',
      items: [
        {
          id: expect.stringMatching(
            /^lesson:learning-backlog-task:quality-gate:iteration-0$/,
          ),
          source: 'recorded-lesson',
          priority: 'high',
          score: 80,
          taskId: 'learning-backlog-task',
          evaluatorName: 'quality-gate',
          title: 'Codex blocker was left unresolved',
          rationale:
            'Recorded lesson contains critical findings and should be reviewed before routine learning cleanup.',
          feedbackSources: [
            { source: 'inferred-failure', weight: 35, scoreImpact: -35 },
            { source: 'inferred-success', weight: 25, scoreImpact: 25 },
          ],
          recommendedAction:
            'Route this lesson through promotion review with its traceability verifier before adding it to durable guidance.',
        },
      ],
    });
    expect(JSON.parse(JSON.stringify(summary))).toMatchObject({
      learningBacklogPrioritizationReport: {
        schemaVersion: 'learning-backlog-prioritization-report-v1',
        items: [
          expect.objectContaining({
            source: 'recorded-lesson',
            priority: 'high',
          }),
        ],
      },
    });
  });

  it('weights explicit human feedback higher than inferred lesson signals', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port, {
      now: (): Date => new Date('2026-07-12T00:00:00.000Z'),
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message: 'Lesson inferred too much from a green local test',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const summary = await recorder.record(result, 'feedback-weight-task');
    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as CritiqueLesson;

    expect(lesson.feedbackWeighting).toMatchObject({
      schemaVersion: 'lesson-feedback-weighting-v1',
      primarySource: 'inferred-failure',
      totalScore: -10,
      weights: [
        expect.objectContaining({
          source: 'inferred-failure',
          weight: 35,
          scoreImpact: -35,
        }),
        expect.objectContaining({
          source: 'inferred-success',
          weight: 25,
          scoreImpact: 25,
        }),
      ],
    });
    expect(summary.learningBacklogPrioritizationReport.items[0]).toMatchObject({
      score: 50,
      feedbackSources: [
        { source: 'inferred-failure', weight: 35, scoreImpact: -35 },
        { source: 'inferred-success', weight: 25, scoreImpact: 25 },
      ],
    });

    const corrected = applyHumanFeedbackToLesson(lesson, {
      source: 'explicit-user-correction',
      reason: 'User corrected the lesson after it caused a bad handoff.',
      observedAt: '2026-07-12T01:00:00.000Z',
      evidence: [
        {
          kind: 'operator-report',
          reference: 'https://github.com/djm204/frankenbeast/issues/1763',
        },
      ],
      revisedCorrectionApplied:
        'Require explicit human validation before promoting inferred learning signals.',
    });

    expect(corrected.lifecycleStatus).toBe('quarantined');
    expect(corrected.correctionApplied).toBe(
      'Require explicit human validation before promoting inferred learning signals.',
    );
    expect(corrected.contradictionReport).toBeUndefined();
    expect(corrected.testTraceability).toBeUndefined();
    expect(corrected.quarantine?.reviewItem.lessonId).toBe(
      lesson.testTraceability?.[0]?.lessonId,
    );
    expect(corrected.feedbackWeighting).toMatchObject({
      primarySource: 'explicit-user-correction',
      totalScore: -110,
      weights: [
        expect.objectContaining({
          source: 'explicit-user-correction',
          weight: 100,
          scoreImpact: -100,
        }),
        expect.objectContaining({ source: 'inferred-failure' }),
        expect.objectContaining({ source: 'inferred-success' }),
      ],
    });
    expect(isLessonApplicable(corrected)).toBe(false);

    expect(() =>
      applyHumanFeedbackToLesson(lesson, {
        source: 'explicit-user-approval',
        reason: 'Missing audit evidence must not promote a lesson.',
        observedAt: '2026-07-12T01:30:00.000Z',
        evidence: [],
      }),
    ).toThrow('Explicit lesson approval requires at least one evidence item.');
    expect(() =>
      applyHumanFeedbackToLesson(lesson, {
        source: 'explicit-user-approval',
        reason: 'Blank audit evidence must not promote a lesson.',
        observedAt: '2026-07-12T01:35:00.000Z',
        evidence: [{ kind: 'operator-report', reference: '   ' }],
      }),
    ).toThrow('Lesson quarantine evidence reference must be a non-empty string.');
    expect(() =>
      applyHumanFeedbackToLesson(lesson, {
        source: 'explicit-user-approval',
        reason: '   ',
        observedAt: '2026-07-12T01:36:00.000Z',
        evidence: [
          {
            kind: 'operator-report',
            reference: 'https://github.com/djm204/frankenbeast/issues/1763#blank-reason',
          },
        ],
      }),
    ).toThrow('Lesson feedback reason must be a non-empty string.');
    expect(() =>
      applyHumanFeedbackToLesson(lesson, {
        source: 'inferred-success' as never,
        reason: 'Runtime input must not promote inferred signals.',
        observedAt: '2026-07-12T01:37:00.000Z',
        evidence: [
          {
            kind: 'operator-report',
            reference: 'https://github.com/djm204/frankenbeast/issues/1763#inferred-runtime',
          },
        ],
      }),
    ).toThrow(
      'Lesson human feedback approval requires explicit-user-approval source.',
    );
    expect(() =>
      applyHumanFeedbackToLesson(lesson, {
        source: 'explicit-user-correction',
        reason: 'Blank revised guidance must not replace a lesson.',
        observedAt: '2026-07-12T01:40:00.000Z',
        evidence: [
          {
            kind: 'operator-report',
            reference: 'https://github.com/djm204/frankenbeast/issues/1763#blank',
          },
        ],
        revisedCorrectionApplied: '   ',
      }),
    ).toThrow('Lesson revised correctionApplied must be a non-empty string.');

    const directlyApproved = applyHumanFeedbackToLesson(lesson, {
      source: 'explicit-user-approval',
      reason: 'User approved this candidate lesson after reviewing evidence.',
      observedAt: '2026-07-12T01:42:00.000Z',
      evidence: [
        {
          kind: 'operator-report',
          reference: 'https://github.com/djm204/frankenbeast/issues/1763#direct',
        },
      ],
    });
    expect(directlyApproved.lifecycleStatus).toBe('active');
    expect(directlyApproved.experimentSandbox).toBeUndefined();
    expect(directlyApproved.feedbackWeighting?.weights[0]).toMatchObject({
      source: 'explicit-user-approval',
      evidence: [
        {
          kind: 'operator-report',
          reference: 'https://github.com/djm204/frankenbeast/issues/1763#direct',
        },
      ],
    });
    expect(isLessonApplicable(directlyApproved)).toBe(true);

    const approvedLegacySandboxed = applyHumanFeedbackToLesson(
      { ...lesson, lifecycleStatus: 'active' },
      {
        source: 'explicit-user-approval',
        reason: 'User approved legacy active sandboxed guidance.',
        observedAt: '2026-07-12T01:43:00.000Z',
        evidence: [
          {
            kind: 'operator-report',
            reference: 'https://github.com/djm204/frankenbeast/issues/1763#legacy-sandbox',
          },
        ],
      },
    );
    expect(approvedLegacySandboxed.lifecycleStatus).toBe('active');
    expect(approvedLegacySandboxed.experimentSandbox).toBeUndefined();
    expect(isLessonApplicable(approvedLegacySandboxed)).toBe(true);

    const approvedAfterCorrection = applyHumanFeedbackToLesson(corrected, {
      source: 'explicit-user-approval',
      reason: 'User approved the revised lesson after reviewing correction evidence.',
      observedAt: '2026-07-12T01:45:00.000Z',
      evidence: [
        {
          kind: 'operator-report',
          reference: 'https://github.com/djm204/frankenbeast/issues/1763',
        },
      ],
    });
    expect(approvedAfterCorrection.feedbackWeighting).toMatchObject({
      primarySource: 'explicit-user-approval',
      totalScore: -30,
    });
    expect(approvedAfterCorrection.quarantine).toBeUndefined();
    expect(approvedAfterCorrection.unquarantine).toMatchObject({
      reviewer: 'explicit-user-approval',
      evidenceUrl: 'https://github.com/djm204/frankenbeast/issues/1763',
    });
    expect(approvedAfterCorrection.lifecycleStatus).toBe('candidate');
    expect(isLessonApplicable(approvedAfterCorrection)).toBe(false);

    const quarantinedCandidate = quarantineLesson(lesson, {
      trigger: 'repeated-failure-threshold',
      reason: 'Repeated failures paused this candidate before explicit approval.',
      quarantinedAt: '2026-07-12T01:45:00.000Z',
      evidence: [
        {
          kind: 'failed-regression',
          reference: 'https://github.com/djm204/frankenbeast/issues/1763',
        },
      ],
    });
    const approved = applyHumanFeedbackToLesson(quarantinedCandidate, {
      source: 'explicit-user-approval',
      reason: 'User approved this lesson for reuse after reviewing the evidence.',
      observedAt: '2026-07-12T02:00:00.000Z',
      evidence: [
        {
          kind: 'operator-report',
          reference: 'https://github.com/djm204/frankenbeast/issues/1763',
        },
      ],
    });

    expect(approved.lifecycleStatus).toBe('candidate');
    expect(approved.experimentSandbox).toBeDefined();
    expect(approved.feedbackWeighting).toMatchObject({
      primarySource: 'explicit-user-approval',
      totalScore: 70,
    });
    expect(isLessonApplicable(approved)).toBe(false);

    const legacyActiveQuarantine = quarantineLesson(
      {
        ...lesson,
        lifecycleStatus: undefined,
        experimentSandbox: undefined,
      },
      {
        trigger: 'explicit-user-correction',
        reason: 'Legacy quarantine before lifecycle metadata existed.',
        quarantinedAt: '2026-07-12T02:30:00.000Z',
        evidence: [
          {
            kind: 'operator-report',
            reference: 'https://github.com/djm204/frankenbeast/issues/1763',
          },
        ],
      },
    );
    const approvedLegacy = applyHumanFeedbackToLesson(legacyActiveQuarantine, {
      source: 'explicit-user-approval',
      reason: 'User approved this legacy active lesson after evidence review.',
      observedAt: '2026-07-12T03:00:00.000Z',
      evidence: [
        {
          kind: 'operator-report',
          reference: 'https://github.com/djm204/frankenbeast/issues/1763#legacy',
        },
      ],
    });
    expect(approvedLegacy.lifecycleStatus).toBe('active');
    expect(approvedLegacy.unquarantine?.evidenceUrl).toBe(
      'https://github.com/djm204/frankenbeast/issues/1763#legacy',
    );
    expect(isLessonApplicable(approvedLegacy)).toBe(true);

    const legacySandboxedActiveQuarantine = quarantineLesson(
      {
        ...lesson,
        lifecycleStatus: 'active',
        experimentSandbox: {
          state: 'experimental',
          promotionBlocked: true,
          requiredChecks: [],
          promotionCriteria:
            'Require independent verification before allowing lesson reuse.',
        },
      },
      {
        trigger: 'explicit-user-correction',
        reason: 'Legacy active sandboxed lesson was quarantined for review.',
        quarantinedAt: '2026-07-12T02:45:00.000Z',
        evidence: [
          {
            kind: 'operator-report',
            reference: 'https://github.com/djm204/frankenbeast/issues/1763#legacy-sandboxed-quarantine',
          },
        ],
      },
    );
    const approvedLegacySandboxedQuarantine = applyHumanFeedbackToLesson(
      legacySandboxedActiveQuarantine,
      {
        source: 'explicit-user-approval',
        reason: 'User approved restoring this legacy active sandboxed lesson.',
        observedAt: '2026-07-12T03:10:00.000Z',
        evidence: [
          {
            kind: 'operator-report',
            reference: 'https://github.com/djm204/frankenbeast/issues/1763#legacy-sandboxed-approval',
          },
        ],
      },
    );
    expect(approvedLegacySandboxedQuarantine.lifecycleStatus).toBe('active');
    expect(approvedLegacySandboxedQuarantine.quarantine).toBeUndefined();
    expect(approvedLegacySandboxedQuarantine.experimentSandbox).toBeUndefined();
    expect(isLessonApplicable(approvedLegacySandboxedQuarantine)).toBe(true);

    const approvedRetired = applyHumanFeedbackToLesson(
      { ...lesson, lifecycleStatus: 'retired', experimentSandbox: undefined },
      {
        source: 'explicit-user-approval',
        reason: 'User acknowledged retired guidance for audit history only.',
        observedAt: '2026-07-12T03:30:00.000Z',
        evidence: [
          {
            kind: 'operator-report',
            reference: 'https://github.com/djm204/frankenbeast/issues/1763#retired',
          },
        ],
      },
    );
    expect(approvedRetired.lifecycleStatus).toBe('retired');
    expect(isLessonApplicable(approvedRetired)).toBe(false);
  });

  it('prioritizes suppressed duplicate learning items as low-risk reuse follow-up', async () => {
    const port = createMockMemoryPort();
    let now = new Date('2026-07-12T10:00:00.000Z');
    const recorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => now,
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message: 'Repeated PM handoff lesson caused churn',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'first-task');
    now = new Date('2026-07-12T10:00:30.000Z');
    const suppressed = await recorder.record(result, 'second-task');

    expect(suppressed.learningBacklogPrioritizationReport.items).toEqual([
      expect.objectContaining({
        source: 'cooldown-suppression',
        priority: 'low',
        score: 20,
        taskId: 'second-task',
        evaluatorName: 'learning-reviewer',
        recommendedAction:
          'Reuse the existing in-cooldown lesson until suppression expires; do not create a duplicate backlog item.',
      }),
    ]);
  });

  it('attaches an LLM-friendly post-PR lesson extraction template to recorded lessons', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message: 'PR omitted the regression evidence from the handoff',
            severity: 'warning',
            suggestion:
              'Add the exact verifier command and result before requesting promotion.',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'post-pr-template-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.postPrLessonExtractionTemplate).toEqual({
      templateId: 'post-pr-lesson-extraction-v1',
      trigger: 'after-pr-review-or-merge',
      instructions: [
        'Inspect the linked issue, PR description, final diff, reviewer feedback, and verification evidence before extracting a durable lesson.',
        'Extract only lessons that are reusable for future workers; do not restate one-off implementation details as policy.',
        'If required evidence is missing, set followUpNeeded to true and use insufficientEvidenceGuidance instead of inventing a lesson.',
      ],
      requiredEvidence: [
        'Linked issue or task identifier',
        'PR URL or merge/review artifact',
        'Reviewer finding or failure mode that motivated the correction',
        'Correction applied in the final PR head',
        'Regression test, verifier, or explicit reason no code-level regression applies',
      ],
      outputSchema: {
        issueNumber: 'number-or-null',
        prUrl: 'string-or-null',
        sourceFinding: 'string',
        correctionApplied: 'string',
        reusableLesson: 'string',
        regressionEvidence: 'string',
        followUpNeeded: 'boolean',
      },
      insufficientEvidenceGuidance:
        'Do not promote a post-PR lesson until the issue/PR, source finding, correction, and verification evidence are all available.',
    });
  });

  it('does not attach a post-PR extraction template when no actionable lesson is recorded', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message: 'internal evaluator error occurred',
            severity: 'critical',
            location: EVALUATOR_EXCEPTION_LOCATION,
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'post-pr-template-task');

    expect(port.recordLesson).not.toHaveBeenCalled();
  });

  it('sandboxes new lessons as experimental and blocks promotion until verified', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'factuality', [
          {
            message: 'handoff cited an unverified file path',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'sandbox-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.experimentSandbox).toEqual({
      state: 'experimental',
      promotionBlocked: true,
      reason:
        'New critique lessons are experimental until their traceability map and regression evidence are independently verified.',
      exitCriteria: [
        'Confirm at least one lesson-to-test traceability entry is present.',
        'Check the contradiction report and resolve any conflicting prior lesson before promotion.',
        'Run the listed verification command and attach the evidence to the PM handoff.',
        'Promote or retire the lesson only after review confirms the regression covers the source finding.',
      ],
      verificationCommand:
        'npm run test --workspace @franken/critique -- --run tests/unit/memory/lesson-recorder.test.ts',
    });
  });

  it('attaches a deterministic lesson rollback workflow to recorded lessons', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message: 'lesson overgeneralized a one-off reviewer preference',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'rollback-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.rollbackWorkflow).toEqual({
      workflowId: 'lesson-rollback-v1',
      eligibleStates: ['experimental', 'promoted'],
      steps: [
        'Quarantine the target lesson so PM/liveness tooling stops promoting it into new handoffs.',
        'Attach the rollback reason, evidence URLs, and verifier command to the lesson audit trail.',
        'Either record a replacement lesson with fresh traceability evidence or mark the original lesson retired with no replacement.',
        'Run the verifier command and include the result in the PM handoff before removing the rollback block.',
      ],
      requiredEvidence: [
        'Stable lesson identifier or traceability entry',
        'Reason the lesson is incorrect, stale, over-broad, or harmful',
        'Review comment, failed regression, operator report, or incident link proving rollback is warranted',
        'Verification command for the replacement lesson or retired state',
      ],
      requestSchema: {
        lessonId: 'string',
        rollbackReason: 'string',
        evidenceUrls: 'string[]',
        replacementLesson: 'string-or-null',
        verificationCommand: 'string',
      },
      insufficientEvidenceGuidance:
        'Do not roll back a lesson unless the rollback request names the lesson, explains the bad/stale guidance, links review or regression evidence, and includes a verification command for the replacement or retirement decision.',
    });
  });

  it('records new critique lessons with candidate lifecycle status', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message: 'fresh lesson needs review before active injection',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'lifecycle-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.lifecycleStatus).toBe('candidate');
    expect(isLessonApplicable(lesson)).toBe(false);
    expect(
      isLessonApplicable({
        evaluatorName: 'legacy-reviewer',
        failureDescription: 'legacy lesson without lifecycle metadata',
        correctionApplied: 'legacy correction',
        taskId: 'legacy-task',
        timestamp: '2026-07-12T08:00:00.000Z',
      }),
    ).toBe(true);
    expect(
      isLessonApplicable({
        evaluatorName: 'legacy-reviewer',
        failureDescription: 'legacy sandboxed lesson',
        correctionApplied: 'legacy correction',
        taskId: 'legacy-sandbox-task',
        timestamp: '2026-07-12T08:00:00.000Z',
        experimentSandbox: {
          state: 'experimental',
          promotionBlocked: true,
          requiredChecks: [],
          promotionCriteria:
            'Require independent verification before allowing lesson reuse.',
        },
      }),
    ).toBe(false);
  });

  it('quarantines active lessons on explicit user correction and prevents future application', () => {
    const activeLesson = {
      evaluatorName: 'learning-reviewer',
      failureDescription: 'prefer short-circuiting verifier output',
      correctionApplied: 'Corrected in iteration 1',
      taskId: 'task-with-bad-lesson',
      timestamp: '2026-07-12T10:00:00.000Z',
      lifecycleStatus: 'active' as const,
    };

    const quarantined = quarantineLesson(activeLesson, {
      trigger: 'explicit-user-correction',
      reason:
        'User corrected this as unsafe because verifier output was skipped.',
      evidence: [
        {
          kind: 'operator-report',
          reference: 'https://github.com/djm204/frankenbeast/issues/1729',
        },
      ],
      quarantinedAt: '2026-07-12T10:05:00.000Z',
    });

    expect(quarantined.lifecycleStatus).toBe('quarantined');
    expect(quarantined.quarantine).toMatchObject({
      trigger: 'explicit-user-correction',
      reason:
        'User corrected this as unsafe because verifier output was skipped.',
      quarantinedAt: '2026-07-12T10:05:00.000Z',
      evidence: [
        {
          kind: 'operator-report',
          reference: 'https://github.com/djm204/frankenbeast/issues/1729',
        },
      ],
      reviewItem: expect.objectContaining({
        status: 'open',
        recommendedAction:
          'Review rollback evidence, decide whether to retire or supersede the lesson, and keep it out of prompt injection until explicitly unquarantined.',
      }),
    });
    expect(isLessonApplicable(quarantined)).toBe(false);
  });

  it('quarantines active lessons after repeated failure signals cross the configured threshold', () => {
    const activeLesson = {
      evaluatorName: 'learning-reviewer',
      failureDescription: 'always skip Codex gate after local tests pass',
      correctionApplied: 'Corrected in iteration 1',
      taskId: 'original-task',
      timestamp: '2026-07-12T10:00:00.000Z',
      lifecycleStatus: 'active' as const,
    };

    const belowThreshold = quarantineLessonForRepeatedFailures(activeLesson, {
      threshold: 3,
      observedAt: '2026-07-12T11:00:00.000Z',
      failures: [
        {
          taskId: 'task-a',
          reason: 'Codex finding proved the lesson harmful.',
          evidenceUrl: 'https://github.com/djm204/frankenbeast/pull/1',
        },
        {
          taskId: 'task-b',
          reason: 'Repeated merge gate failure.',
          evidenceUrl: 'https://github.com/djm204/frankenbeast/pull/2',
        },
      ],
    });

    expect(belowThreshold).toBe(activeLesson);

    const quarantined = quarantineLessonForRepeatedFailures(activeLesson, {
      threshold: 2,
      observedAt: '2026-07-12T11:00:00.000Z',
      failures: [
        {
          taskId: 'task-a',
          reason: 'Codex finding proved the lesson harmful.',
          evidenceUrl: 'https://github.com/djm204/frankenbeast/pull/1',
        },
        {
          taskId: 'task-b',
          reason: 'Repeated merge gate failure.',
          evidenceUrl: 'https://github.com/djm204/frankenbeast/pull/2',
        },
      ],
    });

    expect(quarantined.lifecycleStatus).toBe('quarantined');
    expect(quarantined.quarantine).toMatchObject({
      trigger: 'repeated-failure-threshold',
      threshold: 2,
      evidence: [
        {
          kind: 'failed-regression',
          reference: 'https://github.com/djm204/frankenbeast/pull/1',
        },
        {
          kind: 'failed-regression',
          reference: 'https://github.com/djm204/frankenbeast/pull/2',
        },
      ],
    });
    expect(isLessonApplicable(quarantined)).toBe(false);
  });

  it('preserves lifecycle and quarantine audit trail across repeated quarantine and unquarantine', () => {
    const candidateLesson = {
      evaluatorName: 'learning-reviewer',
      failureDescription: 'candidate guidance may be stale',
      correctionApplied: 'Corrected in iteration 1',
      taskId: 'candidate-quarantine-task',
      timestamp: '2026-07-12T10:00:00.000Z',
      lifecycleStatus: 'candidate' as const,
    };

    const firstQuarantine = quarantineLesson(candidateLesson, {
      trigger: 'explicit-user-correction',
      reason: 'User reported this candidate as harmful.',
      evidence: [
        { kind: 'operator-report', reference: 'discord://first-report' },
      ],
      quarantinedAt: '2026-07-12T10:05:00.000Z',
    });
    const repeatedQuarantine = quarantineLesson(firstQuarantine, {
      trigger: 'repeated-failure-threshold',
      reason: 'Regression repeated after initial correction.',
      evidence: [
        {
          kind: 'failed-regression',
          reference: 'https://github.com/djm204/frankenbeast/pull/4',
        },
      ],
      quarantinedAt: '2026-07-12T11:00:00.000Z',
      threshold: 2,
    });

    expect(repeatedQuarantine.quarantine?.previousLifecycleStatus).toBe(
      'candidate',
    );
    expect(repeatedQuarantine.quarantine?.threshold).toBe(2);
    expect(repeatedQuarantine.quarantine?.evidence).toEqual([
      { kind: 'operator-report', reference: 'discord://first-report' },
      {
        kind: 'failed-regression',
        reference: 'https://github.com/djm204/frankenbeast/pull/4',
      },
    ]);

    const unquarantined = unquarantineLesson(repeatedQuarantine, {
      reviewedAt: '2026-07-12T12:00:00.000Z',
      reviewer: 'pm-reviewer',
      evidenceUrl: 'https://github.com/djm204/frankenbeast/pull/5',
      reason: 'Review complete but candidate still requires promotion.',
    });

    expect(unquarantined.lifecycleStatus).toBe('candidate');
    expect(isLessonApplicable(unquarantined)).toBe(false);
  });

  it('allows manual unquarantine only with review evidence and restores active application', () => {
    expect(() =>
      unquarantineLesson(
        {
          evaluatorName: 'learning-reviewer',
          failureDescription: 'fresh candidate should not be activated',
          correctionApplied: 'Corrected in iteration 1',
          taskId: 'candidate-task',
          timestamp: '2026-07-12T09:00:00.000Z',
          lifecycleStatus: 'candidate' as const,
        },
        {
          reviewedAt: '2026-07-12T12:00:00.000Z',
          reviewer: 'pm-reviewer',
          evidenceUrl: 'https://github.com/djm204/frankenbeast/pull/3',
          reason: 'Candidate cannot skip quarantine review.',
        },
      ),
    ).toThrow('Only quarantined lessons can be unquarantined.');

    const quarantined = quarantineLesson(
      {
        evaluatorName: 'learning-reviewer',
        failureDescription: 'require stale workaround',
        correctionApplied: 'Corrected in iteration 1',
        taskId: 'rollback-task',
        timestamp: '2026-07-12T10:00:00.000Z',
        lifecycleStatus: 'active' as const,
      },
      {
        trigger: 'explicit-user-correction',
        reason: 'User reported stale workaround.',
        evidence: [
          { kind: 'operator-report', reference: 'discord://operator-report' },
        ],
        quarantinedAt: '2026-07-12T10:05:00.000Z',
      },
    );

    const unquarantined = unquarantineLesson(quarantined, {
      reviewedAt: '2026-07-12T12:00:00.000Z',
      reviewer: 'pm-reviewer',
      evidenceUrl: 'https://github.com/djm204/frankenbeast/pull/3',
      reason: 'Replacement guidance has regression coverage.',
    });

    expect(unquarantined.lifecycleStatus).toBe('active');
    expect(unquarantined.quarantine).toBeUndefined();
    expect(unquarantined.unquarantine).toEqual({
      reviewedAt: '2026-07-12T12:00:00.000Z',
      reviewer: 'pm-reviewer',
      evidenceUrl: 'https://github.com/djm204/frankenbeast/pull/3',
      reason: 'Replacement guidance has regression coverage.',
    });
    expect(isLessonApplicable(unquarantined)).toBe(true);
  });

  it('does not attach rollback workflow guidance when no actionable lesson is recorded', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message:
              'rollback guidance should not attach to evaluator exceptions',
            severity: 'critical',
            location: EVALUATOR_EXCEPTION_LOCATION,
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'rollback-exception-task');

    expect(port.recordLesson).not.toHaveBeenCalled();
  });

  it('attaches learning cooldown metadata to recorded lessons for PM/liveness tooling', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
    });

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message: 'Lesson was promoted without verification evidence',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const summary = await recorder.record(result, 'cooldown-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(summary).toMatchObject({
      recorded: 1,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
    expect(lesson.cooldown).toEqual({
      key: expect.stringMatching(/^critique-lesson:learning-reviewer:/),
      windowMs: 60_000,
      recordedAt: '2026-07-12T10:00:00.000Z',
      suppressUntil: '2026-07-12T10:01:00.000Z',
      guidance:
        'Equivalent critique lessons are suppressed during this cooldown window so PM/liveness tooling does not churn on repeated feedback before promotion or retirement review.',
    });
    expect(lesson.timestamp).toBe('2026-07-12T10:00:00.000Z');
  });

  it('suppresses equivalent lessons inside the cooldown window and returns structured evidence', async () => {
    const port = createMockMemoryPort();
    let now = new Date('2026-07-12T10:00:00.000Z');
    const recorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => now,
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message: 'Repeated PM handoff lesson caused churn',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'first-task');
    now = new Date('2026-07-12T10:00:30.000Z');
    const suppressed = await recorder.record(result, 'second-task');

    expect(port.recordLesson).toHaveBeenCalledTimes(1);
    expect(suppressed.recorded).toBe(0);
    expect(suppressed.suppressedByCooldown).toEqual([
      {
        key: expect.stringMatching(/^critique-lesson:learning-reviewer:/),
        taskId: 'second-task',
        evaluatorName: 'learning-reviewer',
        suppressedAt: '2026-07-12T10:00:30.000Z',
        suppressUntil: '2026-07-12T10:01:00.000Z',
        remainingMs: 30_000,
        reason:
          'Equivalent critique lesson is still inside the learning cooldown window; reuse the existing lesson metadata instead of recording another copy.',
      },
    ]);
  });

  it('records equivalent lessons again after the cooldown expires', async () => {
    const port = createMockMemoryPort();
    let now = new Date('2026-07-12T10:00:00.000Z');
    const recorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => now,
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message: 'Cooldown edge should expire deterministically',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'first-task');
    now = new Date('2026-07-12T10:01:00.001Z');
    const admitted = await recorder.record(result, 'second-task');

    expect(port.recordLesson).toHaveBeenCalledTimes(2);
    expect(admitted).toMatchObject({
      recorded: 1,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
  });

  it('honors shared cooldown state across recorder instances', async () => {
    const port = createMockMemoryPort();
    const cooldownStore = new Map<string, number>();
    const firstRecorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
      cooldownStore,
    });
    const secondRecorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => new Date('2026-07-12T10:00:30.000Z'),
      cooldownStore,
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message: 'Reviewer rebuild should keep cooldown state',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await firstRecorder.record(result, 'first-task');
    const suppressed = await secondRecorder.record(result, 'second-task');

    expect(port.recordLesson).toHaveBeenCalledTimes(1);
    expect(suppressed).toMatchObject({
      recorded: 0,
      suppressedByCooldown: [
        expect.objectContaining({
          taskId: 'second-task',
          remainingMs: 30_000,
        }),
      ],
      minedBlockerPatterns: [],
    });
  });

  it('shares pending admissions when recorder instances reuse a cooldown store', async () => {
    const port = createMockMemoryPort();
    const cooldownStore = new Map<string, number>();
    let releasePersistence!: () => void;
    const persistenceStarted = new Promise<void>((resolve) => {
      (port.recordLesson as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () =>
          new Promise<void>((release) => {
            releasePersistence = release;
            resolve();
          }),
      );
    });
    const firstRecorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
      cooldownStore,
    });
    const secondRecorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
      cooldownStore,
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message:
              'Concurrent shared reviewer rebuild should suppress duplicates',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const firstRecord = firstRecorder.record(result, 'first-task');
    await persistenceStarted;
    const secondRecord = secondRecorder.record(result, 'second-task');
    releasePersistence();
    const [firstSummary, secondSummary] = await Promise.all([
      firstRecord,
      secondRecord,
    ]);

    expect(port.recordLesson).toHaveBeenCalledTimes(1);
    expect(firstSummary).toMatchObject({
      recorded: 1,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
    expect(secondSummary).toMatchObject({
      recorded: 0,
      suppressedByCooldown: [
        expect.objectContaining({ taskId: 'second-task' }),
      ],
      minedBlockerPatterns: [],
    });
  });

  it('honors cooldownMs 0 even when a cooldown store is reused', async () => {
    const port = createMockMemoryPort();
    const cooldownStore = new Map<string, number>();
    const enabledRecorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
      cooldownStore,
    });
    const disabledRecorder = new LessonRecorder(port, {
      cooldownMs: 0,
      now: (): Date => new Date('2026-07-12T10:00:30.000Z'),
      cooldownStore,
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message: 'Disabled cooldown should not reuse shared suppression',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await enabledRecorder.record(result, 'first-task');
    const disabledSummary = await disabledRecorder.record(
      result,
      'second-task',
    );

    expect(port.recordLesson).toHaveBeenCalledTimes(2);
    expect(disabledSummary).toMatchObject({
      recorded: 1,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
  });

  it('aligns local suppression with the recorded cooldown metadata', async () => {
    const port = createMockMemoryPort();
    let now = new Date('2026-07-12T10:00:00.000Z');
    let releasePersistence!: () => void;
    const persistenceStarted = new Promise<void>((resolve) => {
      (port.recordLesson as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () =>
          new Promise<void>((release) => {
            releasePersistence = release;
            resolve();
          }),
      );
    });
    const recorder = new LessonRecorder(port, {
      cooldownMs: 1_000,
      now: (): Date => now,
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message:
              'Slow memory writes should keep recorded and live cooldowns aligned',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const firstRecord = recorder.record(result, 'first-task');
    await persistenceStarted;
    now = new Date('2026-07-12T10:00:02.000Z');
    releasePersistence();
    await firstRecord;
    const secondSummary = await recorder.record(result, 'second-task');
    const firstLesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as {
      cooldown: { recordedAt: string; suppressUntil: string };
    };

    expect(firstLesson.cooldown.recordedAt).toBe('2026-07-12T10:00:00.000Z');
    expect(firstLesson.cooldown.suppressUntil).toBe('2026-07-12T10:00:01.000Z');
    expect(port.recordLesson).toHaveBeenCalledTimes(2);
    expect(secondSummary).toMatchObject({
      recorded: 1,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
  });

  it('reserves cooldown admission before async persistence completes', async () => {
    const port = createMockMemoryPort();
    let releasePersistence!: () => void;
    const persistenceStarted = new Promise<void>((resolve) => {
      (port.recordLesson as ReturnType<typeof vi.fn>).mockImplementation(
        () =>
          new Promise<void>((release) => {
            releasePersistence = release;
            resolve();
          }),
      );
    });
    const recorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message: 'Concurrent review should not double-record',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const firstRecord = recorder.record(result, 'first-task');
    await persistenceStarted;
    const secondRecord = recorder.record(result, 'second-task');
    releasePersistence();
    const [firstSummary, secondSummary] = await Promise.all([
      firstRecord,
      secondRecord,
    ]);

    expect(port.recordLesson).toHaveBeenCalledTimes(1);
    expect(firstSummary).toMatchObject({
      recorded: 1,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
    expect(secondSummary).toMatchObject({
      recorded: 0,
      suppressedByCooldown: [
        expect.objectContaining({
          taskId: 'second-task',
          evaluatorName: 'learning-reviewer',
          remainingMs: 60_000,
        }),
      ],
      minedBlockerPatterns: [],
    });
  });

  it('does not suppress a concurrent duplicate when the admitting persistence fails', async () => {
    const port = createMockMemoryPort();
    let rejectFirstPersistence!: (error: Error) => void;
    const firstPersistenceStarted = new Promise<void>((resolve) => {
      (port.recordLesson as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(
          () =>
            new Promise<void>((_release, reject) => {
              rejectFirstPersistence = reject;
              resolve();
            }),
        )
        .mockResolvedValue(undefined);
    });
    const recorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          {
            message: 'Retry should persist if first store write fails',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const firstRecord = recorder.record(result, 'first-task');
    await firstPersistenceStarted;
    const secondRecord = recorder.record(result, 'second-task');
    const thirdRecord = recorder.record(result, 'third-task');
    rejectFirstPersistence(new Error('transient store failure'));
    const [firstSummary, secondSummary, thirdSummary] = await Promise.all([
      firstRecord,
      secondRecord,
      thirdRecord,
    ]);

    expect(port.recordLesson).toHaveBeenCalledTimes(2);
    expect(firstSummary).toMatchObject({
      recorded: 0,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
    expect(secondSummary).toMatchObject({
      recorded: 1,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
    expect(thirdSummary).toMatchObject({
      recorded: 0,
      suppressedByCooldown: [
        expect.objectContaining({
          taskId: 'third-task',
          evaluatorName: 'learning-reviewer',
        }),
      ],
      minedBlockerPatterns: [],
    });
  });

  it('keeps multiline finding boundaries distinct in cooldown keys', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
    });
    const multilineFinding: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          { message: 'a\nb', severity: 'warning' },
        ]),
        createIteration(1, 'pass'),
      ],
    };
    const separateFindings: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'learning-reviewer', [
          { message: 'a', severity: 'warning' },
          { message: 'b', severity: 'warning' },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(multilineFinding, 'first-task');
    const secondSummary = await recorder.record(
      separateFindings,
      'second-task',
    );

    expect(port.recordLesson).toHaveBeenCalledTimes(2);
    expect(secondSummary).toMatchObject({
      recorded: 1,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
  });

  it('keeps evaluator names distinct even when their display slugs collide', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
    });
    const policySpace: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'policy A', [
          { message: 'same finding', severity: 'warning' },
        ]),
        createIteration(1, 'pass'),
      ],
    };
    const policyDash: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'policy-A', [
          { message: 'same finding', severity: 'warning' },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(policySpace, 'first-task');
    const secondSummary = await recorder.record(policyDash, 'second-task');

    expect(port.recordLesson).toHaveBeenCalledTimes(2);
    expect(secondSummary).toMatchObject({
      recorded: 1,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
  });

  it('mines cross-task blocker patterns after equivalent critical findings recur across distinct tasks', async () => {
    const port = createMockMemoryPort();
    let now = new Date('2026-07-12T10:00:00.000Z');
    const recorder = new LessonRecorder(port, {
      cooldownMs: 0,
      blockerPatternThreshold: 2,
      now: (): Date => now,
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'codex-review', [
          {
            message:
              'Codex usage-limit blocker stopped the current-head review gate',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const firstSummary = await recorder.record(result, 'task-a');
    now = new Date('2026-07-12T10:05:00.000Z');
    const secondSummary = await recorder.record(result, 'task-b');
    const secondLesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[1]![0];

    expect(firstSummary.minedBlockerPatterns).toEqual([]);
    expect(secondSummary.minedBlockerPatterns).toEqual([
      {
        key: expect.stringMatching(/^blocker-pattern:codex-review:/),
        evaluatorName: 'codex-review',
        normalizedFinding:
          'codex usage-limit blocker stopped the current-head review gate',
        threshold: 2,
        occurrences: 2,
        taskIds: ['task-a', 'task-b'],
        firstSeenAt: '2026-07-12T10:00:00.000Z',
        lastSeenAt: '2026-07-12T10:05:00.000Z',
        guidance:
          'Equivalent blocker findings have recurred across distinct tasks; PM/liveness handoffs should treat this as a cross-task pattern and route a durable mitigation instead of rediscovering it per task.',
      },
    ]);
    expect(secondLesson.blockerPatterns).toEqual(
      secondSummary.minedBlockerPatterns,
    );
  });

  it('persists a mined blocker pattern even when the equivalent lesson is inside cooldown', async () => {
    const port = createMockMemoryPort();
    let now = new Date('2026-07-12T10:00:00.000Z');
    const recorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      blockerPatternThreshold: 2,
      now: (): Date => now,
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'codex-review', [
          {
            message:
              'Same current-head Codex review blocker should be routed durably',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'task-a');
    now = new Date('2026-07-12T10:00:30.000Z');
    const secondSummary = await recorder.record(result, 'task-b');
    const secondLesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[1]![0];

    expect(port.recordLesson).toHaveBeenCalledTimes(2);
    expect(secondSummary.recorded).toBe(1);
    expect(secondSummary.suppressedByCooldown).toEqual([]);
    expect(secondSummary.minedBlockerPatterns).toHaveLength(1);
    expect(secondLesson.blockerPatterns).toEqual(
      secondSummary.minedBlockerPatterns,
    );
  });

  it('counts suppressed repeats and only bypasses cooldown on threshold crossing', async () => {
    const port = createMockMemoryPort();
    let now = new Date('2026-07-12T10:00:00.000Z');
    const recorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      blockerPatternThreshold: 3,
      now: (): Date => now,
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'codex-review', [
          {
            message:
              'Suppressed repeat should still count toward blocker threshold',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'task-a');
    now = new Date('2026-07-12T10:00:10.000Z');
    const secondSummary = await recorder.record(result, 'task-b');
    now = new Date('2026-07-12T10:00:20.000Z');
    const thirdSummary = await recorder.record(result, 'task-c');
    const thirdLesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[1]![0];

    expect(secondSummary).toMatchObject({
      recorded: 0,
      suppressedByCooldown: [expect.objectContaining({ taskId: 'task-b' })],
      minedBlockerPatterns: [],
    });
    expect(thirdSummary.recorded).toBe(1);
    expect(thirdSummary.suppressedByCooldown).toEqual([]);
    expect(thirdSummary.minedBlockerPatterns).toEqual([
      expect.objectContaining({
        occurrences: 3,
        taskIds: ['task-a', 'task-b', 'task-c'],
      }),
    ]);
    expect(thirdLesson.blockerPatterns).toEqual(
      thirdSummary.minedBlockerPatterns,
    );
  });

  it('serializes blocker mining by pattern key before committing observations', async () => {
    const port = createMockMemoryPort();
    const releaseRecordLesson: (() => void)[] = [];
    (port.recordLesson as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseRecordLesson.push(resolve);
        }),
    );
    const recorder = new LessonRecorder(port, {
      cooldownMs: 0,
      blockerPatternThreshold: 2,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'codex-review', [
          {
            message:
              'Concurrent blockers must not cross threshold without reporting',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const firstRecord = recorder.record(result, 'task-a');
    await Promise.resolve();
    expect(port.recordLesson).toHaveBeenCalledTimes(1);

    const secondRecord = recorder.record(result, 'task-b');
    await Promise.resolve();
    expect(port.recordLesson).toHaveBeenCalledTimes(1);

    releaseRecordLesson[0]!();
    const firstSummary = await firstRecord;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(firstSummary.minedBlockerPatterns).toEqual([]);
    expect(port.recordLesson).toHaveBeenCalledTimes(2);
    const secondLesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[1]![0];

    releaseRecordLesson[1]!();
    const secondSummary = await secondRecord;

    expect(secondSummary.minedBlockerPatterns).toEqual([
      expect.objectContaining({
        occurrences: 2,
        taskIds: ['task-a', 'task-b'],
      }),
    ]);
    expect(secondLesson.blockerPatterns).toEqual(
      secondSummary.minedBlockerPatterns,
    );
  });

  it('serializes blocker mining across recorders that share a blocker store', async () => {
    const firstPort = createMockMemoryPort();
    const secondPort = createMockMemoryPort();
    const sharedBlockerStore = new Map();
    const releaseFirstRecordLesson: (() => void)[] = [];
    (firstPort.recordLesson as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseFirstRecordLesson.push(resolve);
        }),
    );
    const firstRecorder = new LessonRecorder(firstPort, {
      cooldownMs: 0,
      blockerPatternThreshold: 2,
      blockerPatternStore: sharedBlockerStore,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
    });
    const secondRecorder = new LessonRecorder(secondPort, {
      cooldownMs: 0,
      blockerPatternThreshold: 2,
      blockerPatternStore: sharedBlockerStore,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'codex-review', [
          {
            message: 'Shared recorder stores must not miss threshold crossing',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const firstRecord = firstRecorder.record(result, 'task-a');
    await Promise.resolve();
    expect(firstPort.recordLesson).toHaveBeenCalledTimes(1);

    const secondRecord = secondRecorder.record(result, 'task-b');
    await Promise.resolve();
    expect(secondPort.recordLesson).not.toHaveBeenCalled();

    releaseFirstRecordLesson[0]!();
    await firstRecord;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(secondPort.recordLesson).toHaveBeenCalledTimes(1);
    const secondSummary = await secondRecord;

    expect(secondSummary.minedBlockerPatterns).toEqual([
      expect.objectContaining({
        occurrences: 2,
        taskIds: ['task-a', 'task-b'],
      }),
    ]);
  });

  it('deduplicates repeated critical blocker findings within one lesson', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port, {
      cooldownMs: 0,
      blockerPatternThreshold: 2,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
    });
    const firstResult: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'codex-review', [
          {
            message: 'Duplicate critical blocker should be mined once',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };
    const duplicateResult: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'codex-review', [
          {
            message: 'Duplicate critical blocker should be mined once',
            severity: 'critical',
          },
          {
            message: 'Duplicate critical blocker should be mined once',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(firstResult, 'task-a');
    const secondSummary = await recorder.record(duplicateResult, 'task-b');

    expect(secondSummary.minedBlockerPatterns).toHaveLength(1);
    expect(secondSummary.minedBlockerPatterns[0]!.taskIds).toEqual([
      'task-a',
      'task-b',
    ]);
  });

  it('keeps already-mined blocker repeats subject to cooldown', async () => {
    const port = createMockMemoryPort();
    let now = new Date('2026-07-12T10:00:00.000Z');
    const recorder = new LessonRecorder(port, {
      cooldownMs: 60_000,
      blockerPatternThreshold: 2,
      now: (): Date => now,
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'codex-review', [
          {
            message:
              'Already-routed blocker pattern should not bypass cooldown forever',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'task-a');
    now = new Date('2026-07-12T10:00:10.000Z');
    const secondSummary = await recorder.record(result, 'task-b');
    now = new Date('2026-07-12T10:00:20.000Z');
    const thirdSummary = await recorder.record(result, 'task-c');

    expect(secondSummary.recorded).toBe(1);
    expect(secondSummary.minedBlockerPatterns).toHaveLength(1);
    expect(port.recordLesson).toHaveBeenCalledTimes(2);
    expect(thirdSummary).toMatchObject({
      recorded: 0,
      suppressedByCooldown: [expect.objectContaining({ taskId: 'task-c' })],
      minedBlockerPatterns: [],
    });
  });

  it('rolls back blocker observations when lesson persistence fails', async () => {
    const port = createMockMemoryPort();
    (port.recordLesson as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('transient memory failure'))
      .mockResolvedValue(undefined);
    const recorder = new LessonRecorder(port, {
      cooldownMs: 0,
      blockerPatternThreshold: 2,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'codex-review', [
          {
            message:
              'Memory failure should not leave phantom blocker observations',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    const failedSummary = await recorder.record(result, 'task-a');
    const secondSummary = await recorder.record(result, 'task-b');

    expect(failedSummary).toMatchObject({
      recorded: 0,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
    expect(secondSummary).toMatchObject({
      recorded: 1,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
  });

  it('does not mine blocker patterns from repeated observations on the same task', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port, {
      cooldownMs: 0,
      blockerPatternThreshold: 2,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'codex-review', [
          {
            message: 'Approval blocker prevented pushing the prepared fix',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'task-a');
    const secondSummary = await recorder.record(result, 'task-a');

    expect(secondSummary.minedBlockerPatterns).toEqual([]);
  });

  it('does not mine warning-only findings as blocker patterns', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port, {
      cooldownMs: 0,
      blockerPatternThreshold: 2,
      now: (): Date => new Date('2026-07-12T10:00:00.000Z'),
    });
    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'reviewer', [
          {
            message: 'PR handoff omitted one optional verification note',
            severity: 'warning',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'task-a');
    const secondSummary = await recorder.record(result, 'task-b');

    expect(secondSummary.minedBlockerPatterns).toEqual([]);
  });

  it('rejects invalid cooldown windows explicitly', () => {
    const port = createMockMemoryPort();
    const expectedMessage =
      'LessonRecorder cooldownMs must be a finite, non-negative number within the supported Date range.';

    expect(() => new LessonRecorder(port, { cooldownMs: -1 })).toThrow(
      expectedMessage,
    );
    expect(
      () => new LessonRecorder(port, { cooldownMs: Number.POSITIVE_INFINITY }),
    ).toThrow(expectedMessage);
    expect(() => new LessonRecorder(port, { cooldownMs: 10 ** 16 })).toThrow(
      expectedMessage,
    );
  });

  it('does not create an experimental sandbox entry for failing iterations with no actionable finding', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'empty-failure'),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'sandbox-task');

    expect(port.recordLesson).not.toHaveBeenCalled();
  });

  it('attaches a not-checked contradiction report when lesson search is unavailable', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'factuality', [
          { message: 'Cache guidance allowed unaudited stale responses', severity: 'critical' },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'lesson-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(lesson.contradictionReport).toEqual({
      status: 'not_checked',
      guidance:
        'No lesson search adapter is available, so historical lesson contradictions were not checked.',
      verificationCommand:
        'npm run test --workspace @franken/critique -- --run tests/unit/memory/lesson-recorder.test.ts',
      contradictions: [],
    });
  });

  it('attaches a clear contradiction report when comparable prior lessons do not conflict', async () => {
    const port = createMockMemoryPort();
    port.searchLessons = vi.fn().mockResolvedValue([
      createLesson({
        failureDescription: 'Cache guidance reused stale responses without checking provenance',
        correctionApplied: 'Require cache verification and provenance review before reuse',
      }),
    ]);
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'factuality', [
          { message: 'Cache guidance allowed unaudited stale responses', severity: 'critical' },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'lesson-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(port.searchLessons).toHaveBeenCalledWith(
      expect.stringContaining('Cache guidance allowed unaudited stale responses'),
      10,
    );
    expect(lesson.contradictionReport).toEqual({
      status: 'clear',
      guidance: 'No deterministic lesson contradiction was detected among comparable prior lessons.',
      verificationCommand:
        'npm run test --workspace @franken/critique -- --run tests/unit/memory/lesson-recorder.test.ts',
      contradictions: [],
    });
  });

  it('detects same-evaluator lesson contradictions with shared terms and negated guidance', () => {
    const current = createLesson({
      correctionApplied: 'Do not reuse cache responses without provenance checks',
    });
    const prior = createLesson({
      testTraceability: [
        {
          lessonId: 'prior-cache-lesson',
          taskId: 'prior-task',
          evaluatorName: 'factuality',
          failingIteration: 0,
          resolvedIteration: 1,
          sourceFindingMessages: ['Cache guidance allowed unaudited stale responses'],
          testId: 'prior-cache-lesson:regression',
          verificationCommand: 'npm run test --workspace @franken/critique',
        },
      ],
      correctionApplied: 'Reuse cache responses',
    });

    const report = detectLessonContradictions(current, [prior]);

    expect(report.status).toBe('contradiction_detected');
    expect(report.guidance).toContain('Promotion is blocked');
    expect(report.contradictions).toEqual([
      expect.objectContaining({
        conflictingLessonId: 'prior-cache-lesson',
        evaluatorName: 'factuality',
        sharedTerms: expect.arrayContaining(['cache', 'responses', 'reuse']),
        conflictingCorrectionApplied: 'Reuse cache responses',
      }),
    ]);
  });

  it('detects contradictions from recorded reviewer guidance when correction summaries are generic', () => {
    const current = createLesson({
      failureDescription: 'Cache reuse guidance regression',
      correctionApplied: 'Corrected in iteration 1',
      reviewerFeedback: {
        summary: 'Cache reuse lacked provenance checks',
        findings: [
          {
            sourceIteration: 0,
            evaluatorName: 'factuality',
            message: 'Cache reuse lacked provenance checks',
            severity: 'critical',
            suggestion: 'Do not reuse cache responses without provenance checks',
          },
        ],
        suggestionsComplete: true,
      },
    });
    const prior = createLesson({
      failureDescription: 'Cache reuse guidance regression',
      correctionApplied: 'Corrected in iteration 1',
      reviewerFeedback: {
        summary: 'Cache reuse was allowed without requiring provenance checks',
        findings: [
          {
            sourceIteration: 0,
            evaluatorName: 'factuality',
            message: 'Cache reuse was allowed without requiring provenance checks',
            severity: 'critical',
            suggestion: 'Reuse cache responses',
          },
        ],
        suggestionsComplete: true,
      },
    });

    expect(detectLessonContradictions(current, [prior])).toMatchObject({
      status: 'contradiction_detected',
      contradictions: [
        expect.objectContaining({
          evaluatorName: 'factuality',
          sharedTerms: expect.arrayContaining(['cache', 'responses', 'reuse']),
        }),
      ],
    });
  });

  it('uses stable fallback ids for legacy contradictory lessons', () => {
    const current = createLesson({
      correctionApplied: 'Do not reuse cache responses without provenance checks',
    });
    const prior = createLesson({
      correctionApplied: 'Reuse cache responses',
    });

    const unrelated = createLesson({
      failureDescription: 'Token logging exposed credentials',
      correctionApplied: 'Redact tokens before logging',
    });

    const firstReport = detectLessonContradictions(current, [prior]);
    const secondReport = detectLessonContradictions(current, [unrelated, prior]);
    const secondPriorContradiction = secondReport.contradictions.find(
      (contradiction) =>
        contradiction.conflictingCorrectionApplied === prior.correctionApplied,
    );

    expect(firstReport.contradictions[0]!.conflictingLessonId).toMatch(
      /^legacy-lesson-/,
    );
    expect(secondPriorContradiction).toBeDefined();
    expect(firstReport.contradictions[0]!.conflictingLessonId).toBe(
      secondPriorContradiction!.conflictingLessonId,
    );
  });

  it('reports search adapter failures distinctly from missing lesson search', async () => {
    const port = createMockMemoryPort();
    port.searchLessons = vi.fn().mockRejectedValue(new Error('memory unavailable'));
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'factuality', [
          { message: 'Cache guidance allowed unaudited stale responses', severity: 'critical' },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'lesson-task');

    const lesson = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(lesson.contradictionReport).toMatchObject({
      status: 'not_checked',
      guidance: expect.stringContaining('Lesson search adapter failed'),
      contradictions: [],
    });
  });

  it('uses corrective guidance polarity so failure prose negation alone does not block matching fixes', () => {
    const current = createLesson({
      failureDescription: 'Cache did not verify provenance before reuse',
      correctionApplied: 'Require provenance verification before cache reuse',
    });
    const prior = createLesson({
      failureDescription: 'Cache skipped provenance before reuse',
      correctionApplied: 'Require provenance verification before cache reuse',
    });

    expect(detectLessonContradictions(current, [prior])).toMatchObject({
      status: 'clear',
      contradictions: [],
    });
  });

  it('ignores reviewer finding prose when checking corrective guidance polarity', () => {
    const current = createLesson({
      failureDescription: 'Cache did not verify provenance before reuse',
      correctionApplied: 'Require provenance verification before cache reuse',
      reviewerFeedback: {
        summary: 'Cache did not verify provenance before reuse',
        findings: [
          {
            sourceIteration: 0,
            evaluatorName: 'factuality',
            message: 'Cache did not verify provenance before reuse',
            severity: 'critical',
          },
        ],
        suggestionsComplete: false,
      },
    });
    const prior = createLesson({
      failureDescription: 'Cache skipped provenance before reuse',
      correctionApplied: 'Require provenance verification before cache reuse',
      reviewerFeedback: {
        summary: 'Cache skipped provenance before reuse',
        findings: [
          {
            sourceIteration: 0,
            evaluatorName: 'factuality',
            message: 'Cache skipped provenance before reuse',
            severity: 'critical',
          },
        ],
        suggestionsComplete: false,
      },
    });

    expect(detectLessonContradictions(current, [prior])).toMatchObject({
      status: 'clear',
      contradictions: [],
    });
  });

  it('distinguishes leading prohibitions from conditional without clauses', () => {
    const current = createLesson({
      correctionApplied: 'Do not reuse cache responses without provenance checks',
    });
    const prior = createLesson({
      correctionApplied: 'Reuse cache responses without provenance checks',
    });

    expect(detectLessonContradictions(current, [prior])).toMatchObject({
      status: 'contradiction_detected',
      contradictions: [
        expect.objectContaining({
          sharedTerms: expect.arrayContaining(['cache', 'responses', 'reuse']),
        }),
      ],
    });
  });

  it('does not contradict compatible conditional provenance guidance', () => {
    const current = createLesson({
      correctionApplied: 'Do not reuse cache responses without provenance checks',
    });
    const prior = createLesson({
      correctionApplied: 'Reuse cache responses when provenance checks are present',
    });
    const requirePrior = createLesson({
      correctionApplied: 'Require provenance checks before cache reuse',
    });

    expect(detectLessonContradictions(current, [prior, requirePrior])).toMatchObject({
      status: 'clear',
      contradictions: [],
    });
  });

  it('does not contradict with-guarded or if-guarded prerequisite allowances', () => {
    for (const guardedAllowance of ['Deploy with approval', 'Deploy if approval']) {
      expect(
        detectLessonContradictions(
          createLesson({ correctionApplied: 'Do not deploy without approval' }),
          [createLesson({ correctionApplied: guardedAllowance })],
        ),
      ).toMatchObject({ status: 'clear', contradictions: [] });
    }
  });

  it('treats deny directives as negative guidance', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Deny API access' }),
        [createLesson({ correctionApplied: 'Allow API access' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('checks directive-shaped reviewer messages when suggestions are absent', () => {
    const current = createLesson({
      correctionApplied: 'Corrected in iteration 1',
      reviewerFeedback: {
        summary: 'Cache guidance regression',
        findings: [
          {
            sourceIteration: 0,
            evaluatorName: 'factuality',
            message: 'Do not reuse cache responses without provenance checks',
            severity: 'critical',
          },
        ],
        suggestionsComplete: false,
      },
    });
    const prior = createLesson({
      correctionApplied: 'Corrected in iteration 1',
      reviewerFeedback: {
        summary: 'Cache guidance regression',
        findings: [
          {
            sourceIteration: 0,
            evaluatorName: 'factuality',
            message: 'Reuse cache responses without provenance checks',
            severity: 'critical',
          },
        ],
        suggestionsComplete: false,
      },
    });

    expect(detectLessonContradictions(current, [prior])).toMatchObject({
      status: 'contradiction_detected',
    });
  });

  it('treats run as a positive directive for test guidance reversals', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not run tests' }),
        [createLesson({ correctionApplied: 'Run tests' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('treats until prerequisites as compatible guards', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not deploy until approval' }),
        [createLesson({ correctionApplied: 'Deploy after approval' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('splits bare conjunction mixed directives before assigning polarity', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not cache tokens and rotate keys' }),
        [createLesson({ correctionApplied: 'Rotate keys' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('does not treat denied or rejected guard outcomes as compatible allowances', () => {
    for (const guardedAllowance of ['Deploy if approval is denied', 'Deploy if approval rejected']) {
      expect(
        detectLessonContradictions(
          createLesson({ correctionApplied: 'Do not deploy without approval' }),
          [createLesson({ correctionApplied: guardedAllowance })],
        ),
      ).toMatchObject({ status: 'contradiction_detected' });
    }
  });

  it('treats double-negative skip directives as opposites', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not skip tests' }),
        [createLesson({ correctionApplied: 'Skip tests' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('does not suppress invalid-object contradictions using unrelated valid qualifiers', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Allow invalid tokens with valid signature' }),
        [createLesson({ correctionApplied: 'Do not allow invalid tokens' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('ignores failure-prose reviewer messages that contain without', () => {
    expect(
      detectLessonContradictions(
        createLesson({
          correctionApplied: 'Corrected in iteration 1',
          reviewerFeedback: {
            summary: 'Cache reused without provenance checks',
            findings: [
              {
                sourceIteration: 0,
                evaluatorName: 'factuality',
                message: 'Cache reused without provenance checks',
                severity: 'critical',
              },
            ],
            suggestionsComplete: false,
          },
        }),
        [createLesson({ correctionApplied: 'Do not reuse cache without provenance checks' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('parses if and when prerequisite guards before compatibility matching', () => {
    for (const guardedProhibition of [
      'Do not deploy if approval is missing',
      'Do not deploy when approval is missing',
    ]) {
      expect(
        detectLessonContradictions(
          createLesson({ correctionApplied: guardedProhibition }),
          [createLesson({ correctionApplied: 'Deploy after approval' })],
        ),
      ).toMatchObject({ status: 'clear', contradictions: [] });
    }
  });

  it('normalizes gerund directive verbs before comparing objects', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Avoid logging PII' }),
        [createLesson({ correctionApplied: 'Log PII' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('preserves shared verbs when conjunctions coordinate objects', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not log tokens and passwords' }),
        [createLesson({ correctionApplied: 'Log passwords' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('requires qualifier overlap for generic object matches', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not log error messages' }),
        [createLesson({ correctionApplied: 'Log debug messages' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('reports matched reviewer guidance when the correction summary is generic', () => {
    const current = createLesson({
      correctionApplied: 'Corrected in iteration 1',
      reviewerFeedback: {
        summary: 'Cache reuse lacked provenance checks',
        findings: [
          {
            sourceIteration: 0,
            evaluatorName: 'factuality',
            message: 'Cache reuse lacked provenance checks',
            severity: 'critical',
            suggestion: 'Do not reuse cache responses without provenance checks',
          },
        ],
        suggestionsComplete: true,
      },
    });
    const prior = createLesson({
      correctionApplied: 'Corrected in iteration 1',
      reviewerFeedback: {
        summary: 'Cache reuse was allowed without provenance checks',
        findings: [
          {
            sourceIteration: 0,
            evaluatorName: 'factuality',
            message: 'Cache reuse was allowed without provenance checks',
            severity: 'critical',
            suggestion: 'Reuse cache responses without provenance checks',
          },
        ],
        suggestionsComplete: true,
      },
    });

    expect(detectLessonContradictions(current, [prior])).toMatchObject({
      status: 'contradiction_detected',
      contradictions: [
        expect.objectContaining({
          conflictingCorrectionApplied: 'Corrected in iteration 1',
          conflictingGuidance: 'Reuse cache responses without provenance checks',
        }),
      ],
    });
  });

  it('recognizes should not as negated directive guidance', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Should not log PII' }),
        [createLesson({ correctionApplied: 'Should log PII' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('treats mid-clause negation as compatible with equivalent prohibitions', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Allow requests that do not include PII' }),
        [createLesson({ correctionApplied: 'Do not allow requests that include PII' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('keeps punctuation-delimited clauses out of without guards', () => {
    expect(
      detectLessonContradictions(
        createLesson({
          correctionApplied:
            'Do not reuse cache without provenance checks; rotate cache keys after deploy',
        }),
        [createLesson({ correctionApplied: 'Reuse cache after deploy' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('treats unless guards as compatible conditional guidance', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Avoid cache reuse unless provenance checks pass' }),
        [createLesson({ correctionApplied: 'Reuse cache when provenance checks pass' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('splits embedded negated directives from positive prefaces', () => {
    expect(
      detectLessonContradictions(
        createLesson({
          correctionApplied: 'Validate provenance and do not reuse cache responses',
        }),
        [createLesson({ correctionApplied: 'Reuse cache responses' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('preserves directive context for short without guard clauses', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Require authentication before API access' }),
        [createLesson({ correctionApplied: 'Allow API access without authentication' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('does not treat opposite conditional outcomes as compatible guards', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Avoid cache reuse unless provenance checks pass' }),
        [createLesson({ correctionApplied: 'Reuse cache when provenance checks fail' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('keeps non-prefixed short technical terms distinct', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not log PII' }),
        [createLesson({ correctionApplied: 'Log non-PII diagnostics' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('treats single-term guards as compatible when directive terms also overlap', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not deploy without approval' }),
        [createLesson({ correctionApplied: 'Deploy after approval' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('splits punctuation-delimited directives before assigning polarity', () => {
    expect(
      detectLessonContradictions(
        createLesson({
          correctionApplied:
            'Do not cache unauthenticated profiles; cache profile metadata after validation',
        }),
        [createLesson({ correctionApplied: 'Cache profile metadata after validation' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('recognizes embedded never and cannot prohibitions', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Validate headers and never cache tokens' }),
        [createLesson({ correctionApplied: 'Cache tokens' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });

    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Validate headers and cannot cache tokens' }),
        [createLesson({ correctionApplied: 'Cache tokens' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('does not self-contradict duplicate positive without guidance', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Reuse cache without provenance checks' }),
        [createLesson({ correctionApplied: 'Reuse cache without provenance checks' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('splits newline-delimited directive clauses before assigning polarity', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not log PII\nLog debug metrics' }),
        [createLesson({ correctionApplied: 'Log debug metrics' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });

    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not cache tokens, and rotate keys' }),
        [createLesson({ correctionApplied: 'Rotate keys' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('ignores generic directive verbs when testing object overlap', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not allow API writes' }),
        [createLesson({ correctionApplied: 'Allow API reads' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('treats before prerequisites as compatible guards', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not deploy before approval' }),
        [createLesson({ correctionApplied: 'Deploy after approval' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('does not negate positive before prerequisite guidance', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Require approval before deploy' }),
        [createLesson({ correctionApplied: 'Deploy after approval' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('excludes guard words from shared-term matching', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not deploy without approval' }),
        [createLesson({ correctionApplied: 'Delete backups without approval' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('treats missing prerequisites as opposed guard outcomes', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Avoid cache reuse unless provenance checks pass' }),
        [createLesson({ correctionApplied: 'Reuse cache when provenance checks are missing' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });

    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not deploy without approval' }),
        [createLesson({ correctionApplied: 'Deploy when approval is missing' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('recognizes bypass-style prohibitive directives as negative guidance', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Require authentication before API access' }),
        [createLesson({ correctionApplied: 'Bypass authentication before API access' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('treats positive without and negative with prohibitions as equivalent', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Run tests without network access' }),
        [createLesson({ correctionApplied: 'Do not run tests with network access' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('filters must as a modal stop word', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Must not log tokens' }),
        [createLesson({ correctionApplied: 'Must rotate tokens' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('treats require as a positive one-object directive', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Require authentication' }),
        [createLesson({ correctionApplied: 'Bypass authentication' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('treats valid and invalid qualified allowances as compatible', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Allow requests with valid tokens' }),
        [createLesson({ correctionApplied: 'Do not allow requests with invalid tokens' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('does not let unrelated valid qualifiers suppress invalid-object contradictions', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Allow invalid tokens with valid signature' }),
        [createLesson({ correctionApplied: 'Do not allow invalid tokens' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('detects double-negative skip directives as reversals', () => {
    for (const pair of [
      ['Do not skip tests', 'Skip tests'],
      ['Do not bypass authentication', 'Bypass authentication'],
    ] as const) {
      expect(
        detectLessonContradictions(
          createLesson({ correctionApplied: pair[0] }),
          [createLesson({ correctionApplied: pair[1] })],
        ),
      ).toMatchObject({ status: 'contradiction_detected' });
    }
  });

  it('ignores failure prose with without when reviewer suggestions are missing', () => {
    const current = createLesson({
      correctionApplied: 'Corrected in iteration 1',
      reviewerFeedback: {
        summary: 'Cache reused without provenance checks',
        findings: [
          {
            sourceIteration: 0,
            evaluatorName: 'factuality',
            message: 'Cache reused without provenance checks',
            severity: 'critical',
          },
        ],
        suggestionsComplete: false,
      },
    });

    expect(
      detectLessonContradictions(current, [
        createLesson({ correctionApplied: 'Do not reuse cache without provenance checks' }),
      ]),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('treats if and when prerequisite guards as compatible with positive allowances', () => {
    for (const guardedProhibition of [
      'Do not deploy if approval is missing',
      'Do not deploy when approval is missing',
    ]) {
      expect(
        detectLessonContradictions(
          createLesson({ correctionApplied: guardedProhibition }),
          [createLesson({ correctionApplied: 'Deploy after approval' })],
        ),
      ).toMatchObject({ status: 'clear', contradictions: [] });
    }
  });

  it('normalizes gerund directive verbs before comparing objects', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Avoid logging PII' }),
        [createLesson({ correctionApplied: 'Log PII' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('preserves shared directive objects when splitting conjunctions', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not log tokens and passwords' }),
        [createLesson({ correctionApplied: 'Log passwords' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('requires qualifier overlap before generic object matches block promotion', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not log error messages' }),
        [createLesson({ correctionApplied: 'Log debug messages' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('checks compatible siblings on prior compound lessons', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Cache user avatars after validation' }),
        [
          createLesson({
            correctionApplied:
              'Do not cache private avatars; cache user avatars after validation',
          }),
        ],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('treats modal positive directives as explicit reversals', () => {
    for (const pair of [
      ['Should deploy', 'Should not deploy'],
      ['Must cache tokens', 'Must not cache tokens'],
    ] as const) {
      expect(
        detectLessonContradictions(
          createLesson({ correctionApplied: pair[0] }),
          [createLesson({ correctionApplied: pair[1] })],
        ),
      ).toMatchObject({ status: 'contradiction_detected' });
    }
  });

  it('normalizes dropped-e gerund directive verbs', () => {
    for (const pair of [
      ['Avoid caching tokens', 'Cache tokens'],
      ['Avoid reusing cache', 'Reuse cache'],
    ] as const) {
      expect(
        detectLessonContradictions(
          createLesson({ correctionApplied: pair[0] }),
          [createLesson({ correctionApplied: pair[1] })],
        ),
      ).toMatchObject({ status: 'contradiction_detected' });
    }
  });

  it('treats negated approval guards as failing outcomes', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not deploy without approval' }),
        [createLesson({ correctionApplied: 'Deploy if approval is not granted' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('treats validated and unvalidated scopes as compatible qualifiers', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not cache unvalidated responses' }),
        [createLesson({ correctionApplied: 'Cache validated responses' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('keeps generic object terms available for qualifier checks', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not store error messages in DB' }),
        [createLesson({ correctionApplied: 'Store debug messages in DB' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('treats complementary success and failure guards as compatible', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not deploy when approval is missing' }),
        [createLesson({ correctionApplied: 'Deploy when approval is granted' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('detects terse directive reversals outside the positive allowlist', () => {
    for (const pair of [
      ['Do not delete', 'Delete'],
      ['Do not remove cache', 'Remove cache'],
      ['Do not publish', 'Publish'],
    ] as const) {
      expect(
        detectLessonContradictions(
          createLesson({ correctionApplied: pair[0] }),
          [createLesson({ correctionApplied: pair[1] })],
        ),
      ).toMatchObject({ status: 'contradiction_detected' });
    }
  });

  it('does not treat embedded negation as automatic compatibility for direct reversals', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Allow requests that do not validate tokens' }),
        [
          createLesson({
            correctionApplied: 'Do not allow requests that do not validate tokens',
          }),
        ],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('classifies unverified guard allowances as failing outcomes', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not deploy unless provenance is verified' }),
        [createLesson({ correctionApplied: 'Deploy with unverified provenance' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('recognizes double-negative prohibition verbs as reversals', () => {
    for (const pair of [
      ['Do not disable validation', 'Disable validation'],
      ['Do not reject retries', 'Reject retries'],
    ] as const) {
      expect(
        detectLessonContradictions(
          createLesson({ correctionApplied: pair[0] }),
          [createLesson({ correctionApplied: pair[1] })],
        ),
      ).toMatchObject({ status: 'contradiction_detected' });
    }
  });

  it('treats unless-guarded allowances as compatible with missing-prerequisite prohibitions', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not deploy without approval' }),
        [createLesson({ correctionApplied: 'Deploy unless approval is missing' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('requires qualifier overlap for access scope permissions', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not allow API write access' }),
        [createLesson({ correctionApplied: 'Allow API read access' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('does not add embedded negative clauses for double-negative directives', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not skip tests' }),
        [createLesson({ correctionApplied: 'Run tests' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('does not strip unrelated positive verbs as directive opposites', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not cache tokens' }),
        [createLesson({ correctionApplied: 'Rotate cache tokens' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('does not block complementary lessons solely on shared object terms', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not cache auth tokens' }),
        [createLesson({ correctionApplied: 'Validate auth tokens' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('detects unauthenticated access as conflicting with authentication requirements', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Require authentication before API access' }),
        [createLesson({ correctionApplied: 'Allow unauthenticated API access' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('preserves divergent auth scope qualifiers before flagging conflicts', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Require authentication before private API access' }),
        [createLesson({ correctionApplied: 'Allow unauthenticated public API access' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('treats after-validation allowances as compatible with unvalidated prohibitions', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not cache unvalidated responses' }),
        [createLesson({ correctionApplied: 'Cache responses after validation' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('recognizes non-qualified prohibitions as complementary scopes', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not cache non-sensitive data' }),
        [createLesson({ correctionApplied: 'Cache sensitive data' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('requires shared guard subjects for pass-fail guard conflicts', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not deploy when tests fail' }),
        [createLesson({ correctionApplied: 'Deploy when approval is granted' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('does not treat inverse unless guards as compatible', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not deploy without approval' }),
        [createLesson({ correctionApplied: 'Deploy unless approval is granted' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('ignores failure prose with until or unless when suggestions are missing', () => {
    expect(
      detectLessonContradictions(
        createLesson({
          correctionApplied: 'Require approval before deployment',
          reviewerFeedback: {
            findings: [
              {
                evaluatorName: 'factuality',
                message: 'Deployment failed until approval propagated',
                severity: 'warning',
              },
            ],
          },
        }),
        [createLesson({ correctionApplied: 'Do not deploy without approval' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('treats missing prerequisites as contradictions against required guards', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not deploy without approval' }),
        [createLesson({ correctionApplied: 'Deploy when approval is missing' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('normalizes common singular and plural comparable terms', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not log tokens' }),
        [createLesson({ correctionApplied: 'Log token' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('splits comma-and mixed directives before assigning polarity', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not cache tokens, and rotate keys' }),
        [createLesson({ correctionApplied: 'Rotate keys' })],
      ),
    ).toMatchObject({ status: 'clear', contradictions: [] });
  });

  it('detects one-object directive reversals', () => {
    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Disable cache' }),
        [createLesson({ correctionApplied: 'Enable cache' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });

    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not deploy' }),
        [createLesson({ correctionApplied: 'Deploy' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });

    expect(
      detectLessonContradictions(
        createLesson({ correctionApplied: 'Do not log tokens' }),
        [createLesson({ correctionApplied: 'Log token' })],
      ),
    ).toMatchObject({ status: 'contradiction_detected' });
  });

  it('recognizes disallow and prohibit as negated directive guidance', () => {
    const current = createLesson({
      correctionApplied: 'Disallow cache reuse',
    });
    const prior = createLesson({
      correctionApplied: 'Allow cache reuse',
    });
    const prohibitCurrent = createLesson({
      correctionApplied: 'Prohibit API access',
    });
    const permitPrior = createLesson({
      correctionApplied: 'Permit API access',
    });

    expect(detectLessonContradictions(current, [prior])).toMatchObject({
      status: 'contradiction_detected',
    });
    expect(detectLessonContradictions(prohibitCurrent, [permitPrior])).toMatchObject({
      status: 'contradiction_detected',
    });
  });

  it('includes reviewer guidance in search queries for lessons with generic correction summaries', async () => {
    const port = createMockMemoryPort();
    port.searchLessons = vi.fn().mockResolvedValue([]);
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'factuality', [
          {
            message: 'Do not reuse cache responses without provenance checks',
            severity: 'critical',
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'lesson-task');

    expect(port.searchLessons).toHaveBeenCalledWith(
      expect.stringContaining('Do not reuse cache responses without provenance checks'),
      10,
    );
  });

  it('includes reviewer guidance in stable legacy fallback ids', () => {
    const base = {
      failureDescription: 'Cache reuse guidance regression',
      correctionApplied: 'Corrected in iteration 1',
    };
    const reusePrior = createLesson({
      ...base,
      reviewerFeedback: {
        summary: 'Reuse cache responses without constraints',
        findings: [
          {
            sourceIteration: 0,
            evaluatorName: 'factuality',
            message: 'Cache reuse was allowed without constraints',
            severity: 'critical',
            suggestion: 'Reuse cache responses',
          },
        ],
        suggestionsComplete: false,
      },
    });
    const allowPrior = createLesson({
      ...base,
      reviewerFeedback: {
        summary: 'Allow cache reuse for matching requests',
        findings: [
          {
            sourceIteration: 0,
            evaluatorName: 'factuality',
            message: 'Cache reuse was allowed for matching requests',
            severity: 'critical',
            suggestion: 'Allow cache reuse',
          },
        ],
        suggestionsComplete: false,
      },
    });
    const current = createLesson({
      ...base,
      reviewerFeedback: {
        summary: 'Do not reuse cache responses without provenance checks',
        findings: [
          {
            sourceIteration: 0,
            evaluatorName: 'factuality',
            message: 'Cache reuse lacked provenance checks',
            severity: 'critical',
            suggestion: 'Do not reuse cache responses without provenance checks',
          },
        ],
        suggestionsComplete: false,
      },
    });

    const report = detectLessonContradictions(current, [reusePrior, allowPrior]);

    expect(report.contradictions).toHaveLength(2);
    const ids = report.contradictions.map(
      (contradiction) => contradiction.conflictingLessonId,
    );
    expect(ids.every((id) => id.startsWith('legacy-lesson-'))).toBe(true);
    expect(new Set(ids).size).toBe(2);
  });

  it('treats without as corrective negation when guidance otherwise overlaps strongly', () => {
    const current = createLesson({
      correctionApplied: 'Require provenance checks before reusing cache responses',
    });
    const prior = createLesson({
      correctionApplied: 'Reuse cache responses without provenance checks',
    });

    expect(detectLessonContradictions(current, [prior])).toMatchObject({
      status: 'contradiction_detected',
      contradictions: [
        expect.objectContaining({
          sharedTerms: expect.arrayContaining(['checks', 'provenance']),
        }),
      ],
    });
  });

  it('requires stronger shared terms before blocking same-evaluator lessons', () => {
    const current = createLesson({
      failureDescription: 'Cache unauthenticated user profiles',
      correctionApplied: 'Do not cache unauthenticated user profiles',
    });
    const prior = createLesson({
      failureDescription: 'Cache dependency metadata',
      correctionApplied: 'Cache dependency metadata after checksum verification',
    });

    expect(detectLessonContradictions(current, [prior])).toMatchObject({
      status: 'clear',
      contradictions: [],
    });
  });

  it('does not flag unrelated evaluators or non-overlapping lessons as contradictions', () => {
    const current = createLesson({
      evaluatorName: 'factuality',
      correctionApplied: 'Do not reuse cache responses without provenance checks',
    });
    const unrelated = createLesson({
      evaluatorName: 'security',
      failureDescription: 'Token logging exposed credentials',
      correctionApplied: 'Redact tokens before logging',
    });

    expect(detectLessonContradictions(current, [unrelated])).toMatchObject({
      status: 'clear',
      contradictions: [],
    });
  });

  it('does not create traceability entries for infrastructure-only evaluator exceptions', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'adr-compliance', [
          {
            message: 'internal evaluator error occurred',
            severity: 'critical',
            location: EVALUATOR_EXCEPTION_LOCATION,
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'task-123');

    expect(port.recordLesson).not.toHaveBeenCalled();
  });

  it('includes correction info from the failing iteration', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'complexity', [
          { message: 'too many params', severity: 'warning' },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'task-123');

    const call = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as {
      correctionApplied: string;
      timestamp: string;
    };
    expect(call.correctionApplied).toBeTruthy();
    expect(call.timestamp).toBeTruthy();
  });

  it('records a lesson when multi-iteration recovery ends with warnings', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'warn',
      iterations: [
        createIteration(0, 'fail', 'complexity', [
          { message: 'too many params', severity: 'warning' },
        ]),
        createIteration(1, 'warn', 'adr-compliance', [
          { message: 'review ADR', severity: 'warning' },
        ]),
      ],
    };

    await recorder.record(result, 'task-123');

    const call = (port.recordLesson as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as {
      correctionApplied: string;
    };
    expect(port.recordLesson).toHaveBeenCalledTimes(1);
    expect(call.correctionApplied).toBe('Corrected in iteration 1');
  });

  it('does not record evaluator infrastructure exceptions as learned critique lessons', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'adr-compliance', [
          {
            message:
              'Evaluator "adr-compliance" failed because an internal evaluator error occurred.',
            severity: 'critical',
            location: EVALUATOR_EXCEPTION_LOCATION,
          },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    await recorder.record(result, 'task-123');

    expect(port.recordLesson).not.toHaveBeenCalled();
  });

  it('does not record on fail verdict', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'fail',
      iterations: [createIteration(0, 'fail')],
      correction: {
        summary: 'fix it',
        findings: [],
        score: 0.3,
        iterationCount: 1,
      },
    };

    await recorder.record(result, 'test-task');

    expect(port.recordLesson).not.toHaveBeenCalled();
  });

  it('does not record on halted verdict', async () => {
    const port = createMockMemoryPort();
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'halted',
      iterations: [createIteration(0, 'fail')],
      reason: 'max iterations',
    };

    await recorder.record(result, 'test-task');

    expect(port.recordLesson).not.toHaveBeenCalled();
  });

  it('swallows errors from MemoryPort gracefully', async () => {
    const port = createMockMemoryPort();
    (port.recordLesson as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('DB down'),
    );
    const recorder = new LessonRecorder(port);

    const result: CritiqueLoopResult = {
      verdict: 'pass',
      iterations: [
        createIteration(0, 'fail', 'safety', [
          { message: 'issue', severity: 'critical' },
        ]),
        createIteration(1, 'pass'),
      ],
    };

    // Should not throw and should report that no lesson was persisted.
    await expect(recorder.record(result, 'test-task')).resolves.toMatchObject({
      recorded: 0,
      suppressedByCooldown: [],
      minedBlockerPatterns: [],
    });
  });
});
