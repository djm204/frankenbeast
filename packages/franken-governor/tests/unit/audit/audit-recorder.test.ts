import { describe, it, expect, vi } from 'vitest';
import { GovernorAuditRecorder } from '../../../src/audit/audit-recorder.js';
import type { GovernorMemoryPort, EpisodicTraceRecord } from '../../../src/audit/governor-memory-port.js';
import type { ApprovalRequest, ApprovalResponse } from '../../../src/core/types.js';

function makeFakeMemoryPort(): GovernorMemoryPort & { calls: EpisodicTraceRecord[] } {
  const calls: EpisodicTraceRecord[] = [];
  return {
    calls,
    recordDecision: vi.fn(async (trace: EpisodicTraceRecord) => { calls.push(trace); }),
  };
}

function makeRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    requestId: 'req-001',
    taskId: 'task-001',
    projectId: 'proj-001',
    trigger: { triggered: true, triggerId: 'budget', reason: 'Over budget', severity: 'critical' },
    summary: 'Deploy to production',
    timestamp: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeResponse(overrides: Partial<ApprovalResponse> = {}): ApprovalResponse {
  return {
    requestId: 'req-001',
    decision: 'APPROVE',
    respondedBy: 'human',
    respondedAt: new Date('2026-01-01T00:05:00Z'),
    ...overrides,
  };
}

describe('GovernorAuditRecorder', () => {
  it('calls GovernorMemoryPort.recordDecision exactly once', async () => {
    const port = makeFakeMemoryPort();
    const recorder = new GovernorAuditRecorder(port);

    await recorder.record(makeRequest(), makeResponse());

    expect(port.recordDecision).toHaveBeenCalledOnce();
  });

  it('records APPROVE with status success and tag hitl:approved', async () => {
    const port = makeFakeMemoryPort();
    const recorder = new GovernorAuditRecorder(port);

    await recorder.record(makeRequest(), makeResponse({ decision: 'APPROVE' }));

    const trace = port.calls[0]!;
    expect(trace.status).toBe('success');
    expect(trace.tags).toContain('hitl:approved');
  });

  it('records REGEN with status failure and tag hitl:rejected', async () => {
    const port = makeFakeMemoryPort();
    const recorder = new GovernorAuditRecorder(port);

    await recorder.record(makeRequest(), makeResponse({ decision: 'REGEN', feedback: 'Try again' }));

    const trace = port.calls[0]!;
    expect(trace.status).toBe('failure');
    expect(trace.tags).toContain('hitl:rejected');
  });

  it('records ABORT with status failure and tag hitl:aborted', async () => {
    const port = makeFakeMemoryPort();
    const recorder = new GovernorAuditRecorder(port);

    await recorder.record(makeRequest(), makeResponse({ decision: 'ABORT' }));

    const trace = port.calls[0]!;
    expect(trace.status).toBe('failure');
    expect(trace.tags).toContain('hitl:aborted');
  });

  it('records DEBUG with status success and tag hitl:debug', async () => {
    const port = makeFakeMemoryPort();
    const recorder = new GovernorAuditRecorder(port);

    await recorder.record(makeRequest(), makeResponse({ decision: 'DEBUG' }));

    const trace = port.calls[0]!;
    expect(trace.status).toBe('success');
    expect(trace.tags).toContain('hitl:debug');
  });

  it('includes trigger reason in trace input', async () => {
    const port = makeFakeMemoryPort();
    const recorder = new GovernorAuditRecorder(port);

    await recorder.record(
      makeRequest({ trigger: { triggered: true, triggerId: 'budget', reason: 'Over budget', severity: 'critical' } }),
      makeResponse(),
    );

    const trace = port.calls[0]!;
    const input = trace.input as { triggerReason: string };
    expect(input.triggerReason).toBe('Over budget');
  });

  it('includes taskId and projectId from the original request', async () => {
    const port = makeFakeMemoryPort();
    const recorder = new GovernorAuditRecorder(port);

    await recorder.record(makeRequest({ taskId: 'task-xyz', projectId: 'proj-abc' }), makeResponse());

    const trace = port.calls[0]!;
    expect(trace.taskId).toBe('task-xyz');
    expect(trace.projectId).toBe('proj-abc');
  });

  it('includes requestId as trace.id', async () => {
    const port = makeFakeMemoryPort();
    const recorder = new GovernorAuditRecorder(port);

    await recorder.record(makeRequest({ requestId: 'req-xyz' }), makeResponse({ requestId: 'req-xyz' }));

    const trace = port.calls[0]!;
    expect(trace.id).toBe('req-xyz');
  });

  it('tags approved patterns with hitl:preferred-pattern', async () => {
    const port = makeFakeMemoryPort();
    const recorder = new GovernorAuditRecorder(port);

    await recorder.record(makeRequest(), makeResponse({ decision: 'APPROVE' }));

    const trace = port.calls[0]!;
    expect(trace.tags).toContain('hitl:preferred-pattern');
  });

  it('tags rejected patterns with hitl:rejection-reason', async () => {
    const port = makeFakeMemoryPort();
    const recorder = new GovernorAuditRecorder(port);

    await recorder.record(makeRequest(), makeResponse({ decision: 'REGEN', feedback: 'Bad approach' }));

    const trace = port.calls[0]!;
    expect(trace.tags).toContain('hitl:rejection-reason');
  });

  it('stores feedback in output for REGEN decisions', async () => {
    const port = makeFakeMemoryPort();
    const recorder = new GovernorAuditRecorder(port);

    await recorder.record(makeRequest(), makeResponse({ decision: 'REGEN', feedback: 'Bad approach' }));

    const trace = port.calls[0]!;
    const output = trace.output as { decision: string; feedback: string };
    expect(output.feedback).toBe('Bad approach');
  });

  it('sets toolName to hitl-gateway', async () => {
    const port = makeFakeMemoryPort();
    const recorder = new GovernorAuditRecorder(port);

    await recorder.record(makeRequest(), makeResponse());

    const trace = port.calls[0]!;
    expect(trace.toolName).toBe('hitl-gateway');
  });

  it('sets type to episodic', async () => {
    const port = makeFakeMemoryPort();
    const recorder = new GovernorAuditRecorder(port);

    await recorder.record(makeRequest(), makeResponse());

    const trace = port.calls[0]!;
    expect(trace.type).toBe('episodic');
  });
});
