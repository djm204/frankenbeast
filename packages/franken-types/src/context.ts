import type { TokenSpend } from './token.js';

/**
 * The mutable context object that flows through the Beast Loop.
 * Each phase reads and writes to this shared state.
 */
export interface FrankenContext {
  projectId: string;
  sessionId: string;
  userInput: string;
  sanitizedIntent?: {
    goal: string;
    strategy?: string;
    context?: Record<string, unknown>;
  };
  plan?: unknown; // PlanGraph is module-specific
  tokenSpend: TokenSpend;
  audit: Array<{
    timestamp: string;
    module: string;
    action: string;
    detail: unknown;
  }>;
  phase: 'ingestion' | 'planning' | 'execution' | 'closure';
}
