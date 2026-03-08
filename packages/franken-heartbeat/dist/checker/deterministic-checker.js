function checkWatchlist(watchlist) {
    const pending = watchlist.filter((item) => !item.checked);
    if (pending.length === 0)
        return [];
    return [{
            source: 'watchlist',
            description: `${pending.length} pending watchlist item(s)`,
            severity: 'low',
        }];
}
function checkDeepReviewHour(clock, deepReviewHour) {
    const hour = clock().getUTCHours();
    if (hour !== deepReviewHour)
        return [];
    return [{
            source: 'deep_review',
            description: `Deep review triggered at hour ${hour} UTC`,
            severity: 'medium',
        }];
}
async function checkGitStatus(executor) {
    try {
        const status = await executor();
        if (!status.dirty)
            return [];
        return [{
                source: 'git',
                description: `${status.files.length} uncommitted file(s)`,
                severity: 'low',
            }];
    }
    catch {
        return [];
    }
}
async function checkTokenSpend(observability, threshold) {
    try {
        const now = new Date();
        const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const spend = await observability.getTokenSpend(since);
        if (spend.totalCostUsd <= threshold)
            return [];
        return [{
                source: 'token_spend',
                description: `Token spend $${spend.totalCostUsd.toFixed(2)} exceeds threshold $${threshold.toFixed(2)}`,
                severity: 'high',
            }];
    }
    catch {
        return [];
    }
}
export class DeterministicChecker {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async check(watchlist) {
        const flagSets = await Promise.all([
            Promise.resolve(checkWatchlist(watchlist)),
            Promise.resolve(checkDeepReviewHour(this.deps.clock, this.deps.config.deepReviewHour)),
            checkGitStatus(this.deps.gitStatusExecutor),
            checkTokenSpend(this.deps.observability, this.deps.config.tokenSpendAlertThreshold),
        ]);
        const flags = flagSets.flat();
        if (flags.length === 0) {
            return { status: 'HEARTBEAT_OK' };
        }
        return { status: 'FLAGS_FOUND', flags };
    }
}
//# sourceMappingURL=deterministic-checker.js.map