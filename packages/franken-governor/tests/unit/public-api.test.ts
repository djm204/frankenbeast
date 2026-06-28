import { describe, it, expect } from 'vitest';
import * as publicApi from '../../src/index.js';
import { ApprovalMismatchError as InternalApprovalMismatchError } from '../../src/errors/index.js';

describe('public API exports', () => {
  it('re-exports ApprovalMismatchError from the package root', () => {
    expect(publicApi.ApprovalMismatchError).toBeDefined();
    expect(publicApi.ApprovalMismatchError).toBe(InternalApprovalMismatchError);
  });

  it('re-exports the other governor error classes from the package root', () => {
    expect(publicApi.GovernorError).toBeDefined();
    expect(publicApi.ApprovalTimeoutError).toBeDefined();
    expect(publicApi.ChannelUnavailableError).toBeDefined();
    expect(publicApi.SignatureVerificationError).toBeDefined();
    expect(publicApi.TriggerEvaluationError).toBeDefined();
  });
});
