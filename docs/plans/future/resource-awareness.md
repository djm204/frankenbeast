# Future Enhancement: Resource Awareness + Container Executor

**Date:** 2026-03-16
**Status:** Documented for future implementation
**Prerequisite:** Plan 2 (Management) must be complete

---

## Problem

Plan 2 introduces concurrency limits (max N agents) and git worktree isolation, but has no awareness of actual resource consumption. Five agents running complex planning + execution could exhaust CPU, memory, or API rate limits without any feedback.

## Proposed Design

### Resource Monitoring

**Per-agent resource tracking:**

```typescript
interface AgentResourceSnapshot {
  pid: number;
  cpuPercent: number;       // from /proc/<pid>/stat or ps
  memoryMb: number;         // RSS from /proc/<pid>/status
  diskUsageMb: number;      // worktree size
  openFileDescriptors: number;
  lastUpdated: string;
}
```

- `HealthMonitor` (from Plan 2 Section 4) extended to collect resource snapshots every 30s alongside liveness checks
- Snapshots stored in a rolling buffer (last 60 entries per agent = 30 min history)
- Exposed via `GET /v1/beasts/agents/:id/resources` and included in SSE as `agent.resources` events

**System-level awareness:**

```typescript
interface SystemResourceSnapshot {
  totalMemoryMb: number;
  availableMemoryMb: number;
  cpuCount: number;
  loadAverage: [number, number, number];
  diskFreeMb: number;
}
```

- Daemon tracks system resources alongside agent resources
- `GET /v1/beasts/system/resources` endpoint

### Resource Budgeting

**Per-agent resource limits (soft):**

```typescript
interface ResourceBudget {
  maxMemoryMb?: number;    // warn at 80%, stop at 100%
  maxDiskMb?: number;      // warn at 80%, stop at 100%
  maxDurationMs?: number;  // hard timeout
}
```

- Configurable per definition or per agent at create time
- Soft limits: warning event at 80%, auto-stop at 100%
- Hard timeout: `SIGTERM` after max duration, `SIGKILL` after grace period
- Events: `agent.resource.warning`, `agent.resource.exceeded`

**System-level admission control:**

Before spawning a new agent, check system resources:
- Reject if available memory < 512MB (configurable)
- Reject if load average > CPU count * 2
- Error message: `"Insufficient system resources. Available memory: 384MB (minimum: 512MB)"`

### Container Executor

**`ContainerBeastExecutor` implementation:**

Currently a stub that throws. Implement using Docker API:

```typescript
buildContainerSpec(processSpec: BeastProcessSpec): ContainerCreateOptions {
  return {
    Image: 'frankenbeast-agent:latest',
    Cmd: [processSpec.command, ...processSpec.args],
    Env: Object.entries(processSpec.env ?? {}).map(([k, v]) => `${k}=${v}`),
    HostConfig: {
      Memory: budget.maxMemoryMb * 1024 * 1024,
      CpuQuota: 100000,  // 1 CPU
      Binds: [`${worktreePath}:/workspace`],
    },
  };
}
```

- Hard resource limits enforced by cgroup (not process-level estimates)
- Stdout/stderr captured via Docker log API
- Exit handling via Docker events API
- Requires Docker daemon running — fallback to process executor if not available

### Dashboard Integration

- Resource sparklines per agent in the agent list (CPU, memory mini-charts)
- System resource bar in the daemon header
- Resource budget progress rings in agent detail panel
- Warning badges on agents approaching limits

## Trade-offs

**Pros:**
- Prevents resource exhaustion from runaway agents
- Container executor provides hard isolation
- Operators can size their agent fleet to their hardware

**Cons:**
- `/proc` parsing is Linux-only (macOS needs different approach)
- Container executor adds Docker as a dependency
- Resource monitoring adds overhead (minimal at 30s intervals)
- Resource budgets need calibration — too tight and agents fail, too loose and they're meaningless

## Why Deferred

- Plan 2's concurrency limit (max N agents) is a sufficient coarse-grained control for initial release
- Resource monitoring requires platform-specific code (`/proc` on Linux, `sysctl` on macOS)
- Container executor is a significant infrastructure change (Docker dependency, image builds, volume mounts)
- The dashboard doesn't exist yet for resource visualization — adding monitoring without visualization provides limited value
