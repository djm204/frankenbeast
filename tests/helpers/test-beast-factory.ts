/**
 * createTestBeast() — wires critique and governor modules together with sensible defaults.
 *
 * Use this factory for end-to-end integration tests. Each module is wired
 * with real implementations where possible, stubs for external services.
 */

// MOD-06: Critique
import { createReviewer } from '@franken/critique';
import type {
  Reviewer,
  GuardrailsPort,
  MemoryPort,
  ObservabilityPort,
  EvaluationInput,
  LoopConfig,
} from '@franken/critique';

// MOD-07: Governor
import {
  GovernorCritiqueAdapter,
  GovernorAuditRecorder,
  BudgetTrigger,
  SkillTrigger,
} from '@franken/governor';
import type { ApprovalChannel, GovernorMemoryPort } from '@franken/governor';

// Stubs
import {
  makeGuardrailsPort,
  makeMemoryPort,
  makeObservabilityPort,
  makeApprovalChannel,
  makeGovernorMemoryPort,
} from './stubs.js';

// ─── Configuration ──────────────────────────────────────────────────────────

export interface TestBeastOverrides {
  guardrailsPort?: GuardrailsPort;
  memoryPort?: MemoryPort;
  observabilityPort?: ObservabilityPort;
  approvalChannel?: ApprovalChannel;
  governorMemoryPort?: GovernorMemoryPort;
}

export interface TestBeast {
  /** Run critique on content */
  critique(content: string, loopConfig?: LoopConfig): ReturnType<Reviewer['review']>;

  // Exposed for assertions
  reviewer: Reviewer;
  governor: GovernorCritiqueAdapter;
  approvalChannel: ApprovalChannel;
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createTestBeast(overrides: TestBeastOverrides = {}): TestBeast {
  // MOD-06: Critique
  const guardrailsPort = overrides.guardrailsPort ?? makeGuardrailsPort();
  const memoryPort = overrides.memoryPort ?? makeMemoryPort();
  const observabilityPort = overrides.observabilityPort ?? makeObservabilityPort();

  const reviewer = createReviewer({
    guardrails: guardrailsPort,
    memory: memoryPort,
    observability: observabilityPort,
    knownPackages: ['express', 'zod', 'vitest', 'typescript'],
  });

  // MOD-07: Governor
  const approvalChannel = overrides.approvalChannel ?? makeApprovalChannel();
  const governorMemoryPort = overrides.governorMemoryPort ?? makeGovernorMemoryPort();
  const auditRecorder = new GovernorAuditRecorder(governorMemoryPort);

  const governor = new GovernorCritiqueAdapter({
    channel: approvalChannel,
    auditRecorder,
    evaluators: [
      new BudgetTrigger(),
      new SkillTrigger(),
    ],
    projectId: 'test-project',
  });

  return {
    critique(content: string, loopConfig?: LoopConfig) {
      const input: EvaluationInput = {
        content,
        source: 'test',
        metadata: { projectId: 'test-project' },
      };
      const cfg: LoopConfig = loopConfig ?? {
        maxIterations: 3,
        tokenBudget: 100_000,
        consensusThreshold: 3,
        sessionId: 'session-001',
        taskId: 'task-001',
      };
      return reviewer.review(input, cfg);
    },

    reviewer,
    governor,
    approvalChannel,
  };
}
