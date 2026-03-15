import { describe, expect, it } from 'vitest';
import { LlmCachePolicy } from '../../../src/cache/llm-cache-policy.js';

describe('LlmCachePolicy', () => {
  it('classifies prompt layers deterministically', () => {
    const policy = new LlmCachePolicy();
    const input = {
      scope: {
        projectId: 'frankenbeast',
        workId: 'issue:99',
      },
      operation: 'issue-triage',
      stablePrefix: 'skill injection',
      workPrefix: 'issue 99 summary',
      volatileSuffix: 'new comment text',
    };

    const first = policy.buildRequest(input);
    const second = policy.buildRequest(input);

    expect(first.projectStableKey).toBe(second.projectStableKey);
    expect(first.workKey).toBe(second.workKey);
    expect(first.responseKey).toBe(second.responseKey);
    expect(first.fullPrompt).toBe(second.fullPrompt);
  });

  it('reuses project-stable identity across work scopes while keeping work keys distinct', () => {
    const policy = new LlmCachePolicy();

    const issue99 = policy.buildRequest({
      scope: {
        projectId: 'frankenbeast',
        workId: 'issue:99',
      },
      operation: 'issue-triage',
      stablePrefix: 'skill injection',
      workPrefix: 'issue 99 summary',
      volatileSuffix: 'new comment text',
    });

    const issue110 = policy.buildRequest({
      scope: {
        projectId: 'frankenbeast',
        workId: 'issue:110',
      },
      operation: 'issue-triage',
      stablePrefix: 'skill injection',
      workPrefix: 'issue 110 summary',
      volatileSuffix: 'new comment text',
    });

    expect(issue99.projectStableKey).toBe(issue110.projectStableKey);
    expect(issue99.workKey).not.toBe(issue110.workKey);
    expect(issue99.responseKey).not.toBe(issue110.responseKey);
  });
});
