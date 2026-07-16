import { randomUUID } from 'node:crypto'

export type DecisionOutcomePrState = 'none' | 'draft' | 'open' | 'merged' | 'closed'
export type DecisionOutcomeIssueState = 'open' | 'closed' | 'not-planned' | 'unknown'

export interface AgentDecisionRecordInput {
  workflowId: string
  decisionType: string
  contextSummary: string
  chosenAction: string
  alternatives?: readonly string[]
  timestamp?: string
  metadata?: Record<string, unknown>
}

export interface AgentDecisionRecord {
  decisionId: string
  workflowId: string
  decisionType: string
  contextSummary: string
  chosenAction: string
  alternatives: readonly string[]
  timestamp: string
  metadata?: Readonly<Record<string, unknown>>
}

export interface DecisionOutcomeRecordInput {
  decisionId: string
  workflowId: string
  verification: string
  prState: DecisionOutcomePrState
  issueState: DecisionOutcomeIssueState
  elapsedMs: number
  blockers?: readonly string[]
  rollback?: boolean
  failure?: boolean
  timestamp?: string
}

export interface DecisionOutcomeRecord {
  outcomeId: string
  decisionId: string
  workflowId: string
  verification: string
  prState: DecisionOutcomePrState
  issueState: DecisionOutcomeIssueState
  elapsedMs: number
  blockers: readonly string[]
  rollback: boolean
  failure: boolean
  timestamp: string
}

export interface JoinedDecisionOutcome {
  decisionId: string
  outcomeId: string
  workflowId: string
  decisionType: string
  contextSummary: string
  chosenAction: string
  alternatives: readonly string[]
  decidedAt: string
  outcomeAt: string
  verification: string
  prState: DecisionOutcomePrState
  issueState: DecisionOutcomeIssueState
  elapsedMs: number
  blockerCount: number
  rollback: boolean
  failure: boolean
  success: boolean
}

export interface WorkflowOutcomeAttributionReport {
  workflowId: string
  decisionCount: number
  attributedOutcomeCount: number
  successfulOutcomeCount: number
  blockerCount: number
  rollbackCount: number
  failureCount: number
  totalElapsedMs: number
}

const SENSITIVE_METADATA_KEY_PATTERN = /(raw.*prompt|prompt|input|secret|token|password|credential|api[-_]?key)/i
const VALID_PR_STATES = ['none', 'draft', 'open', 'merged', 'closed'] as const
const VALID_ISSUE_STATES = ['open', 'closed', 'not-planned', 'unknown'] as const

function assertNonEmptyString(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new Error(`OutcomeAttribution: ${field} must be a non-empty string`)
  }
}

function assertIsoTimestamp(value: string, field: string): void {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`OutcomeAttribution: ${field} must be an ISO timestamp`)
  }
}

function assertElapsedMs(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`OutcomeAttribution: elapsedMs must be a non-negative safe integer, received ${value}`)
  }
}

function assertOneOf(value: string, field: string, allowed: readonly string[]): void {
  if (!allowed.includes(value)) {
    throw new Error(`OutcomeAttribution: ${field} must be one of ${allowed.join(', ')}, received ${value}`)
  }
}

function defaultTimestamp(): string {
  return new Date().toISOString()
}

function freezeRecord<T extends Record<string, unknown>>(value: T): Readonly<T> {
  return Object.freeze({ ...value })
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(item => sanitizeMetadataValue(item)))
  }

  if (typeof value !== 'object' || value === null) {
    return value
  }

  const sanitized: Record<string, unknown> = {}
  for (const [key, nestedValue] of Object.entries(value)) {
    if (SENSITIVE_METADATA_KEY_PATTERN.test(key)) continue
    sanitized[key] = sanitizeMetadataValue(nestedValue)
  }

  return freezeRecord(sanitized)
}

function sanitizeMetadata(metadata: Record<string, unknown> | undefined): Readonly<Record<string, unknown>> | undefined {
  if (metadata === undefined) return undefined

  const sanitized = sanitizeMetadataValue(metadata) as Readonly<Record<string, unknown>>
  return Object.keys(sanitized).length === 0 ? undefined : sanitized
}

function successfulOutcome(outcome: DecisionOutcomeRecord): boolean {
  return (
    outcome.blockers.length === 0 &&
    !outcome.rollback &&
    !outcome.failure &&
    outcome.prState !== 'closed' &&
    outcome.issueState !== 'not-planned'
  )
}

/**
 * Captures lightweight decision/outcome attribution without storing raw prompts
 * or secret-bearing metadata by default. The records are intentionally compact:
 * callers provide summaries, action labels, state, and verification evidence
 * rather than full transcripts or prompt bodies.
 */
export class OutcomeAttribution {
  private readonly decisionRecords: AgentDecisionRecord[] = []
  private readonly outcomeRecords: DecisionOutcomeRecord[] = []

  recordDecision(input: AgentDecisionRecordInput): AgentDecisionRecord {
    assertNonEmptyString(input.workflowId, 'workflowId')
    assertNonEmptyString(input.decisionType, 'decisionType')
    assertNonEmptyString(input.contextSummary, 'contextSummary')
    assertNonEmptyString(input.chosenAction, 'chosenAction')
    const timestamp = input.timestamp ?? defaultTimestamp()
    assertIsoTimestamp(timestamp, 'timestamp')

    const record: AgentDecisionRecord = Object.freeze({
      decisionId: randomUUID(),
      workflowId: input.workflowId,
      decisionType: input.decisionType,
      contextSummary: input.contextSummary,
      chosenAction: input.chosenAction,
      alternatives: Object.freeze([...(input.alternatives ?? [])]),
      timestamp,
      metadata: sanitizeMetadata(input.metadata),
    })
    this.decisionRecords.push(record)
    return record
  }

  recordOutcome(input: DecisionOutcomeRecordInput): DecisionOutcomeRecord {
    assertNonEmptyString(input.decisionId, 'decisionId')
    assertNonEmptyString(input.workflowId, 'workflowId')
    assertNonEmptyString(input.verification, 'verification')
    assertElapsedMs(input.elapsedMs)
    assertOneOf(input.prState, 'prState', VALID_PR_STATES)
    assertOneOf(input.issueState, 'issueState', VALID_ISSUE_STATES)
    const timestamp = input.timestamp ?? defaultTimestamp()
    assertIsoTimestamp(timestamp, 'timestamp')

    const decision = this.decisionRecords.find(decisionRecord => decisionRecord.decisionId === input.decisionId)
    if (decision === undefined) {
      throw new Error(`OutcomeAttribution: decisionId ${input.decisionId} has not been recorded`)
    }
    if (decision.workflowId !== input.workflowId) {
      throw new Error(
        `OutcomeAttribution: workflowId ${input.workflowId} does not match decision workflowId ${decision.workflowId}`,
      )
    }

    const record: DecisionOutcomeRecord = Object.freeze({
      outcomeId: randomUUID(),
      decisionId: input.decisionId,
      workflowId: input.workflowId,
      verification: input.verification,
      prState: input.prState,
      issueState: input.issueState,
      elapsedMs: input.elapsedMs,
      blockers: Object.freeze([...(input.blockers ?? [])]),
      rollback: input.rollback ?? false,
      failure: input.failure ?? false,
      timestamp,
    })
    this.outcomeRecords.push(record)
    return record
  }

  decisions(): readonly AgentDecisionRecord[] {
    return [...this.decisionRecords]
  }

  outcomes(): readonly DecisionOutcomeRecord[] {
    return [...this.outcomeRecords]
  }

  joinedOutcomes(): JoinedDecisionOutcome[] {
    const decisionsById = new Map(this.decisionRecords.map(decision => [decision.decisionId, decision]))

    return this.outcomeRecords.flatMap(outcome => {
      const decision = decisionsById.get(outcome.decisionId)
      if (decision === undefined) return []
      return [{
        decisionId: decision.decisionId,
        outcomeId: outcome.outcomeId,
        workflowId: decision.workflowId,
        decisionType: decision.decisionType,
        contextSummary: decision.contextSummary,
        chosenAction: decision.chosenAction,
        alternatives: decision.alternatives,
        decidedAt: decision.timestamp,
        outcomeAt: outcome.timestamp,
        verification: outcome.verification,
        prState: outcome.prState,
        issueState: outcome.issueState,
        elapsedMs: outcome.elapsedMs,
        blockerCount: outcome.blockers.length,
        rollback: outcome.rollback,
        failure: outcome.failure,
        success: successfulOutcome(outcome),
      }]
    })
  }

  reportByWorkflow(): WorkflowOutcomeAttributionReport[] {
    const reports = new Map<string, WorkflowOutcomeAttributionReport>()
    for (const decision of this.decisionRecords) {
      reports.set(decision.workflowId, {
        workflowId: decision.workflowId,
        decisionCount: (reports.get(decision.workflowId)?.decisionCount ?? 0) + 1,
        attributedOutcomeCount: reports.get(decision.workflowId)?.attributedOutcomeCount ?? 0,
        successfulOutcomeCount: reports.get(decision.workflowId)?.successfulOutcomeCount ?? 0,
        blockerCount: reports.get(decision.workflowId)?.blockerCount ?? 0,
        rollbackCount: reports.get(decision.workflowId)?.rollbackCount ?? 0,
        failureCount: reports.get(decision.workflowId)?.failureCount ?? 0,
        totalElapsedMs: reports.get(decision.workflowId)?.totalElapsedMs ?? 0,
      })
    }

    for (const joined of this.joinedOutcomes()) {
      const report = reports.get(joined.workflowId) ?? {
        workflowId: joined.workflowId,
        decisionCount: 0,
        attributedOutcomeCount: 0,
        successfulOutcomeCount: 0,
        blockerCount: 0,
        rollbackCount: 0,
        failureCount: 0,
        totalElapsedMs: 0,
      }
      report.attributedOutcomeCount += 1
      report.successfulOutcomeCount += joined.success ? 1 : 0
      report.blockerCount += joined.blockerCount
      report.rollbackCount += joined.rollback ? 1 : 0
      report.failureCount += joined.failure ? 1 : 0
      report.totalElapsedMs += joined.elapsedMs
      reports.set(joined.workflowId, report)
    }

    return Array.from(reports.values())
  }
}
