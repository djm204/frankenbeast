import type { ISkillRegistry } from "./i-skill-registry.js";
export interface RegistryConfig {
    /** Absolute path to the project-local skills directory. Defaults to process.cwd()/skills */
    localSkillsDir?: string;
    /** Timeout in ms for the @djm204/agent-skills CLI subprocess */
    cliTimeoutMs?: number;
}
export declare function createRegistry(config?: RegistryConfig): ISkillRegistry;
//# sourceMappingURL=create-registry.d.ts.map