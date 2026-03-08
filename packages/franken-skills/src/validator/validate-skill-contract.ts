import type { UnifiedSkillContract } from "../types/unified-skill-contract.js";
import { SkillRegistryError } from "../types/skill-registry-error.js";
import type { SandboxType } from "../types/sandbox-type.js";
import type { SkillSource } from "../types/skill-source.js";

const VALID_SANDBOX_TYPES: SandboxType[] = ["DOCKER", "WASM", "LOCAL"];
const VALID_SKILL_SOURCES: SkillSource[] = ["GLOBAL", "LOCAL"];

type ValidationResult =
  | { ok: true; value: UnifiedSkillContract }
  | { ok: false; errors: SkillRegistryError[] };

export function validateSkillContract(raw: unknown): ValidationResult {
  const errors: SkillRegistryError[] = [];
  const r = raw as Record<string, unknown>;

  // skill_id
  if (typeof r["skill_id"] !== "string" || r["skill_id"].trim() === "") {
    errors.push(
      new SkillRegistryError(
        "INVALID_CONTRACT",
        "skill_id is required and must be a non-empty string",
      ),
    );
  }

  // metadata
  const metadata = r["metadata"] as Record<string, unknown> | undefined;
  if (!metadata || typeof metadata !== "object") {
    errors.push(new SkillRegistryError("INVALID_CONTRACT", "metadata is required"));
  } else {
    if (typeof metadata["name"] !== "string" || metadata["name"].trim() === "") {
      errors.push(
        new SkillRegistryError("INVALID_CONTRACT", "metadata.name is required and must be a non-empty string"),
      );
    }
    if (typeof metadata["description"] !== "string" || metadata["description"].trim() === "") {
      errors.push(
        new SkillRegistryError(
          "INVALID_CONTRACT",
          "metadata.description is required and must be a non-empty string",
        ),
      );
    }
    if (!VALID_SKILL_SOURCES.includes(metadata["source"] as SkillSource)) {
      errors.push(
        new SkillRegistryError(
          "INVALID_CONTRACT",
          `metadata.source must be one of: ${VALID_SKILL_SOURCES.join(", ")}`,
        ),
      );
    }
  }

  // interface
  const iface = r["interface"] as Record<string, unknown> | undefined;
  if (!iface || typeof iface !== "object") {
    errors.push(new SkillRegistryError("INVALID_CONTRACT", "interface is required"));
  } else {
    if (iface["input_schema"] === undefined || iface["input_schema"] === null) {
      errors.push(
        new SkillRegistryError("INVALID_CONTRACT", "interface.input_schema is required"),
      );
    }
    if (iface["output_schema"] === undefined || iface["output_schema"] === null) {
      errors.push(
        new SkillRegistryError("INVALID_CONTRACT", "interface.output_schema is required"),
      );
    }
  }

  // constraints
  const constraints = r["constraints"] as Record<string, unknown> | undefined;
  if (!constraints || typeof constraints !== "object") {
    errors.push(new SkillRegistryError("INVALID_CONTRACT", "constraints is required"));
  } else {
    if (typeof constraints["is_destructive"] !== "boolean") {
      errors.push(
        new SkillRegistryError(
          "INVALID_CONTRACT",
          "constraints.is_destructive is required and must be a boolean",
        ),
      );
    }
    if (typeof constraints["requires_hitl"] !== "boolean") {
      errors.push(
        new SkillRegistryError(
          "INVALID_CONTRACT",
          "constraints.requires_hitl is required and must be a boolean",
        ),
      );
    }
    if (!VALID_SANDBOX_TYPES.includes(constraints["sandbox_type"] as SandboxType)) {
      errors.push(
        new SkillRegistryError(
          "INVALID_CONTRACT",
          `constraints.sandbox_type must be one of: ${VALID_SANDBOX_TYPES.join(", ")}`,
        ),
      );
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: raw as UnifiedSkillContract };
}
