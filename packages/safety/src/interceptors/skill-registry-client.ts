// ---------------------------------------------------------------------------
// Shared SkillRegistryClient interface (MOD-02 boundary — no concrete import)
//
// Used by both inbound (ProjectAlignmentChecker) and outbound
// (DeterministicGrounder) interceptors to verify tool calls against the
// Skill Registry without depending on the concrete MOD-02 package.
// ---------------------------------------------------------------------------

export interface SkillRegistryClient {
  hasSkill(name: string): boolean;
  validateArguments?(name: string, args: Record<string, unknown>): boolean;
}
