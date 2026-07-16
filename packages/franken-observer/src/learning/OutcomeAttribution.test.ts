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
})
