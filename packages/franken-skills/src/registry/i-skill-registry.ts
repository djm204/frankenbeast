import type { UnifiedSkillContract } from "../types/index.js";

export interface ISkillRegistry {
  hasSkill(id: string): boolean;
  getSkill(id: string): UnifiedSkillContract | undefined;
  getAll(): UnifiedSkillContract[];
  sync(): Promise<void>;
  isSynced(): boolean;
}
