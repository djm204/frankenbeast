import { ReflectionResultSchema, type ReflectionResult } from '../core/types.js';
import type { Result } from './types.js';

const JSON_CODE_BLOCK_RE = /```(?:json)?\s*\n?([\s\S]*?)\n?```/;

function extractJson(raw: string): string {
  const match = JSON_CODE_BLOCK_RE.exec(raw);
  return match?.[1] ?? raw;
}

export function parseReflectionResponse(raw: string): Result<ReflectionResult> {
  try {
    const jsonStr = extractJson(raw.trim());
    const parsed: unknown = JSON.parse(jsonStr);
    const validated = ReflectionResultSchema.safeParse(parsed);

    if (!validated.success) {
      return { ok: false, error: new Error(`Schema validation failed: ${String(validated.error)}`) };
    }

    return { ok: true, value: validated.data };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown parse error';
    return { ok: false, error: new Error(`Failed to parse LLM response: ${message}`) };
  }
}
