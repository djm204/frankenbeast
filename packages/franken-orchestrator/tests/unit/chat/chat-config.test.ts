import { describe, it, expect } from 'vitest';
import { ChatConfigSchema, defaultChatConfig } from '../../../src/chat/chat-config.js';

describe('ChatConfigSchema', () => {
  it('parses config with all fields', () => {
    const config = {
      maxTranscriptLength: 50,
      defaultTier: 'cheap',
      budgetPerSession: 0.50,
      approvalRequired: ['repo_action'],
    };
    expect(() => ChatConfigSchema.parse(config)).not.toThrow();
  });

  it('applies defaults for omitted fields', () => {
    const config = ChatConfigSchema.parse({});
    expect(config.maxTranscriptLength).toBeGreaterThan(0);
    expect(config.budgetPerSession).toBeGreaterThan(0);
  });

  it('rejects negative budget', () => {
    expect(() => ChatConfigSchema.parse({ budgetPerSession: -1 })).toThrow();
  });
});

describe('defaultChatConfig', () => {
  it('is a valid config', () => {
    expect(() => ChatConfigSchema.parse(defaultChatConfig)).not.toThrow();
  });
});
