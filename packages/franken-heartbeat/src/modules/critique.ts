/**
 * MOD-06 (Self-Critique) contract — what MOD-08 requires from the critique system.
 */

import type { ReflectionResult } from '../core/types.js';

export interface AuditResult {
  readonly passed: boolean;
  readonly reason: string;
  readonly flaggedItems: readonly string[];
}

export interface ICritiqueModule {
  auditConclusions(reflection: ReflectionResult): Promise<AuditResult>;
}
