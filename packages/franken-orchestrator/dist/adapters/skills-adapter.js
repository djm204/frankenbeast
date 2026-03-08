export class SkillsPortAdapter {
    handlers = new Map();
    registry;
    llmClient;
    mcp;
    constructor(registry, llmClient, mcp) {
        this.registry = registry;
        this.llmClient = llmClient;
        this.mcp = mcp;
    }
    registerHandler(skillId, handler) {
        this.handlers.set(skillId, handler);
    }
    hasSkill(skillId) {
        return this.registry.hasSkill(skillId);
    }
    getAvailableSkills() {
        return this.registry.getAll().map(contract => this.toDescriptor(contract));
    }
    async execute(skillId, input) {
        const descriptor = this.getDescriptor(skillId);
        if (!descriptor) {
            throw new Error(`Skill not found: ${skillId}`);
        }
        switch (descriptor.executionType) {
            case 'llm': {
                const output = await this.llmClient.complete(input.objective);
                return { output };
            }
            case 'function': {
                const handler = this.handlers.get(skillId);
                if (!handler) {
                    throw new Error(`No handler registered for skill: ${skillId}`);
                }
                return await handler(input);
            }
            case 'mcp': {
                if (!this.mcp) {
                    throw new Error(`MCP module not available for skill: ${skillId}`);
                }
                const result = await this.mcp.callTool(skillId, input);
                return { output: result };
            }
            case 'cli': {
                throw new Error(`CLI execution not yet implemented for skill: ${skillId}`);
            }
            default: {
                const _exhaustive = descriptor.executionType;
                throw new Error(`Unsupported execution type: ${_exhaustive}`);
            }
        }
    }
    getDescriptor(skillId) {
        const contract = this.registry.getSkill(skillId);
        if (!contract)
            return undefined;
        return this.toDescriptor(contract);
    }
    toDescriptor(contract) {
        return {
            id: contract.skill_id,
            name: contract.metadata.name,
            requiresHitl: contract.constraints.requires_hitl,
            executionType: this.resolveExecutionType(contract.skill_id),
        };
    }
    resolveExecutionType(skillId) {
        if (this.handlers.has(skillId)) {
            return 'function';
        }
        if (this.mcp?.getAvailableTools().some(tool => tool.name === skillId)) {
            return 'mcp';
        }
        return 'llm';
    }
}
//# sourceMappingURL=skills-adapter.js.map