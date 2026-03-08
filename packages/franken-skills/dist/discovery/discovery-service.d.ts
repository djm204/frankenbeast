import type { UnifiedSkillContract } from "../types/index.js";
import type { ISkillCli } from "./i-skill-cli.js";
export declare class DiscoveryService {
    private readonly cli;
    constructor(cli: ISkillCli);
    discover(): Promise<UnifiedSkillContract[]>;
}
//# sourceMappingURL=discovery-service.d.ts.map