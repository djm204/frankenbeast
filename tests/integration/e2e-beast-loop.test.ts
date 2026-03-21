/**
 * End-to-End: The Beast Loop
 *
 * Integration tests that wire multiple modules together to validate
 * the full orchestration lifecycle. These tests prove the key
 * Frankenbeast guarantee: safety constraints are enforced outside
 * the LLM's context window.
 */

import { describe, it, expect } from 'vitest';

// MOD-04: Planner
import { PlanGraph, createTaskId } from 'franken-planner';
import type { Task } from 'franken-planner';

// MOD-06: Critique
import { createReviewer } from '@franken/critique';
import type { LoopConfig, EvaluationInput } from '@franken/critique';

// MOD-07: Governor
import {
  GovernorCritiqueAdapter,
  GovernorAuditRecorder,
  SkillTrigger,
} from '@franken/governor';

// MOD-03: Brain
import { WorkingMemoryStore, TruncationStrategy, TokenBudget } from 'franken-brain';

// Stubs and factory
import {
  makeGuardrailsPort,
  makeMemoryPort,
  makeObservabilityPort,
  makeApprovalChannel,
  makeGovernorMemoryPort,
} from '../helpers/stubs.js';
import { createTestBeast } from '../helpers/test-beast-factory.js';

// ─── Full Beast Loop: Happy Path ────────────────────────────────────────────

describe('E2E: Beast Loop — Happy Path', () => {
  it('completes the full loop: plan → critique → execute', async () => {
    const beast = createTestBeast();

    // Phase 2: Planning — build a task DAG
    const task1: Task = {
      id: createTaskId('write-sort'),
      objective: 'Write sort function',
      requiredSkills: ['file-write'],
      dependsOn: [],
      status: 'pending',
    };
    const task2: Task = {
      id: createTaskId('test-sort'),
      objective: 'Test sort function',
      requiredSkills: ['test-run'],
      dependsOn: [createTaskId('write-sort')],
      status: 'pending',
    };

    let graph = PlanGraph.empty();
    graph = graph
      .addTask(task1)
      .addTask(task2, [createTaskId('write-sort')]);
    expect(graph.size()).toBe(2);

    // Phase 2: Critique — review the generated code
    const critiqueResult = await beast.critique(`
      function sortArray(arr: number[]): number[] {
        return [...arr].sort((a, b) => a - b);
      }
    `);

    expect(critiqueResult.verdict).toBe('pass');

    // Phase 3: Execution — verify task via governor (no trigger for safe skills)
    const verifyResult = await beast.governor.verifyRationale({
      taskId: createTaskId('write-sort'),
      reasoning: 'Writing a pure sort function with no side effects.',
      selectedTool: 'file-write',
      expectedOutcome: 'Sort function written to disk.',
      timestamp: new Date(),
    });

    expect(verifyResult.verdict).toBe('approved');

    // Phase 3: Record to memory
    const memoryStore = new WorkingMemoryStore(new TruncationStrategy());
    memoryStore.push({
      id: 'turn-001',
      projectId: 'test-project',
      role: 'assistant',
      content: 'function sortArray(arr) { return [...arr].sort((a,b) => a-b); }',
      tokenCount: 20,
      status: 'success',
      type: 'working',
      createdAt: Date.now(),
    });

    expect(memoryStore.snapshot()).toHaveLength(1);
  });
});

// ─── Guardrails Survive Context Compression ─────────────────────────────────

describe('E2E: Guardrails survive context compression', () => {
  it('critique evaluators run deterministically regardless of LLM state', async () => {
    const reviewer = createReviewer({
      guardrails: makeGuardrailsPort(),
      memory: makeMemoryPort(),
      observability: makeObservabilityPort(),
      knownPackages: ['express'],
    });

    // Even if the LLM generates dangerous code, deterministic evaluators catch it
    const input: EvaluationInput = {
      content: `
        // LLM generated this after context compression "forgot" safety rules:
        const userCode = req.body.code;
        eval(userCode); // Safety evaluator catches this deterministically
        import malicious from "evil-package"; // Ghost dependency evaluator catches this
      `,
      source: 'generated.ts',
      metadata: { projectId: 'test' },
    };

    const loopConfig: LoopConfig = {
      maxIterations: 1,
      tokenBudget: 100_000,
      consensusThreshold: 3,
      sessionId: 'session-001',
      taskId: 'task-001',
    };

    const result = await reviewer.review(input, loopConfig);

    // Deterministic evaluators catch the violations regardless of LLM state
    expect(result.verdict).toBe('fail');
  });
});

// ─── HITL Pause in Execution ────────────────────────────────────────────────

describe('E2E: HITL pause during execution', () => {
  it('pauses for human approval on destructive operations', async () => {
    const memory = makeGovernorMemoryPort();
    const channel = makeApprovalChannel('APPROVE');

    const governor = new GovernorCritiqueAdapter({
      channel,
      auditRecorder: new GovernorAuditRecorder(memory),
      evaluators: [
        new SkillTrigger(),
      ],
      projectId: 'test-project',
    });

    // Safe task — no pause (SkillTrigger reads skillId/requiresHitl/isDestructive from context)
    const safeResult = await governor.verifyRationale({
      taskId: createTaskId('read-file'),
      reasoning: 'Reading a config file',
      selectedTool: 'file-read',
      expectedOutcome: 'File contents returned',
      timestamp: new Date(),
      skillId: 'file-read',
      requiresHitl: false,
      isDestructive: false,
    } as any);
    expect(safeResult.verdict).toBe('approved');
    expect(channel.requestApproval).not.toHaveBeenCalled();

    // Destructive task — requires approval
    const dangerousResult = await governor.verifyRationale({
      taskId: createTaskId('drop-table'),
      reasoning: 'Dropping the users table per migration plan',
      selectedTool: 'delete-db',
      expectedOutcome: 'Table dropped',
      timestamp: new Date(),
      skillId: 'delete-db',
      requiresHitl: false,
      isDestructive: true,
    } as any);
    expect(dangerousResult.verdict).toBe('approved');
    expect(channel.requestApproval).toHaveBeenCalledTimes(1);

    // Audit trail records the approval
    expect(memory.traces).toHaveLength(1);
    expect(memory.traces[0]!.tags).toContain('hitl:approved');
  });

  it('blocks execution when human rejects a destructive operation', async () => {
    const memory = makeGovernorMemoryPort();
    const channel = makeApprovalChannel('ABORT');

    const governor = new GovernorCritiqueAdapter({
      channel,
      auditRecorder: new GovernorAuditRecorder(memory),
      evaluators: [
        new SkillTrigger(),
      ],
      projectId: 'test-project',
    });

    const result = await governor.verifyRationale({
      taskId: createTaskId('drop-table'),
      reasoning: 'Dropping the users table',
      selectedTool: 'delete-db',
      expectedOutcome: 'Table dropped',
      timestamp: new Date(),
      skillId: 'delete-db',
      requiresHitl: false,
      isDestructive: true,
    } as any);

    expect(result.verdict).toBe('rejected');
    expect(memory.traces[0]!.tags).toContain('hitl:aborted');
  });
});

// ─── Multi-module Memory Flow ───────────────────────────────────────────────

describe('E2E: Memory flows across modules', () => {
  it('working memory tracks turns and supports pruning', () => {
    const store = new WorkingMemoryStore(new TruncationStrategy());

    // Simulate a multi-turn conversation
    for (let i = 0; i < 5; i++) {
      store.push({
        id: `user-${i}`,
        projectId: 'test-project',
        role: 'user',
        content: `User message ${i}`,
        tokenCount: 50,
        status: 'success',
        type: 'working',
        createdAt: Date.now(),
      });
      store.push({
        id: `assistant-${i}`,
        projectId: 'test-project',
        role: 'assistant',
        content: `Assistant response ${i}`,
        tokenCount: 80,
        status: 'success',
        type: 'working',
        createdAt: Date.now(),
      });
    }

    // 5 user turns x 50 + 5 assistant turns x 80 = 650 tokens
    const totalTokens = store.snapshot().reduce((sum, t) => sum + t.tokenCount, 0);
    expect(totalTokens).toBe(650);

    const budget = new TokenBudget(500, totalTokens);
    expect(budget.isExhausted()).toBe(true);

    const snapshot = store.snapshot();
    expect(snapshot.length).toBe(10);
  });
});
