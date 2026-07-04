import type { ApprovalResult, HITLGate } from './types.js';

/**
 * Test-only HITL gate that returns a configured decision.
 *
 * This helper intentionally is not exported from the package entrypoint; production
 * consumers should inject a real boundary implementation of {@link HITLGate}.
 */
export class StubHITLGate implements HITLGate {
  constructor(private readonly result: ApprovalResult = { decision: 'approved' }) {}

  async requestApproval(_markdown: string): Promise<ApprovalResult> {
    return this.result;
  }
}
