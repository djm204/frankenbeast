#!/usr/bin/env node

const scenarios = new Map([
  [
    'provider-outage',
    {
      scenario: 'provider-outage',
      safety: {
        mode: 'fixture-only',
        mutatesState: false,
        note: 'Deterministic drill fixture; does not read credentials, call providers, start workers, or write files.',
      },
      events: [
        {
          type: 'provider_outage_declared',
          provider: 'primary',
          evidence: 'rate-limit-or-outage-signal',
          expectedOperatorAction: 'name incident commander and freeze unsafe mutations',
        },
        {
          type: 'fresh_start_freeze',
          parkedWork: ['fresh-issues', 'merges', 'force-pushes', 'approval-replay', 'broad-worker-respawns'],
          allowedWork: ['read-only-inventory', 'existing-owner-status-polling'],
        },
        {
          type: 'fallback_only_mode',
          laneWidth: 5,
          allowedLanes: ['triage', 'documentation', 'status-summary', 'checkpointed-closeout'],
          disallowedLanes: ['fresh-implementation-without-checkpoint', 'real-codex-gate-substitution', 'production-mutation'],
        },
        {
          type: 'backlog_routes',
          routes: [
            { issue: 101, checkpoint: 'dirty-worktree', route: 'resume-checkpointed' },
            { issue: 102, checkpoint: 'tests-green-pr-open', route: 'complete-checkpointed' },
            { issue: 103, checkpoint: 'none', route: 'defer-fresh-start' },
          ],
        },
      ],
      expectedLivenessLines: [
        '[provider] primary outage declared: evidence=rate-limit-or-outage-signal',
        '[issues] fresh-start freeze active: reason=primary-provider-outage',
        '[fallback] fallback-only lanes active: width=5 lanes=triage,documentation,status-summary,checkpointed-closeout',
        '[issues] route issue #103: defer-fresh-start until recovery probe passes',
      ],
      failureInterpretations: [
        'Fresh starts during freeze indicate backlog-starvation risk.',
        'Two owners for one issue indicate active-owner detection failure.',
        'Local/self-review substituted for a real Codex gate indicates unsafe gate bypass.',
        'Missing retry clock or provider evidence makes recovery decisions unauditable.',
      ],
    },
  ],
  [
    'fallback-paths',
    {
      scenario: 'fallback-paths',
      safety: {
        mode: 'fixture-only',
        mutatesState: false,
        liveProviderCalls: false,
        note: 'Deterministic fallback-path drill; uses synthetic provider and budget statuses only.',
      },
      fixtures: [
        {
          name: 'primary-unavailable',
          providerStatus: { primary: 'unavailable', spark: 'available', ollama: 'available' },
          budgetStatus: { sparkRemainingUsd: 12, ollamaFallbackLaneWidth: 5 },
        },
        {
          name: 'spark-budget-exhausted',
          providerStatus: { primary: 'unavailable', spark: 'budget-exhausted', ollama: 'available' },
          budgetStatus: { sparkRemainingUsd: 0, ollamaFallbackLaneWidth: 5 },
        },
        {
          name: 'ollama-only-continuity',
          providerStatus: { primary: 'unavailable', spark: 'budget-exhausted', ollama: 'available' },
          budgetStatus: { sparkRemainingUsd: 0, ollamaFallbackLaneWidth: 5 },
          lowRiskScope: ['read-only-inventory', 'docs-only-updates', 'status-summary', 'checkpointed-closeout-only'],
        },
        {
          name: 'primary-restored',
          providerStatus: { primary: 'available', spark: 'budget-exhausted', ollama: 'draining' },
          budgetStatus: { sparkRemainingUsd: 0, ollamaFallbackLaneWidth: 0 },
        },
      ],
      transitions: [
        {
          from: 'normal-primary-refill',
          to: 'provider-outage-freeze',
          trigger: 'primary unavailable',
          route: 'park-fresh-work',
          parkedBacklog: ['fresh-issue-starts', 'unsafe-merge-gates'],
          workerCounts: { primary: 0, spark: 5, ollama: 0, parked: 7 },
        },
        {
          from: 'spark-fallback-refill',
          to: 'spark-budget-freeze',
          trigger: 'Spark budget exhausted',
          route: 'keep-high-risk-parked',
          refillDecision: 'do-not-refill-spark; keep backlog parked',
          workerCounts: { primary: 0, spark: 0, ollama: 0, parked: 12 },
        },
        {
          from: 'fallback-budget-freeze',
          to: 'ollama-only-continuity',
          trigger: 'Ollama fallback continuity',
          route: 'refill-low-risk-only',
          toolRestrictions: ['read-only-inventory', 'docs-only-updates', 'status-summary', 'checkpointed-closeout-only'],
          workerCounts: { primary: 0, spark: 0, ollama: 5, parked: 12 },
        },
        {
          from: 'ollama-only-continuity',
          to: 'primary-recovery-drain',
          trigger: 'primary restored',
          route: 'resume-primary-before-new-tickets',
          resumeOrdering: [
            'unpark-provider-blocked-active-owners',
            'finish-in-flight-before-fresh-issues',
            'rerun-current-head-gates',
            'restore-primary-refill-after-stability-tick',
          ],
          workerCounts: { primary: 5, spark: 0, ollama: 0, parked: 7 },
        },
      ],
      summaryLines: [
        '[fallback-drill] fixture primary-unavailable => route=park-fresh-work primary=0 spark=5 ollama=0 parked=7',
        '[fallback-drill] fixture spark-budget-exhausted => route=keep-high-risk-parked primary=0 spark=0 ollama=0 parked=12',
        '[fallback-drill] fixture ollama-only-continuity => route=refill-low-risk-only primary=0 spark=0 ollama=5 parked=12 restrictions=read-only-inventory,docs-only-updates,status-summary,checkpointed-closeout-only',
        '[fallback-drill] fixture primary-restored => route=resume-primary-before-new-tickets primary=5 spark=0 ollama=0 parked=7',
      ],
      assertions: [
        'Primary outage parks fresh issue starts and unsafe merge gates.',
        'Spark budget exhaustion does not refill Spark lanes or unpark high-risk backlog.',
        'Ollama-only continuity remains exactly five low-risk lanes with restricted tooling.',
        'Primary recovery resumes provider-blocked active owners before fresh tickets.',
      ],
    },
  ],
  [
    'recovery',
    {
      scenario: 'recovery',
      safety: {
        mode: 'fixture-only',
        mutatesState: false,
        note: 'Deterministic recovery fixture; use it to compare expected resume ordering before live traffic resumes.',
      },
      events: [
        {
          type: 'recovery_probe_started',
          provider: 'primary',
          evidence: 'quota-reset-or-provider-status-healthy',
          owner: 'gate-operator',
        },
        {
          type: 'recovery_probe_passed',
          requiredFollowup: 'capture second healthy signal before broad refill',
        },
        {
          type: 'resume_order',
          steps: [
            'keep fresh-start freeze while second health signal is captured',
            'unpark existing active owners blocked only on provider availability',
            'finish or harden in-flight backlog before fresh issues',
            'rerun stale current-head review gates before merge',
            'drain fallback-only lanes to a safe checkpoint and stop refilling them',
            're-enable fresh issue refill at reduced width for one liveness tick',
            'restore normal refill after backlog/provider/gate stability holds',
          ],
        },
        {
          type: 'normal_refill_restored',
          condition: 'second-health-signal-and-backlog-stable',
        },
      ],
      expectedLivenessLines: [
        '[provider] recovery probe started: provider=primary evidence=quota-reset-or-provider-status-healthy',
        '[provider] recovery probe passed: waiting for second healthy signal',
        '[issues] resume order: in-flight backlog before fresh refill',
        '[issues] normal refill restored: condition=second-health-signal-and-backlog-stable',
      ],
      failureInterpretations: [
        'Broad refill before the second health signal indicates aggressive resume ordering.',
        'Fresh starts before in-flight closeout indicate backlog starvation.',
        'Killing fallback lanes without checkpoint handoff risks losing sandbox work.',
        'Reusing stale review gates after a head change makes merge readiness unsafe.',
      ],
    },
  ],
]);

function usage() {
  return `Usage: node scripts/provider-outage-drill-fixture.mjs --scenario <provider-outage|fallback-paths|recovery>`;
}

const args = process.argv.slice(2);
const scenarioArgIndex = args.indexOf('--scenario');
const scenario = scenarioArgIndex >= 0 ? args[scenarioArgIndex + 1] : 'provider-outage';

if (!scenarios.has(scenario)) {
  console.error(`${usage()}\nUnknown scenario: ${scenario ?? '<missing>'}`);
  process.exitCode = 1;
} else {
  console.log(`${JSON.stringify(scenarios.get(scenario), null, 2)}\n`);
}
