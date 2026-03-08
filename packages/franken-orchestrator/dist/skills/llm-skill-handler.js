export class LlmSkillHandler {
    llmClient;
    constructor(llmClient) {
        this.llmClient = llmClient;
    }
    async execute(objective, context) {
        const prompt = this.buildPrompt(objective, context);
        try {
            const response = await this.llmClient.complete(prompt);
            return {
                output: response,
                tokensUsed: this.estimateTokens(prompt, response),
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Skill execution failed for objective "${objective}": ${message}`);
        }
    }
    buildPrompt(objective, context) {
        return [
            'Objective:',
            objective,
            '',
            'ADRs:',
            ...this.formatSection(context.adrs),
            '',
            'Rules:',
            ...this.formatSection(context.rules),
            '',
            'Known Errors:',
            ...this.formatSection(context.knownErrors),
        ].join('\n');
    }
    formatSection(entries) {
        if (entries.length === 0) {
            return ['(none)'];
        }
        return entries.map(entry => `- ${entry}`);
    }
    estimateTokens(prompt, response) {
        return Math.ceil((prompt.length + response.length) / 4);
    }
}
//# sourceMappingURL=llm-skill-handler.js.map