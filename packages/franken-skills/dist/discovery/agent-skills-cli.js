import { execFile } from "node:child_process";
import { SkillRegistryError } from "../types/index.js";
const DEFAULT_TIMEOUT_MS = 15_000;
export class AgentSkillsCli {
    timeoutMs;
    constructor(timeoutMs = DEFAULT_TIMEOUT_MS) {
        this.timeoutMs = timeoutMs;
    }
    list() {
        return new Promise((resolve, reject) => {
            execFile("npx", ["@djm204/agent-skills", "--list"], { timeout: this.timeoutMs }, (err, stdout) => {
                if (err) {
                    const nodeErr = err;
                    if (nodeErr.killed === true) {
                        reject(new SkillRegistryError("CLI_TIMEOUT", `@djm204/agent-skills --list timed out after ${this.timeoutMs}ms`));
                        return;
                    }
                    reject(new SkillRegistryError("CLI_FAILURE", `@djm204/agent-skills --list failed: ${err.message}`));
                    return;
                }
                try {
                    const parsed = JSON.parse(stdout);
                    resolve(parsed);
                }
                catch (parseErr) {
                    reject(new SkillRegistryError("PARSE_ERROR", `Failed to parse @djm204/agent-skills --list output: ${String(parseErr)}`));
                }
            });
        });
    }
}
//# sourceMappingURL=agent-skills-cli.js.map