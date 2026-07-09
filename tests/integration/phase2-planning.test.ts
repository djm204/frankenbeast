/**
 * Phase 2: Recursive Planning
 *
 * Tests MOD-04 (Planner) + MOD-06 (Critique) working together.
 * The planner generates task DAGs, the critique module audits them.
 */

import { describe, it, expect } from 'vitest';

import { createReviewer } from '@franken/critique';
import type { EvaluationInput, LoopConfig } from '@franken/critique';
import { PlanGraph, createTaskId } from '@franken/planner';
import type { Task } from '@franken/planner';

import {
  makeGuardrailsPort,
  makeMemoryPort,
  makeObservabilityPort,
} from '../helpers/stubs.js';
import { TEST_TOKEN_BUDGET } from '../helpers/token-test-values.js';

// ─── Critique Reviews Clean Code ────────────────────────────────────────────

describe('Phase 2: Planning — Critique Pipeline', () => {
  const defaultLoopConfig: LoopConfig = {
    maxIterations: 3,
    tokenBudget: TEST_TOKEN_BUDGET,
    consensusThreshold: 3,
    sessionId: 'session-001',
    taskId: 'task-001',
  };

  it('approves clean TypeScript code on first iteration', async () => {
    const reviewer = createReviewer({
      guardrails: makeGuardrailsPort(),
      memory: makeMemoryPort(),
      observability: makeObservabilityPort(),
      knownPackages: ['express', 'zod'],
    });


    const input: EvaluationInput = {
      content: `
        import express from 'express';
        const app = express();
        app.get('/health', (req, res) => {
          res.json({ status: 'ok' });
        });
        app.listen(3000);
      `.trim(),
      source: 'server.ts',
      metadata: { projectId: 'test' },
    };

    const result = await reviewer.review(input, defaultLoopConfig);

    expect(result.verdict).toBe('pass');
    expect(result.iterations).toHaveLength(1);
  });

  it('detects ghost dependencies (unknown imports)', async () => {
    const reviewer = createReviewer({
      guardrails: makeGuardrailsPort(),
      memory: makeMemoryPort(),
      observability: makeObservabilityPort(),
      knownPackages: ['express'],
    });


    const input: EvaluationInput = {
      content: `
        import express from 'express';
        import unknownPackage from 'totally-unknown-package';
        const app = express();
      `.trim(),
      source: 'server.ts',
      metadata: { projectId: 'test' },
    };

    const result = await reviewer.review(input, defaultLoopConfig);

    // GhostDependencyEvaluator should flag the unknown import
    expect(result.verdict).toBe('fail');
    if (result.verdict === 'fail') {
      expect(result.correction).toBeDefined();
      expect(result.correction.findings.length).toBeGreaterThan(0);
    }
  });

  it('short-circuits on safety violations from dynamic code execution', async () => {
    const reviewer = createReviewer({
      guardrails: makeGuardrailsPort(),
      memory: makeMemoryPort(),
      observability: makeObservabilityPort(),
      knownPackages: ['express'],
    });


    const input: EvaluationInput = {
      content: `
        const userInput = req.body.code;
        executeUntrustedCode(userInput);
      `.trim(),
      source: 'handler.ts',
      metadata: { projectId: 'test' },
    };

    const result = await reviewer.review(input, defaultLoopConfig);

    expect(result.verdict).toBe('fail');
  });

  it('detects infinite loops without break statements', async () => {
    const reviewer = createReviewer({
      guardrails: makeGuardrailsPort(),
      memory: makeMemoryPort(),
      observability: makeObservabilityPort(),
      knownPackages: [],
    });


    const input: EvaluationInput = {
      content: `
        function processQueue() {
          while(true) {
            doWork();
          }
        }
      `.trim(),
      source: 'worker.ts',
      metadata: { projectId: 'test' },
    };

    const result = await reviewer.review(input, defaultLoopConfig);

    expect(result.verdict).toBe('fail');
  });
});

// ─── DAG Construction ───────────────────────────────────────────────────────

describe('Phase 2: Planning — DAG Construction', () => {
  it('builds a linear task graph', () => {
    const task1: Task = {
      id: createTaskId('task-1'),
      objective: 'Read requirements',
      requiredSkills: ['file-read'],
      dependsOn: [],
      status: 'pending',
    };

    const task2: Task = {
      id: createTaskId('task-2'),
      objective: 'Write code',
      requiredSkills: ['file-write'],
      dependsOn: [createTaskId('task-1')],
      status: 'pending',
    };

    const task3: Task = {
      id: createTaskId('task-3'),
      objective: 'Run tests',
      requiredSkills: ['test-run'],
      dependsOn: [createTaskId('task-2')],
      status: 'pending',
    };

    let graph = PlanGraph.empty();
    graph = graph.addTask(task1);
    graph = graph.addTask(task2, [createTaskId('task-1')]);
    graph = graph.addTask(task3, [createTaskId('task-2')]);

    expect(graph.size()).toBe(3);

    // Topological sort should yield tasks in dependency order
    const sorted = graph.topoSort();
    expect(sorted[0]!.id).toBe('task-1');
    expect(sorted[1]!.id).toBe('task-2');
    expect(sorted[2]!.id).toBe('task-3');
  });

  it('builds a diamond dependency graph', () => {
    const a: Task = {
      id: createTaskId('a'),
      objective: 'Parse input',
      requiredSkills: [],
      dependsOn: [],
      status: 'pending',
    };
    const b: Task = {
      id: createTaskId('b'),
      objective: 'Validate schema',
      requiredSkills: [],
      dependsOn: [createTaskId('a')],
      status: 'pending',
    };
    const c: Task = {
      id: createTaskId('c'),
      objective: 'Check permissions',
      requiredSkills: [],
      dependsOn: [createTaskId('a')],
      status: 'pending',
    };
    const d: Task = {
      id: createTaskId('d'),
      objective: 'Execute action',
      requiredSkills: [],
      dependsOn: [createTaskId('b'), createTaskId('c')],
      status: 'pending',
    };

    let graph = PlanGraph.empty();
    graph = graph
      .addTask(a)
      .addTask(b, [createTaskId('a')])
      .addTask(c, [createTaskId('a')])
      .addTask(d, [createTaskId('b'), createTaskId('c')]);

    const sorted = graph.topoSort();
    expect(sorted[0]!.id).toBe('a');
    expect(sorted[sorted.length - 1]!.id).toBe('d');
    // b and c can be in either order, but both must come after a and before d
    const bIndex = sorted.findIndex((t) => t.id === 'b');
    const cIndex = sorted.findIndex((t) => t.id === 'c');
    expect(bIndex).toBeGreaterThan(0);
    expect(cIndex).toBeGreaterThan(0);
    expect(bIndex).toBeLessThan(3);
    expect(cIndex).toBeLessThan(3);
  });

  it('preserves immutability — original graph unchanged after addTask', () => {
    const original = PlanGraph.empty();
    const withTask = original.addTask({
      id: createTaskId('t1'),
      objective: 'Test',
      requiredSkills: [],
      dependsOn: [],
      status: 'pending',
    });

    expect(original.size()).toBe(0);
    expect(withTask.size()).toBe(1);
  });
});
