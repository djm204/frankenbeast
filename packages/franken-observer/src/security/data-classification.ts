import type { Trace } from '../core/types.js'
import type { ExportAdapter, TraceSummary } from '../export/ExportAdapter.js'
import { warnIfTraceHasActiveSpans } from '../export/ExportAdapter.js'

export type DataClassification = 'public' | 'internal' | 'sensitive' | 'secret' | 'user-private'

export type RuntimeArtifactType =
  | 'log'
  | 'memory'
  | 'backup'
  | 'export'
  | 'prompt'
  | 'webhook'
  | 'trace'
  | 'audit-trail'
  | 'post-mortem'

export interface RuntimeArtifactClassification {
  readonly artifactType: RuntimeArtifactType
  readonly classification: DataClassification
  readonly rationale: string
  readonly defaultControls: readonly string[]
}

export interface RuntimeArtifactExportPolicyOptions {
  /** True when a caller already stripped or masked secret/private payload fields. */
  readonly redactionApplied?: boolean
  /**
   * Explicit operator override for controlled incident response or migration jobs.
   * Callers should record the reason in their own audit trail.
   */
  readonly allowSensitiveExportOverride?: boolean
  /** Optional human-readable destination for error messages and audit records. */
  readonly destination?: string
}

export interface ClassificationGuardAdapterOptions extends RuntimeArtifactExportPolicyOptions {
  readonly adapter: ExportAdapter
  readonly artifactType?: RuntimeArtifactType
  readonly classification?: DataClassification
}

const CLASSIFICATION_RANK: Record<DataClassification, number> = {
  public: 0,
  internal: 1,
  sensitive: 2,
  secret: 3,
  'user-private': 3,
}

export const RUNTIME_ARTIFACT_CLASSIFICATIONS: Readonly<Record<RuntimeArtifactType, RuntimeArtifactClassification>> = {
  log: {
    artifactType: 'log',
    classification: 'sensitive',
    rationale: 'Logs can include prompts, tool arguments, URLs, stack traces, and operator/user identifiers.',
    defaultControls: ['redact credentials and private user text before external export', 'retain only for operational need'],
  },
  memory: {
    artifactType: 'memory',
    classification: 'user-private',
    rationale: 'Memory stores durable user preferences, environment facts, and potentially personal or tenant-scoped data.',
    defaultControls: ['local/private storage by default', 'redact or require explicit override before export'],
  },
  backup: {
    artifactType: 'backup',
    classification: 'secret',
    rationale: 'Backups can bundle config, credentials, approvals, memory, cron jobs, and historical runtime artifacts.',
    defaultControls: ['encrypt at rest', 'do not share externally without explicit operator override'],
  },
  export: {
    artifactType: 'export',
    classification: 'sensitive',
    rationale: 'Generic exports are cross-boundary copies and may contain traces, prompts, costs, metadata, or audit details.',
    defaultControls: ['apply destination-specific redaction', 'audit destination and purpose'],
  },
  prompt: {
    artifactType: 'prompt',
    classification: 'user-private',
    rationale: 'Prompts frequently contain user requests, private context, retrieved content, and hidden operator intent.',
    defaultControls: ['avoid external export unless redacted', 'strip secrets and private user text'],
  },
  webhook: {
    artifactType: 'webhook',
    classification: 'sensitive',
    rationale: 'Webhook payloads leave the process boundary and often include incident, spend, trace, or approval context.',
    defaultControls: ['allowlist destinations', 'redact echoed credentials and high-sensitivity payloads'],
  },
  trace: {
    artifactType: 'trace',
    classification: 'sensitive',
    rationale: 'Observer traces contain goals, span metadata, errors, and thought-block placeholders from runtime execution.',
    defaultControls: ['redact span metadata/thought blocks before external export', 'warn on active spans'],
  },
  'audit-trail': {
    artifactType: 'audit-trail',
    classification: 'sensitive',
    rationale: 'Audit trails include execution decisions and references needed for accountability.',
    defaultControls: ['append-only storage', 'share only the minimum necessary fields'],
  },
  'post-mortem': {
    artifactType: 'post-mortem',
    classification: 'sensitive',
    rationale: 'Post-mortems can contain trace goals, failures, operator decisions, and diagnostic details.',
    defaultControls: ['sanitize filenames', 'redact before external publication'],
  },
}

export function classifyRuntimeArtifact(artifactType: RuntimeArtifactType): RuntimeArtifactClassification {
  return RUNTIME_ARTIFACT_CLASSIFICATIONS[artifactType]
}

export function isHighSensitivityClassification(classification: DataClassification): boolean {
  return classification === 'secret' || classification === 'user-private'
}

export function classificationAtLeast(
  classification: DataClassification,
  minimum: DataClassification,
): boolean {
  return CLASSIFICATION_RANK[classification] >= CLASSIFICATION_RANK[minimum]
}

export function enforceRuntimeArtifactExportPolicy(
  artifact: RuntimeArtifactClassification,
  options: RuntimeArtifactExportPolicyOptions = {},
): void {
  if (!isHighSensitivityClassification(artifact.classification)) {
    return
  }

  if (options.redactionApplied || options.allowSensitiveExportOverride) {
    return
  }

  const destination = options.destination ? ` to ${options.destination}` : ''
  throw new Error(
    `Refusing to export ${artifact.classification} ${artifact.artifactType} artifact${destination} without redaction or explicit override`,
  )
}

export class ClassificationGuardAdapter implements ExportAdapter {
  private readonly inner: ExportAdapter
  private readonly artifact: RuntimeArtifactClassification
  private readonly policyOptions: RuntimeArtifactExportPolicyOptions

  constructor(options: ClassificationGuardAdapterOptions) {
    this.inner = options.adapter
    this.artifact = options.classification
      ? {
          ...classifyRuntimeArtifact(options.artifactType ?? 'trace'),
          classification: options.classification,
        }
      : classifyRuntimeArtifact(options.artifactType ?? 'trace')
    this.policyOptions = {
      redactionApplied: options.redactionApplied,
      allowSensitiveExportOverride: options.allowSensitiveExportOverride,
      destination: options.destination,
    }
  }

  async flush(trace: Trace): Promise<void> {
    warnIfTraceHasActiveSpans(trace, 'ClassificationGuardAdapter')
    enforceRuntimeArtifactExportPolicy(this.artifact, this.policyOptions)
    await this.inner.flush(trace)
  }

  async queryByTraceId(traceId: string): Promise<Trace | null> {
    return this.inner.queryByTraceId(traceId)
  }

  async listTraceIds(): Promise<string[]> {
    return this.inner.listTraceIds()
  }

  async listTraceSummaries(): Promise<TraceSummary[]> {
    if (!this.inner.listTraceSummaries) {
      const ids = await this.inner.listTraceIds()
      const summaries: TraceSummary[] = []
      for (const id of ids) {
        const trace = await this.inner.queryByTraceId(id)
        if (!trace) continue
        summaries.push({
          id: trace.id,
          goal: trace.goal,
          status: trace.status,
          spanCount: trace.spans.length,
          startedAt: trace.startedAt,
        })
      }
      return summaries
    }
    return this.inner.listTraceSummaries()
  }
}
