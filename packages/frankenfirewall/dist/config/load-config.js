import { readFileSync } from "fs";
const VALID_PROVIDERS = ["anthropic", "openai", "local-ollama"];
const VALID_TIERS = ["STRICT", "MODERATE", "PERMISSIVE"];
export class ConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = "ConfigError";
    }
}
function assertString(value, field) {
    if (typeof value !== "string" || value.trim() === "") {
        throw new ConfigError(`Config field "${field}" must be a non-empty string`);
    }
}
function assertNumber(value, field) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new ConfigError(`Config field "${field}" must be a finite number`);
    }
}
function assertBoolean(value, field) {
    if (typeof value !== "boolean") {
        throw new ConfigError(`Config field "${field}" must be a boolean`);
    }
}
function validate(raw) {
    if (typeof raw !== "object" || raw === null) {
        throw new ConfigError("Config must be a JSON object");
    }
    const obj = raw;
    assertString(obj["project_name"], "project_name");
    if (!VALID_TIERS.includes(obj["security_tier"])) {
        throw new ConfigError(`Config field "security_tier" must be one of: ${VALID_TIERS.join(", ")}`);
    }
    if (obj["schema_version"] !== 1) {
        throw new ConfigError(`Config field "schema_version" must be 1`);
    }
    const settings = obj["agnostic_settings"];
    if (typeof settings !== "object" || settings === null) {
        throw new ConfigError(`Config field "agnostic_settings" must be an object`);
    }
    const s = settings;
    assertBoolean(s["redact_pii"], "agnostic_settings.redact_pii");
    assertNumber(s["max_token_spend_per_call"], "agnostic_settings.max_token_spend_per_call");
    if (!Array.isArray(s["allowed_providers"]) || s["allowed_providers"].length === 0) {
        throw new ConfigError(`Config field "agnostic_settings.allowed_providers" must be a non-empty array`);
    }
    for (const p of s["allowed_providers"]) {
        if (!VALID_PROVIDERS.includes(p)) {
            throw new ConfigError(`Unknown provider "${String(p)}" in allowed_providers. Valid: ${VALID_PROVIDERS.join(", ")}`);
        }
    }
    const hooks = obj["safety_hooks"];
    if (typeof hooks !== "object" || hooks === null) {
        throw new ConfigError(`Config field "safety_hooks" must be an object`);
    }
    const h = hooks;
    if (!Array.isArray(h["pre_flight"])) {
        throw new ConfigError(`Config field "safety_hooks.pre_flight" must be an array`);
    }
    if (!Array.isArray(h["post_flight"])) {
        throw new ConfigError(`Config field "safety_hooks.post_flight" must be an array`);
    }
    return Object.freeze(raw);
}
export function loadConfig(filePath) {
    let raw;
    try {
        const content = readFileSync(filePath, "utf-8");
        raw = JSON.parse(content);
    }
    catch (err) {
        if (err instanceof ConfigError)
            throw err;
        throw new ConfigError(`Failed to read config at "${filePath}": ${err instanceof Error ? err.message : String(err)}`);
    }
    return validate(raw);
}
//# sourceMappingURL=load-config.js.map