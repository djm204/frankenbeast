import type { ILlmClient } from '@franken/types';
import type { IMcpModule, ISkillsModule, SkillDescriptor, SkillInput, SkillResult } from '../deps.js';
export interface SkillContract {
    readonly skill_id: string;
    readonly metadata: {
        readonly name: string;
    };
    readonly constraints: {
        readonly requires_hitl: boolean;
    };
}
export interface SkillRegistryPort {
    hasSkill(id: string): boolean;
    getSkill(id: string): SkillContract | undefined;
    getAll(): readonly SkillContract[];
}
export type SkillHandler = (input: SkillInput) => Promise<SkillResult> | SkillResult;
export declare class SkillsPortAdapter implements ISkillsModule {
    private readonly handlers;
    private readonly registry;
    private readonly llmClient;
    private readonly mcp?;
    constructor(registry: SkillRegistryPort, llmClient: ILlmClient, mcp?: IMcpModule);
    registerHandler(skillId: string, handler: SkillHandler): void;
    hasSkill(skillId: string): boolean;
    getAvailableSkills(): readonly SkillDescriptor[];
    execute(skillId: string, input: SkillInput): Promise<SkillResult>;
    private getDescriptor;
    private toDescriptor;
    private resolveExecutionType;
}
//# sourceMappingURL=skills-adapter.d.ts.map