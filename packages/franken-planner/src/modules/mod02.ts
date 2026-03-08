/**
 * MOD-02: agent-skills (@djm204/agent-skills)
 * Exposes available tools and skills for the planner to discover and assign to tasks.
 */
export interface Skill {
  name: string;
  description: string;
  version: string;
}

export interface SkillsModule {
  getAvailableSkills(): Promise<Skill[]>;
  hasSkill(name: string): Promise<boolean>;
}
