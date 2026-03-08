import { describe, it, expect } from 'vitest';
import {
  GovernorError,
  ApprovalTimeoutError,
  ChannelUnavailableError,
  SignatureVerificationError,
  TriggerEvaluationError,
} from '../../../src/errors/index.js';

describe('GovernorError', () => {
  it('is an instance of Error', () => {
    const err = new GovernorError('test');
    expect(err).toBeInstanceOf(Error);
  });

  it('is an instance of GovernorError', () => {
    const err = new GovernorError('test');
    expect(err).toBeInstanceOf(GovernorError);
  });

  it('sets the name property', () => {
    const err = new GovernorError('test');
    expect(err.name).toBe('GovernorError');
  });
});

describe('ApprovalTimeoutError', () => {
  it('is an instance of GovernorError', () => {
    const err = new ApprovalTimeoutError('req-001', 30_000);
    expect(err).toBeInstanceOf(GovernorError);
  });

  it('carries requestId and timeoutMs', () => {
    const err = new ApprovalTimeoutError('req-001', 30_000);
    expect(err.requestId).toBe('req-001');
    expect(err.timeoutMs).toBe(30_000);
  });

  it('sets the name property', () => {
    const err = new ApprovalTimeoutError('req-001', 30_000);
    expect(err.name).toBe('ApprovalTimeoutError');
  });
});

describe('ChannelUnavailableError', () => {
  it('is an instance of GovernorError', () => {
    const err = new ChannelUnavailableError('slack', 'Connection refused');
    expect(err).toBeInstanceOf(GovernorError);
  });

  it('carries channelId and cause message', () => {
    const err = new ChannelUnavailableError('slack', 'Connection refused');
    expect(err.channelId).toBe('slack');
    expect(err.message).toContain('Connection refused');
  });

  it('sets the name property', () => {
    const err = new ChannelUnavailableError('slack', 'Connection refused');
    expect(err.name).toBe('ChannelUnavailableError');
  });
});

describe('SignatureVerificationError', () => {
  it('is an instance of GovernorError', () => {
    const err = new SignatureVerificationError('req-001');
    expect(err).toBeInstanceOf(GovernorError);
  });

  it('carries requestId', () => {
    const err = new SignatureVerificationError('req-001');
    expect(err.requestId).toBe('req-001');
  });

  it('sets the name property', () => {
    const err = new SignatureVerificationError('req-001');
    expect(err.name).toBe('SignatureVerificationError');
  });
});

describe('TriggerEvaluationError', () => {
  it('is an instance of GovernorError', () => {
    const err = new TriggerEvaluationError('budget', 'Invalid input');
    expect(err).toBeInstanceOf(GovernorError);
  });

  it('carries triggerId', () => {
    const err = new TriggerEvaluationError('budget', 'Invalid input');
    expect(err.triggerId).toBe('budget');
  });

  it('sets the name property', () => {
    const err = new TriggerEvaluationError('budget', 'Invalid input');
    expect(err.name).toBe('TriggerEvaluationError');
  });
});
