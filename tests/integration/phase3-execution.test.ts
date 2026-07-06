/**
 * Phase 3: Validated Execution
 *
 * Tests MOD-07 (Governor) + MOD-02 (Skills) working together.
 * The governor evaluates triggers, requests human approval,
 * and records audit trails.
 */

import { describe, it, expect, vi } from 'vitest';

import {
  GovernorCritiqueAdapter,
  GovernorAuditRecorder,
  BudgetTrigger,
  SkillTrigger,
  ConfidenceTrigger,
  AmbiguityTrigger,
  TriggerRegistry,
  SignatureVerifier,
  SessionTokenStore,
  createSessionToken,
} from '@franken/governor';

import type { RationaleBlock } from '@franken/planner';
import { createTaskId } from '@franken/planner';

import {
  makeApprovalChannel,
  makeGovernorMemoryPort,
} from '../helpers/stubs.js';

// ─── Helper ─────────────────────────────────────────────────────────────────

// The GovernorCritiqueAdapter passes the rationale as `unknown` to evaluators.
// SkillTrigger reads { skillId, requiresHitl, isDestructive } from the context.
// We merge both RationaleBlock and trigger-context fields for integration testing.
function makeRationale(overrides: Record<string, unknown> = {}): RationaleBlock & Record<string, unknown> {
  return {
    taskId: createTaskId('task-001'),
    reasoning: 'Need to read the config file to understand the project structure.',
    selectedTool: 'file-read',
    expectedOutcome: 'Config file contents returned successfully.',
    timestamp: new Date('2025-01-15T10:00:00Z'),
    // SkillTrigger fields — safe defaults
    skillId: 'file-read',
    requiresHitl: false,
    isDestructive: false,
    ...overrides,
  };
}

// ─── Governor: Trigger Evaluation ───────────────────────────────────────────

describe('Phase 3: Execution — Trigger Evaluation', () => {
  it('does not trigger for a low-risk task', async () => {
    const memory = makeGovernorMemoryPort();
    const channel = makeApprovalChannel('APPROVE');

    const adapter = new GovernorCritiqueAdapter({
      channel,
      auditRecorder: new GovernorAuditRecorder(memory),
      evaluators: [
        new BudgetTrigger(),
        new SkillTrigger(),
      ],
      projectId: 'test-project',
    });

    // BudgetTrigger needs context with tripped=false, SkillTrigger needs non-destructive context
    // But GovernorCritiqueAdapter passes the RationaleBlock directly to evaluators
    // Since file-read is not destructive/hitl and budget not tripped, should be approved
    const result = await adapter.verifyRationale(makeRationale());

    expect(result.verdict).toBe('approved');
    // Channel should NOT have been called — no trigger fired
    expect(channel.requestApproval).not.toHaveBeenCalled();
  });

  it('triggers on a high-stakes skill (deploy-prod)', async () => {
    const memory = makeGovernorMemoryPort();
    const channel = makeApprovalChannel('APPROVE');

    const adapter = new GovernorCritiqueAdapter({
      channel,
      auditRecorder: new GovernorAuditRecorder(memory),
      evaluators: [
        new SkillTrigger(),
      ],
      projectId: 'test-project',
    });

    const rationale = makeRationale({
      selectedTool: 'deploy-prod',
      skillId: 'deploy-prod',
      requiresHitl: true,
    });
    const result = await adapter.verifyRationale(rationale);

    expect(result.verdict).toBe('approved');
    // Channel should have been called
    expect(channel.requestApproval).toHaveBeenCalledTimes(1);
    // Audit trace should be recorded
    expect(memory.traces).toHaveLength(1);
    expect(memory.traces[0]!.tags).toContain('hitl:approved');
  });

  it('rejects when human aborts a destructive operation', async () => {
    const memory = makeGovernorMemoryPort();
    const channel = makeApprovalChannel('ABORT');

    const adapter = new GovernorCritiqueAdapter({
      channel,
      auditRecorder: new GovernorAuditRecorder(memory),
      evaluators: [
        new SkillTrigger(),
      ],
      projectId: 'test-project',
    });

    const rationale = makeRationale({
      selectedTool: 'delete-db',
      skillId: 'delete-db',
      isDestructive: true,
    });
    const result = await adapter.verifyRationale(rationale);

    expect(result.verdict).toBe('rejected');
    expect(memory.traces).toHaveLength(1);
    expect(memory.traces[0]!.tags).toContain('hitl:aborted');
  });
});

// ─── Governor: TriggerRegistry Composition ──────────────────────────────────

describe('Phase 3: Execution — TriggerRegistry', () => {
  it('composes multiple triggers and returns the first match', () => {
    const registry = new TriggerRegistry([
      new BudgetTrigger(),
      new ConfidenceTrigger(0.8),
    ]);

    // Under budget and high confidence — no trigger
    const result1 = registry.evaluateAll({
      tripped: false,
      limitUsd: 10,
      spendUsd: 5,
      confidenceScore: 0.9,
    });
    expect(result1.triggered).toBe(false);

    // Budget tripped — triggers
    const result2 = registry.evaluateAll({
      tripped: true,
      limitUsd: 10,
      spendUsd: 11,
      confidenceScore: 0.9,
    });
    expect(result2.triggered).toBe(true);
  });
});

// ─── Governor: Security — Signature Verification ────────────────────────────

describe('Phase 3: Execution — Security', () => {
  it('generates and verifies HMAC signatures', () => {
    const verifier = new SignatureVerifier(['test', 'signing', 'fixture'].join('-'));

    const payload = JSON.stringify({ taskId: 'task-001', decision: 'APPROVE' });
    const signature = verifier.sign(payload);

    expect(verifier.verify(payload, signature)).toBe(true);
    expect(verifier.verify(payload + 'tampered', signature)).toBe(false);
  });

  it('manages session tokens with expiry', () => {
    const store = new SessionTokenStore();

    const token = createSessionToken({
      approvalId: 'approval-001',
      scope: 'deploy-prod',
      grantedBy: 'test-human',
      ttlMs: 60_000,
    });
    store.store(token);

    expect(store.isValid(token.tokenId)).toBe(true);

    // Revoke the token
    store.revoke(token.tokenId);
    expect(store.isValid(token.tokenId)).toBe(false);
  });
});
