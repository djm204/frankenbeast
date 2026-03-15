import { execFile } from "node:child_process";
import type { RawSkillEntry } from "../types/index.js";
import { SkillRegistryError } from "../types/index.js";
import type { ISkillCli } from "./i-skill-cli.js";

const DEFAULT_TIMEOUT_MS = 15_000;

/** Shape returned by `@djm204/agent-skills --list --json`. */
interface AgentSkillsListJson {
  skills: Record<string, Array<{ name: string; description: string; aliases: string[] }>>;
  shared_rules: string[];
}

function flattenListJson(json: AgentSkillsListJson): RawSkillEntry[] {
  const entries: RawSkillEntry[] = [];
  for (const [category, skills] of Object.entries(json.skills)) {
    for (const skill of skills) {
      entries.push({
        skill_id: skill.name,
        metadata: {
          name: skill.name,
          description: skill.description,
          source: category,
        },
        constraints: {
          is_destructive: false,
          requires_hitl: false,
          sandbox_type: "LOCAL",
        },
      });
    }
  }
  return entries;
}

export class AgentSkillsCli implements ISkillCli {
  private readonly timeoutMs: number;

  constructor(timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.timeoutMs = timeoutMs;
  }

  list(): Promise<RawSkillEntry[]> {
    return new Promise((resolve, reject) => {
      execFile(
        "npx",
        ["--yes", "@djm204/agent-skills@latest", "--list", "--json"],
        { timeout: this.timeoutMs },
        (err, stdout) => {
          if (err) {
            const nodeErr = err as NodeJS.ErrnoException & { killed?: boolean };
            if (nodeErr.killed === true) {
              reject(
                new SkillRegistryError(
                  "CLI_TIMEOUT",
                  `@djm204/agent-skills --list --json timed out after ${this.timeoutMs}ms`,
                ),
              );
              return;
            }
            reject(
              new SkillRegistryError(
                "CLI_FAILURE",
                `@djm204/agent-skills --list --json failed: ${err.message}`,
              ),
            );
            return;
          }

          try {
            const parsed = JSON.parse(stdout) as AgentSkillsListJson;
            if (parsed.skills && typeof parsed.skills === "object") {
              resolve(flattenListJson(parsed));
            } else if (Array.isArray(parsed)) {
              resolve(parsed as unknown as RawSkillEntry[]);
            } else {
              reject(
                new SkillRegistryError(
                  "PARSE_ERROR",
                  `Unexpected JSON shape from @djm204/agent-skills --list --json`,
                ),
              );
            }
          } catch (parseErr) {
            reject(
              new SkillRegistryError(
                "PARSE_ERROR",
                `Failed to parse @djm204/agent-skills --list --json output: ${String(parseErr)}`,
              ),
            );
          }
        },
      );
    });
  }
}
