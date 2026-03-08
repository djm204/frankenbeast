import type { UnifiedSkillContract } from "../types/index.js";
import { SkillRegistryError } from "../types/index.js";
import { validateSkillContract } from "../validator/index.js";
import type { ISkillCli } from "./i-skill-cli.js";

export class DiscoveryService {
  private readonly cli: ISkillCli;

  constructor(cli: ISkillCli) {
    this.cli = cli;
  }

  async discover(): Promise<UnifiedSkillContract[]> {
    const rawEntries = await this.cli.list();
    const contracts: UnifiedSkillContract[] = [];
    const seen = new Set<string>();

    for (const entry of rawEntries) {
      const result = validateSkillContract(entry);

      if (!result.ok) {
        console.error(
          `[DiscoveryService] Invalid skill entry (skill_id=${String(entry.skill_id)}): skipping.`,
          result.errors.map((e) => e.message),
        );
        continue;
      }

      const { value: contract } = result;

      if (seen.has(contract.skill_id)) {
        console.error(
          `[DiscoveryService] Duplicate skill_id "${contract.skill_id}" from global source: keeping first, skipping duplicate.`,
          new SkillRegistryError("DUPLICATE_SKILL_ID", `Duplicate skill_id: ${contract.skill_id}`, contract.skill_id),
        );
        continue;
      }

      seen.add(contract.skill_id);
      contracts.push(contract);
    }

    return contracts;
  }
}
