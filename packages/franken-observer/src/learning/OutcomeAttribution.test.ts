import { describe, expect, it } from 'vitest'
import { OutcomeAttribution } from './OutcomeAttribution.js'

describe('OutcomeAttribution', () => {
  it('joins routing decision records to merge outcomes without retaining raw prompts', () => {
    const attribution = new OutcomeAttribution()

    const decision = attribution.recordDecision({
      workflowId: 'issue-1693',
      decisionType: 'model-routing',
      contextSummary: 'Need a low-risk observer feature with tests',
      chosenAction: 'use gpt-5.3-codex-spark for implementation',
      alternatives: ['wait for gpt-5.5 quota', 'use Ollama Cloud fallback'],
      timestamp: '2026-07-16T18:00:00.000Z',
      metadata: {
        rawPrompt: 'DO NOT STORE: user secret token abc123',
        token: 'abc123',
        safeSignal: 'P2 feature',
      },
    })

    attribution.recordOutcome({
      decisionId: decision.decisionId,
      workflowId: 'issue-1693',
      verification: 'CI green and current-head Codex clean',
      prState: 'merged',
      issueState: 'closed',
      elapsedMs: 3_600_000,
      blockers: [],
      rollback: false,
      failure: false,
      timestamp: '2026-07-16T19:00:00.000Z',
    })

    expect(attribution.joinedOutcomes()).toEqual([
      expect.objectContaining({
        workflowId: 'issue-1693',
        decisionType: 'model-routing',
        chosenAction: 'use gpt-5.3-codex-spark for implementation',
        verification: 'CI green and current-head Codex clean',
        prState: 'merged',
        issueState: 'closed',
        elapsedMs: 3_600_000,
        blockerCount: 0,
        rollback: false,
        failure: false,
        success: true,
      }),
    ])
    expect(attribution.decisions()[0]!.metadata).toEqual({ safeSignal: 'P2 feature' })
    expect(JSON.stringify(attribution.decisions())).not.toContain('DO NOT STORE')
    expect(JSON.stringify(attribution.decisions())).not.toContain('abc123')
  })

  it('joins delegation decisions to blocked outcomes and reports workflow quality signals', () => {
    const attribution = new OutcomeAttribution()

    const routing = attribution.recordDecision({
      workflowId: 'issue-1693',
      decisionType: 'worker-delegation',
      contextSummary: 'Feature implementation needs observer package changes',
      chosenAction: 'assign one fresh issue worker',
      timestamp: '2026-07-16T18:10:00.000Z',
    })
    const review = attribution.recordDecision({
      workflowId: 'issue-1693',
      decisionType: 'review-gate',
      contextSummary: 'PR needs real Codex connector before merge',
      chosenAction: 'trigger @codex review',
      alternatives: ['manual-review fallback'],
      timestamp: '2026-07-16T18:20:00.000Z',
    })

    attribution.recordOutcome({
      decisionId: routing.decisionId,
      workflowId: 'issue-1693',
      verification: 'PR opened',
      prState: 'open',
      issueState: 'open',
      elapsedMs: 1_200_000,
      blockers: [],
      rollback: false,
      failure: false,
      timestamp: '2026-07-16T18:30:00.000Z',
    })
    attribution.recordOutcome({
      decisionId: review.decisionId,
      workflowId: 'issue-1693',
      verification: 'Codex usage limit response',
      prState: 'open',
      issueState: 'open',
      elapsedMs: 600_000,
      blockers: ['codex-usage-limit'],
      rollback: false,
      failure: false,
      timestamp: '2026-07-16T18:35:00.000Z',
    })

    expect(attribution.joinedOutcomes()).toEqual([
      expect.objectContaining({ decisionId: routing.decisionId, success: true, blockerCount: 0 }),
      expect.objectContaining({ decisionId: review.decisionId, success: false, blockerCount: 1 }),
    ])
    expect(attribution.reportByWorkflow()).toEqual([
      {
        workflowId: 'issue-1693',
        decisionCount: 2,
        attributedOutcomeCount: 2,
        successfulOutcomeCount: 1,
        blockerCount: 1,
        rollbackCount: 0,
        failureCount: 0,
        totalElapsedMs: 1_800_000,
      },
    ])
  })

  it('recursively drops nested prompt and secret metadata keys', () => {
    const attribution = new OutcomeAttribution()

    attribution.recordDecision({
      workflowId: 'issue-1693',
      decisionType: 'tool-choice',
      contextSummary: 'Need a safe query helper',
      chosenAction: 'capture summaries only',
      metadata: {
        payload: {
          rawPrompt: 'DO NOT STORE nested prompt',
          nested: { token: 'nested-token', safeNestedSignal: 'ok' },
        },
        safeTopLevel: 'kept',
      },
    })

    expect(attribution.decisions()[0]!.metadata).toEqual({
      payload: { nested: { safeNestedSignal: 'ok' } },
      safeTopLevel: 'kept',
    })
    expect(JSON.stringify(attribution.decisions())).not.toContain('DO NOT STORE')
    expect(JSON.stringify(attribution.decisions())).not.toContain('nested-token')
  })

  it('rejects outcome workflow ids that do not match the decision workflow', () => {
    const attribution = new OutcomeAttribution()
    const decision = attribution.recordDecision({
      workflowId: 'issue-1693',
      decisionType: 'review-gate',
      contextSummary: 'PR needs review',
      chosenAction: 'trigger Codex',
    })

    expect(() =>
      attribution.recordOutcome({
        decisionId: decision.decisionId,
        workflowId: 'issue-9999',
        verification: 'wrong workflow',
        prState: 'open',
        issueState: 'open',
        elapsedMs: 1,
      }),
    ).toThrow(/workflowId issue-9999 does not match decision workflowId issue-1693/)
  })

  it.each([
    ['closed PR', { prState: 'closed' as const, issueState: 'open' as const }],
    ['not-planned issue', { prState: 'none' as const, issueState: 'not-planned' as const }],
  ])('counts %s terminal outcomes as unsuccessful by default', (_name, state) => {
    const attribution = new OutcomeAttribution()
    const decision = attribution.recordDecision({
      workflowId: 'issue-1693',
      decisionType: 'scope-choice',
      contextSummary: 'Decide whether to continue',
      chosenAction: 'stop work',
    })

    attribution.recordOutcome({
      decisionId: decision.decisionId,
      workflowId: 'issue-1693',
      verification: 'terminal without merge',
      prState: state.prState,
      issueState: state.issueState,
      elapsedMs: 5,
    })

    expect(attribution.joinedOutcomes()[0]!.success).toBe(false)
    expect(attribution.reportByWorkflow()[0]!.successfulOutcomeCount).toBe(0)
  })

  it.each([
    ['bad PR state', { prState: 'merge', issueState: 'open' }],
    ['bad issue state', { prState: 'open', issueState: 'done' }],
  ])('rejects invalid runtime state values for %s', (_name, state) => {
    const attribution = new OutcomeAttribution()
    const decision = attribution.recordDecision({
      workflowId: 'issue-1693',
      decisionType: 'state-validation',
      contextSummary: 'Validate JS callers',
      chosenAction: 'reject invalid states',
    })

    expect(() =>
      attribution.recordOutcome({
        decisionId: decision.decisionId,
        workflowId: 'issue-1693',
        verification: 'invalid state',
        prState: state.prState as never,
        issueState: state.issueState as never,
        elapsedMs: 1,
      }),
    ).toThrow(/must be one of/)
  })
})
