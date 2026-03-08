const VALID_STATUSES = new Set([
    'pending',
    'in_progress',
    'completed',
    'failed',
    'skipped',
]);
const VALID_STRATEGIES = new Set([
    'linear',
    'parallel',
    'recursive',
]);
export function isTask(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const v = value;
    if (typeof v['id'] !== 'string')
        return false;
    if (typeof v['objective'] !== 'string')
        return false;
    const skills = v['requiredSkills'];
    if (!Array.isArray(skills))
        return false;
    if (!skills.every((s) => typeof s === 'string'))
        return false;
    const deps = v['dependsOn'];
    if (!Array.isArray(deps))
        return false;
    if (!deps.every((d) => typeof d === 'string'))
        return false;
    if (typeof v['status'] !== 'string')
        return false;
    if (!VALID_STATUSES.has(v['status']))
        return false;
    return true;
}
export function isIntent(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const v = value;
    if (typeof v['goal'] !== 'string')
        return false;
    if (v['strategy'] !== undefined) {
        if (typeof v['strategy'] !== 'string')
            return false;
        if (!VALID_STRATEGIES.has(v['strategy']))
            return false;
    }
    return true;
}
//# sourceMappingURL=guards.js.map