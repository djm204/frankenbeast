# Chunk 11: Rate Limit Resilience — Provider Fallback + Sleep-Until-Reset

## Objective

Upgrade `RalphLoop` to handle rate limits as a core orchestrator concern: automatic provider fallback (claude → codex), sleep-until-reset when all providers are exhausted, and clean resume without losing iteration progress. Rate limits must never crash the build.

## Files

- **Modify**: `franken-orchestrator/src/skills/ralph-loop.ts` — add provider fallback chain + sleep logic
- **Modify**: `franken-orchestrator/src/skills/cli-types.ts` — add `sleepMs` to `IterationResult`, update `RalphLoopConfig`
- **Create**: `franken-orchestrator/tests/unit/skills/rate-limit-resilience.test.ts`

## Key Reference Files

- `franken-orchestrator/src/skills/ralph-loop.ts` — current RalphLoop with basic `onRateLimit` callback
- `franken-orchestrator/src/skills/cli-types.ts` — `RalphLoopConfig`, `IterationResult`, `isRateLimited()`
- `plan-approach-c/build-runner.ts` lines 233-248, 659-683 — prototype implementation to port

## Design

### Provider Fallback Chain

```
Rate limited on provider A
  → Track A as exhausted, store its stderr for reset time parsing
  → Switch to next provider in config.providers (don't count iteration)
  → If next provider ALSO rate limited:
    → Track as exhausted, store its stderr
    → All providers exhausted:
      → Parse reset time from ALL stored stderrs — use the SHORTEST sleep
        (the first provider to reset is the one we want)
      → If no parseable reset time: fallback to 120s + log warning
      → Sleep until reset
      → Clear exhausted set, reset to original provider
      → Resume loop (don't count iteration)
```

### parseResetTime(stderr)

Extract the **exact** reset time from provider error output. Sleep until that time — no guessing, no optimistic buffers.

```typescript
export function parseResetTime(stderr: string, stdout: string): { sleepSeconds: number; source: string } {
  // Anthropic "retry-after: 30" header
  const retryAfterMatch = stderr.match(/retry.?after:?\s*(\d+)/i);
  if (retryAfterMatch) return { sleepSeconds: parseInt(retryAfterMatch[1], 10), source: 'retry-after header' };

  // "try again in 5 minutes" / "try again in 30 seconds"
  const minutesMatch = stderr.match(/try again in (\d+) minute/i);
  if (minutesMatch) return { sleepSeconds: parseInt(minutesMatch[1], 10) * 60, source: 'minutes pattern' };
  const secondsMatch = stderr.match(/try again in (\d+) second/i);
  if (secondsMatch) return { sleepSeconds: parseInt(secondsMatch[1], 10), source: 'seconds pattern' };

  // "rate limit resets at 2026-03-05T20:15:00Z" or epoch timestamp
  const isoMatch = (stderr + stdout).match(/resets?\s+(?:at\s+)?(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/i);
  if (isoMatch) {
    const resetAt = new Date(isoMatch[1]).getTime();
    const now = Date.now();
    if (resetAt > now) return { sleepSeconds: Math.ceil((resetAt - now) / 1000), source: 'reset-at timestamp' };
  }

  // "x-ratelimit-reset: <epoch>" header
  const epochMatch = stderr.match(/x-ratelimit-reset:\s*(\d{10,13})/i);
  if (epochMatch) {
    const epoch = parseInt(epochMatch[1], 10);
    const resetMs = epoch > 1e12 ? epoch : epoch * 1000;
    const now = Date.now();
    if (resetMs > now) return { sleepSeconds: Math.ceil((resetMs - now) / 1000), source: 'x-ratelimit-reset epoch' };
  }

  // OpenAI / Codex "Please retry after X" or "limit resets in Xs"
  const resetsInMatch = (stderr + stdout).match(/resets?\s+in\s+(\d+)\s*s/i);
  if (resetsInMatch) return { sleepSeconds: parseInt(resetsInMatch[1], 10), source: 'resets-in pattern' };

  // No parseable reset time — return sentinel so caller knows it's a fallback
  return { sleepSeconds: -1, source: 'unknown' };
}
```

When `sleepSeconds === -1` (unparseable), use a conservative fallback of 120s and log a warning that the reset time could not be determined.

### RalphLoopConfig Changes

```typescript
interface RalphLoopConfig {
  // existing fields...
  providers?: ('claude' | 'codex')[];  // default: ['claude', 'codex'] — fallback order
  onSleep?: (durationMs: number, source: string) => void; // fires before sleeping with parsed duration + source
}
```

### IterationResult Changes

```typescript
interface IterationResult {
  // existing fields...
  sleepMs: number; // 0 when no sleep occurred, >0 when rate limit caused a sleep
}
```

### RalphLoop Internal Changes

1. Replace `onRateLimit` callback pattern with internal provider tracking
2. Maintain `exhaustedProviders: Set<string>` inside the loop
3. Store stderr per exhausted provider (map, not just set) for reset time extraction
4. On rate limit detection:
   - Add current provider + stderr to exhausted map
   - If other providers available → switch, `iteration--`, continue
   - If all exhausted → `parseResetTime()` on ALL stored stderrs → pick shortest → sleep → clear map → `iteration--` → continue
5. Keep `onRateLimit` as optional notification callback (non-controlling)
6. `onSleep` callback fires before sleeping with exact duration and source string

## Success Criteria

- [ ] `RalphLoop` automatically switches provider on rate limit without counting iteration
- [ ] `RalphLoop` sleeps when ALL configured providers are exhausted
- [ ] `parseResetTime()` extracts reset time from stderr/stdout — supports: `retry-after: N`, `try again in N minutes/seconds`, ISO timestamps, `x-ratelimit-reset` epoch, `resets in Ns`
- [ ] `parseResetTime()` returns `{ sleepSeconds: -1, source: 'unknown' }` when no pattern matches
- [ ] When all providers exhausted: sleep = shortest parseable reset time across all stderrs
- [ ] When no reset time parseable: fallback to 120s + log warning about unparseable reset
- [ ] Provider exhaustion state (map of provider → stderr) is cleared after sleep completes
- [ ] After sleep, loop resumes with original provider and does NOT count the failed iteration
- [ ] `RalphLoopConfig.providers` defaults to `['claude', 'codex']`
- [ ] `onSleep` callback fires before sleep with exact duration in ms and source string
- [ ] `IterationResult.sleepMs` reports sleep time (0 when no sleep)
- [ ] Single-provider rate limit → switch to other provider, retry immediately
- [ ] Both-provider rate limit → sleep until reset → resume with original provider
- [ ] Existing RalphLoop tests still pass (providers is optional with default)
- [ ] All tests pass: `cd franken-orchestrator && npx vitest run && npx tsc --noEmit`

## Verification Command

```bash
cd franken-orchestrator && npx vitest run && npx tsc --noEmit
```

## Hardening Requirements

- `providers` defaults to `['claude', 'codex']` — existing callers must not break
- Keep backward compatibility with existing `onRateLimit` callback (emit it as notification, but don't use return value for control)
- `parseResetTime()` must be exported for unit testing
- Sleep duration comes from the API response, NOT arbitrary buffers — if the API says "retry after 30s", sleep 30s
- When reset time is unparseable, use 120s fallback and log a warning with the raw stderr so the user can see what the API said
- When multiple providers are exhausted, pick the shortest sleep (first provider to reset = first to retry)
- Sleep must be interruptible via abort signal (if `RalphLoopConfig` has one) — don't block SIGINT
- Do NOT add external dependencies — use `setTimeout` wrapped in a Promise
- Use `.js` extensions in all import paths (NodeNext)
- Tests must not actually sleep — inject a sleep function for testability
