import type { SkillRegistryPort, SkillContract } from './skills-adapter.js';

export interface BridgeableSkillRegistry {
  hasSkill(id: string): boolean;
  getSkill(id: string): BridgeableSkillContract | undefined;
  getAll(): BridgeableSkillContract[];
}

interface BridgeableSkillContract {
  readonly skill_id: string;
  readonly metadata: { readonly name: string };
  readonly constraints: { readonly requires_hitl: boolean };
}

export class SkillRegistryBridge implements SkillRegistryPort {
  constructor(private readonly registry: BridgeableSkillRegistry) {}

  hasSkill(id: string): boolean {
    return this.registry.hasSkill(id);
  }

  getSkill(id: string): SkillContract | undefined {
    const skill = this.registry.getSkill(id);
    if (!skill) return undefined;
    return this.toContract(skill);
  }

  getAll(): readonly SkillContract[] {
    return this.registry.getAll().map(s => this.toContract(s));
  }

  private toContract(skill: BridgeableSkillContract): SkillContract {
    return {
      skill_id: skill.skill_id,
      metadata: { name: skill.metadata.name },
      constraints: { requires_hitl: skill.constraints.requires_hitl },
    };
  }
}
