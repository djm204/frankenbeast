import { execFile } from "node:child_process";
import type { RawSkillEntry } from "../types/index.js";
import { SkillRegistryError } from "../types/index.js";
import type { ISkillCli } from "./i-skill-cli.js";

const DEFAULT_TIMEOUT_MS = 15_000;

export class AgentSkillsCli implements ISkillCli {
  private readonly timeoutMs: number;

  constructor(timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.timeoutMs = timeoutMs;
  }

  list(): Promise<RawSkillEntry[]> {
    return new Promise((resolve, reject) => {
      execFile(
        "npx",
        ["@djm204/agent-skills", "--list"],
        { timeout: this.timeoutMs },
        (err, stdout) => {
          if (err) {
            const nodeErr = err as NodeJS.ErrnoException & { killed?: boolean };
            if (nodeErr.killed === true) {
              reject(
                new SkillRegistryError(
                  "CLI_TIMEOUT",
                  `@djm204/agent-skills --list timed out after ${this.timeoutMs}ms`,
                ),
              );
              return;
            }
            reject(
              new SkillRegistryError(
                "CLI_FAILURE",
                `@djm204/agent-skills --list failed: ${err.message}`,
              ),
            );
            return;
          }

          try {
            const parsed = JSON.parse(stdout) as RawSkillEntry[];
            resolve(parsed);
          } catch (parseErr) {
            reject(
              new SkillRegistryError(
                "PARSE_ERROR",
                `Failed to parse @djm204/agent-skills --list output: ${String(parseErr)}`,
              ),
            );
          }
        },
      );
    });
  }
}
