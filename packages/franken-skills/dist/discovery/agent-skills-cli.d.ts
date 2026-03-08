import type { RawSkillEntry } from "../types/index.js";
import type { ISkillCli } from "./i-skill-cli.js";
export declare class AgentSkillsCli implements ISkillCli {
    private readonly timeoutMs;
    constructor(timeoutMs?: number);
    list(): Promise<RawSkillEntry[]>;
}
//# sourceMappingURL=agent-skills-cli.d.ts.map