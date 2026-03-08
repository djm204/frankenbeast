import { SkillRegistryError } from "../types/index.js";
import { validateSkillContract } from "../validator/index.js";
export class DiscoveryService {
    cli;
    constructor(cli) {
        this.cli = cli;
    }
    async discover() {
        const rawEntries = await this.cli.list();
        const contracts = [];
        const seen = new Set();
        for (const entry of rawEntries) {
            const result = validateSkillContract(entry);
            if (!result.ok) {
                console.error(`[DiscoveryService] Invalid skill entry (skill_id=${String(entry.skill_id)}): skipping.`, result.errors.map((e) => e.message));
                continue;
            }
            const { value: contract } = result;
            if (seen.has(contract.skill_id)) {
                console.error(`[DiscoveryService] Duplicate skill_id "${contract.skill_id}" from global source: keeping first, skipping duplicate.`, new SkillRegistryError("DUPLICATE_SKILL_ID", `Duplicate skill_id: ${contract.skill_id}`, contract.skill_id));
                continue;
            }
            seen.add(contract.skill_id);
            contracts.push(contract);
        }
        return contracts;
    }
}
//# sourceMappingURL=discovery-service.js.map