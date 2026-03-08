import { readdir, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import type { UnifiedSkillContract } from "../types/index.js";
import { validateSkillContract } from "../validator/index.js";

export class LocalSkillLoader {
  async load(dir: string): Promise<UnifiedSkillContract[]> {
    // Check directory exists
    try {
      await access(dir);
    } catch {
      console.info(`[LocalSkillLoader] /skills directory does not exist at "${dir}" — skipping local skills.`, { dir });
      return [];
    }

    const entries = await readdir(dir);
    const jsonFiles = entries.filter((f) => f.endsWith(".json"));
    const contracts: UnifiedSkillContract[] = [];

    for (const file of jsonFiles) {
      const filePath = join(dir, file);

      let raw: unknown;
      try {
        const content = await readFile(filePath, "utf-8");
        raw = JSON.parse(content);
      } catch (err) {
        console.error(
          `[LocalSkillLoader] Failed to parse "${file}" — skipping.`,
          { file: filePath, error: String(err) },
        );
        continue;
      }

      const result = validateSkillContract(raw);
      if (!result.ok) {
        console.error(
          `[LocalSkillLoader] Invalid contract in "${file}" — skipping.`,
          { file: filePath, errors: result.errors.map((e) => e.message) },
        );
        continue;
      }

      contracts.push(result.value);
    }

    return contracts;
  }
}
