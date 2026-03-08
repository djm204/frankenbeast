import type { SandboxType } from "./sandbox-type.js";
import type { SkillSource } from "./skill-source.js";

export interface UnifiedSkillContract {
  skill_id: string;
  metadata: {
    name: string;
    description: string;
    source: SkillSource;
  };
  interface: {
    input_schema: Record<string, unknown>;
    output_schema: Record<string, unknown>;
  };
  constraints: {
    is_destructive: boolean;
    requires_hitl: boolean;
    sandbox_type: SandboxType;
  };
}
