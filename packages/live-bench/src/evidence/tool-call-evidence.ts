import { z } from 'zod';
import type { ToolCallEvidence } from '../types.js';

export const ToolCallEvidenceSchema: z.ZodType<ToolCallEvidence> = z.object({
  id: z.string().min(1),
  tool: z.string().min(1),
  params: z.record(z.unknown()),
  source: z.enum(['client', 'mcp-proxy', 'fbeast-proxy', 'adapter']),
  startedAt: z.string().datetime({ offset: true }).optional(),
  completedAt: z.string().datetime({ offset: true }).optional(),
  ok: z.boolean().optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
}).strict();

export const ToolCallEvidenceManifestSchema = z.array(ToolCallEvidenceSchema);

export function serializeToolCallEvidence(evidence: readonly ToolCallEvidence[]): string {
  return `${JSON.stringify(ToolCallEvidenceManifestSchema.parse(evidence), null, 2)}\n`;
}
