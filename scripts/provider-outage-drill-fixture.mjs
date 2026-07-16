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
  return `Usage: node scripts/provider-outage-drill-fixture.mjs --scenario <provider-outage|recovery>`;
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
