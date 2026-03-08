export interface SkillRegistryClient {
    hasSkill(name: string): boolean;
    validateArguments?(name: string, args: Record<string, unknown>): boolean;
}
//# sourceMappingURL=skill-registry-client.d.ts.map