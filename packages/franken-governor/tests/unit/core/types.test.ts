import { describe, it, expectTypeOf } from 'vitest';
import type {
  ResponseCode,
  TriggerSeverity,
  TriggerResult,
  ApprovalRequest,
  ApprovalResponse,
  ApprovalOutcome,
  SessionToken,
} from '../../../src/core/types.js';

describe('core types', () => {
  it('ResponseCode is a union of APPROVE | REGEN | ABORT | DEBUG', () => {
    expectTypeOf<ResponseCode>().toEqualTypeOf<'APPROVE' | 'REGEN' | 'ABORT' | 'DEBUG'>();
  });

  it('TriggerSeverity is a union of low | medium | high | critical', () => {
    expectTypeOf<TriggerSeverity>().toEqualTypeOf<'low' | 'medium' | 'high' | 'critical'>();
  });

  it('TriggerResult has triggered, triggerId, and optional reason/severity', () => {
    expectTypeOf<TriggerResult>().toMatchTypeOf<{
      triggered: boolean;
      triggerId: string;
    }>();
  });

  it('ApprovalRequest has required fields', () => {
    expectTypeOf<ApprovalRequest>().toMatchTypeOf<{
      requestId: string;
      taskId: string;
      projectId: string;
      trigger: TriggerResult;
      summary: string;
      timestamp: Date;
    }>();
  });

  it('ApprovalResponse has required fields', () => {
    expectTypeOf<ApprovalResponse>().toMatchTypeOf<{
      requestId: string;
      decision: ResponseCode;
      respondedBy: string;
      respondedAt: Date;
    }>();
  });

  it('ApprovalOutcome is a discriminated union on decision', () => {
    type ApproveOutcome = Extract<ApprovalOutcome, { decision: 'APPROVE' }>;
    type RegenOutcome = Extract<ApprovalOutcome, { decision: 'REGEN' }>;
    expectTypeOf<ApproveOutcome>().toMatchTypeOf<{ decision: 'APPROVE' }>();
    expectTypeOf<RegenOutcome>().toMatchTypeOf<{ decision: 'REGEN'; feedback: string }>();
  });

  it('SessionToken has required fields', () => {
    expectTypeOf<SessionToken>().toMatchTypeOf<{
      tokenId: string;
      approvalId: string;
      scope: string;
      grantedBy: string;
      grantedAt: Date;
      expiresAt: Date;
    }>();
  });
});
