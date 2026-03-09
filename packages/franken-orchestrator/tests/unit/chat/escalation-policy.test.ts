import { describe, it, expect } from 'vitest';
import { EscalationPolicy } from '../../../src/chat/escalation-policy.js';
import { IntentClass, ModelTier } from '../../../src/chat/types.js';

describe('EscalationPolicy', () => {
  const policy = new EscalationPolicy();

  describe('default mappings', () => {
    it('maps chat_simple to cheap/reply', () => {
      const result = policy.evaluate(IntentClass.ChatSimple, 'hello there');
      expect(result.tier).toBe(ModelTier.Cheap);
      expect(result.outcome.kind).toBe('reply');
    });

    it('maps chat_technical to cheap/reply by default', () => {
      const result = policy.evaluate(IntentClass.ChatTechnical, 'explain the auth system');
      expect(result.tier).toBe(ModelTier.Cheap);
      expect(result.outcome.kind).toBe('reply');
    });

    it('maps code_request to premium_execution/execute', () => {
      const result = policy.evaluate(IntentClass.CodeRequest, 'fix the login bug');
      expect(result.tier).toBe(ModelTier.PremiumExecution);
      expect(result.outcome.kind).toBe('execute');
    });

    it('maps repo_action to premium_execution/execute with approvalRequired', () => {
      const result = policy.evaluate(IntentClass.RepoAction, 'push to main');
      expect(result.tier).toBe(ModelTier.PremiumExecution);
      expect(result.outcome.kind).toBe('execute');
      if (result.outcome.kind === 'execute') {
        expect(result.outcome.approvalRequired).toBe(true);
      }
    });

    it('maps ambiguous to clarify', () => {
      const result = policy.evaluate(IntentClass.Ambiguous, 'hmm');
      expect(result.outcome.kind).toBe('clarify');
    });
  });

  describe('complexity triggers', () => {
    it('escalates chat_technical to premium_reasoning on multi-file mentions', () => {
      const input = 'Compare the implementations in src/auth.ts, src/session.ts, and src/middleware.ts';
      const result = policy.evaluate(IntentClass.ChatTechnical, input);
      expect(result.tier).toBe(ModelTier.PremiumReasoning);
    });

    it('escalates on architecture tradeoff keywords', () => {
      const input = 'What are the tradeoffs between microservices vs monolith for our codebase?';
      const result = policy.evaluate(IntentClass.ChatTechnical, input);
      expect(result.tier).toBe(ModelTier.PremiumReasoning);
    });

    it('escalates on debugging context (stack traces, error output)', () => {
      const input = 'Why does this error happen?\nError: ECONNREFUSED at TCP.connect';
      const result = policy.evaluate(IntentClass.ChatTechnical, input);
      expect(result.tier).toBe(ModelTier.PremiumReasoning);
    });

    it('does not escalate chat_simple even with triggers', () => {
      const input = 'hello, thanks for the tradeoff analysis of auth.ts and session.ts';
      const result = policy.evaluate(IntentClass.ChatSimple, input);
      expect(result.tier).toBe(ModelTier.Cheap);
    });
  });
});
