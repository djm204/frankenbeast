import type { RawSkillEntry } from "../types/index.js";

export interface ISkillCli {
  list(): Promise<RawSkillEntry[]>;
}
