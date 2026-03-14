import type { CacheScope } from './llm-cache-types.js';
import { createPromptFingerprint } from './prompt-fingerprint.js';

export interface CacheablePromptRequest {
  scope: CacheScope;
  operation: string;
  stablePrefix?: string | undefined;
  workPrefix?: string | undefined;
  volatileSuffix: string;
}

export interface CacheComputation {
  stableText: string;
  workText: string;
  volatileText: string;
  fullPrompt: string;
  projectStableKey?: string | undefined;
  workKey?: string | undefined;
  responseKey: string;
  sessionFingerprint: string;
}

function normalizeSegment(input: string | undefined): string {
  return (input ?? '').replace(/\r\n/g, '\n').trim();
}

function joinNonEmpty(parts: string[]): string {
  return parts.filter((part) => part.length > 0).join('\n\n');
}

export class LlmCachePolicy {
  buildRequest(input: CacheablePromptRequest): CacheComputation {
    const stableText = normalizeSegment(input.stablePrefix);
    const workText = normalizeSegment(input.workPrefix);
    const volatileText = normalizeSegment(input.volatileSuffix);

    const sessionBase = joinNonEmpty([stableText, workText]);
    const fullPrompt = joinNonEmpty([stableText, workText, volatileText]);
    const sessionFingerprint = createPromptFingerprint(sessionBase);
    const responseFingerprint = createPromptFingerprint(fullPrompt);

    return {
      stableText,
      workText,
      volatileText,
      fullPrompt,
      sessionFingerprint,
      projectStableKey: stableText.length > 0
        ? `stable:${createPromptFingerprint(stableText)}`
        : undefined,
      workKey: workText.length > 0 && input.scope.workId
        ? `work:${input.scope.workId}:${createPromptFingerprint(workText)}`
        : undefined,
      responseKey: `response:${input.operation}:${responseFingerprint}`,
    };
  }
}
