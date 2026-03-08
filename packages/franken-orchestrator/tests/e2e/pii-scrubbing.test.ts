import { describe, it, expect } from 'vitest';
import { createTestOrchestrator } from '../helpers/test-orchestrator-factory.js';
import type { BeastInput } from '../../src/types.js';

describe('E2E: PII scrubbing', () => {
  it('redacts SSN from user input before reaching planner', async () => {
    const input: BeastInput = {
      projectId: 'pii-test',
      userInput: 'Process user John with SSN 123-45-6789',
    };

    const { loop, ports } = createTestOrchestrator();
    const result = await loop.run(input);

    expect(result.status).toBe('completed');

    // Planner should receive sanitized text without raw SSN
    const intent = ports.planner.intents[0]!;
    expect(intent.goal).not.toContain('123-45-6789');
    expect(intent.goal).toContain('[REDACTED]');
  });

  it('redacts email addresses from user input', async () => {
    const input: BeastInput = {
      projectId: 'pii-test',
      userInput: 'Send report to alice@example.com',
    };

    const { loop, ports } = createTestOrchestrator();
    const result = await loop.run(input);

    expect(result.status).toBe('completed');

    const intent = ports.planner.intents[0]!;
    expect(intent.goal).not.toContain('alice@example.com');
    expect(intent.goal).toContain('[REDACTED]');
  });

  it('allows clean input through unmodified', async () => {
    const cleanInput = 'Refactor the database module';
    const input: BeastInput = {
      projectId: 'pii-test',
      userInput: cleanInput,
    };

    const { loop, ports } = createTestOrchestrator();
    await loop.run(input);

    const intent = ports.planner.intents[0]!;
    expect(intent.goal).toBe(cleanInput);
  });

  it('handles input with multiple PII types', async () => {
    const input: BeastInput = {
      projectId: 'pii-test',
      userInput: 'User 123-45-6789 email bob@corp.io needs access',
    };

    const { loop, ports } = createTestOrchestrator();
    await loop.run(input);

    const intent = ports.planner.intents[0]!;
    expect(intent.goal).not.toContain('123-45-6789');
    expect(intent.goal).not.toContain('bob@corp.io');
    expect(intent.goal).toContain('[REDACTED]');
  });
});
