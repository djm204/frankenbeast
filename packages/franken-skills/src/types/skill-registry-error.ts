export type SkillRegistryErrorCode =
  | "INVALID_CONTRACT"
  | "REGISTRY_NOT_SYNCED"
  | "CLI_FAILURE"
  | "CLI_TIMEOUT"
  | "PARSE_ERROR"
  | "DUPLICATE_SKILL_ID";

export class SkillRegistryError extends Error {
  readonly code: SkillRegistryErrorCode;
  readonly skill_id?: string;

  constructor(code: SkillRegistryErrorCode, message: string, skill_id?: string) {
    super(message);
    this.name = "SkillRegistryError";
    this.code = code;
    if (skill_id !== undefined) {
      this.skill_id = skill_id;
    }
  }
}
