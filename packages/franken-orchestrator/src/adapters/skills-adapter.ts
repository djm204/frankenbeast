import type { ILlmClient } from '@franken/types';
import type { IMcpModule, ISkillsModule, SkillDescriptor, SkillInput, SkillResult } from '../deps.js';

export interface SkillContract {
  readonly skill_id: string;
  readonly metadata: { readonly name: string };
  readonly constraints: { readonly requires_hitl: boolean };
}

export interface SkillRegistryPort {
  hasSkill(id: string): boolean;
  getSkill(id: string): SkillContract | undefined;
  getAll(): readonly SkillContract[];
}

export type SkillHandler = (input: SkillInput) => Promise<SkillResult> | SkillResult;

export class SkillsPortAdapter implements ISkillsModule {
  private readonly handlers = new Map<string, SkillHandler>();
  private readonly registry: SkillRegistryPort;
  private readonly llmClient: ILlmClient;
  private readonly mcp?: IMcpModule | undefined;

  constructor(registry: SkillRegistryPort, llmClient: ILlmClient, mcp?: IMcpModule) {
    this.registry = registry;
    this.llmClient = llmClient;
    this.mcp = mcp;
  }

  registerHandler(skillId: string, handler: SkillHandler): void {
    this.handlers.set(skillId, handler);
  }

  hasSkill(skillId: string): boolean {
    return this.registry.hasSkill(skillId);
  }

  getAvailableSkills(): readonly SkillDescriptor[] {
    return this.registry.getAll().map(contract => this.toDescriptor(contract));
  }

  async execute(skillId: string, input: SkillInput): Promise<SkillResult> {
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
        const _exhaustive: never = descriptor.executionType;
        throw new Error(`Unsupported execution type: ${_exhaustive}`);
      }
    }
  }

  private getDescriptor(skillId: string): SkillDescriptor | undefined {
    const contract = this.registry.getSkill(skillId);
    if (!contract) return undefined;
    return this.toDescriptor(contract);
  }

  private toDescriptor(contract: SkillContract): SkillDescriptor {
    return {
      id: contract.skill_id,
      name: contract.metadata.name,
      requiresHitl: contract.constraints.requires_hitl,
      executionType: this.resolveExecutionType(contract.skill_id),
    };
  }

  private resolveExecutionType(skillId: string): SkillDescriptor['executionType'] {
    if (this.handlers.has(skillId)) {
      return 'function';
    }
    if (this.mcp?.getAvailableTools().some(tool => tool.name === skillId)) {
      return 'mcp';
    }
    return 'llm';
  }
}
