import { writeFile, readFile } from 'node:fs/promises';
import { BeastContext, type AuditEntry } from '../context/franken-context.js';
import type { BeastPhase } from '../types.js';
import type { PlanGraph } from '../deps.js';
import type { TokenSpend } from '@franken/core';

/** Serializable snapshot of a BeastContext. */
export interface ContextSnapshot {
  readonly projectId: string;
  readonly sessionId: string;
  readonly userInput: string;
  readonly phase: BeastPhase;
  readonly sanitizedIntent?: {
    goal: string;
    strategy?: string | undefined;
    context?: Record<string, unknown> | undefined;
  } | undefined;
  readonly plan?: PlanGraph | undefined;
  readonly tokenSpend: TokenSpend;
  readonly audit: readonly AuditEntry[];
  readonly savedAt: string;
}

/** Serialize a BeastContext to a JSON snapshot. */
export function serializeContext(ctx: BeastContext): ContextSnapshot {
  return {
    projectId: ctx.projectId,
    sessionId: ctx.sessionId,
    userInput: ctx.userInput,
    phase: ctx.phase,
    sanitizedIntent: ctx.sanitizedIntent,
    plan: ctx.plan,
    tokenSpend: ctx.tokenSpend,
    audit: ctx.audit,
    savedAt: new Date().toISOString(),
  };
}

/** Restore a BeastContext from a snapshot. */
export function deserializeContext(snapshot: ContextSnapshot): BeastContext {
  const ctx = new BeastContext(snapshot.projectId, snapshot.sessionId, snapshot.userInput);
  ctx.phase = snapshot.phase;
  ctx.sanitizedIntent = snapshot.sanitizedIntent;
  ctx.plan = snapshot.plan;
  ctx.tokenSpend = snapshot.tokenSpend;

  for (const entry of snapshot.audit) {
    ctx.audit.push(entry);
  }

  return ctx;
}

/** Save context snapshot to a file. */
export async function saveContext(ctx: BeastContext, filePath: string): Promise<void> {
  const snapshot = serializeContext(ctx);
  await writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
}

/** Load context snapshot from a file. */
export async function loadContext(filePath: string): Promise<BeastContext> {
  const raw = await readFile(filePath, 'utf-8');
  const snapshot: ContextSnapshot = JSON.parse(raw);
  return deserializeContext(snapshot);
}
