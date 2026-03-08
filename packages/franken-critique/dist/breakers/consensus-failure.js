export class ConsensusFailureBreaker {
    name = 'consensus-failure';
    check(state, config) {
        for (const [category, count] of state.failureHistory) {
            if (count >= config.consensusThreshold) {
                return {
                    tripped: true,
                    reason: `Consensus failure: evaluator "${category}" failed ${count} times without improvement`,
                    action: 'escalate',
                };
            }
        }
        return { tripped: false };
    }
}
//# sourceMappingURL=consensus-failure.js.map