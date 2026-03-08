const INPUT_MAP = {
    a: 'APPROVE',
    r: 'REGEN',
    x: 'ABORT',
    d: 'DEBUG',
};
export class CliChannel {
    channelId = 'cli';
    readline;
    operatorName;
    constructor(deps) {
        this.readline = deps.readline;
        this.operatorName = deps.operatorName;
    }
    async requestApproval(request) {
        const decision = await this.promptForDecision(request);
        const base = {
            requestId: request.requestId,
            decision,
            respondedBy: this.operatorName,
            respondedAt: new Date(),
        };
        if (decision === 'REGEN') {
            const feedback = await this.readline.question('Feedback: ');
            return { ...base, feedback };
        }
        return base;
    }
    async promptForDecision(request) {
        const prompt = this.formatPrompt(request);
        while (true) {
            const input = await this.readline.question(prompt);
            const decision = INPUT_MAP[input.trim().toLowerCase()];
            if (decision !== undefined)
                return decision;
        }
    }
    formatPrompt(request) {
        const lines = [
            `\n--- HITL Approval Required ---`,
            `Task: ${request.taskId}`,
            `Trigger: [${request.trigger.triggerId}] ${request.trigger.reason ?? 'No reason'}`,
            `Summary: ${request.summary}`,
            request.planDiff ? `Plan Diff:\n${request.planDiff}` : '',
            `\n[a]pprove  [r]egenerate  a[x]bort  [d]ebug\n> `,
        ].filter(Boolean);
        return lines.join('\n');
    }
}
//# sourceMappingURL=cli-channel.js.map