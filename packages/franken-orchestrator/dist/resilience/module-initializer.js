/**
 * Checks health of all module dependencies on startup.
 * Returns a list of module health statuses.
 */
export async function checkModuleHealth(deps) {
    const checks = [];
    // Firewall — verify it can process a simple input
    try {
        await deps.firewall.runPipeline('health check');
        checks.push({ module: 'firewall', healthy: true });
    }
    catch (error) {
        checks.push({ module: 'firewall', healthy: false, error: errorMessage(error) });
    }
    // Skills — verify registry is accessible
    try {
        deps.skills.getAvailableSkills();
        checks.push({ module: 'skills', healthy: true });
    }
    catch (error) {
        checks.push({ module: 'skills', healthy: false, error: errorMessage(error) });
    }
    // Memory — verify context retrieval works
    try {
        await deps.memory.getContext('__health_check__');
        checks.push({ module: 'memory', healthy: true });
    }
    catch (error) {
        checks.push({ module: 'memory', healthy: false, error: errorMessage(error) });
    }
    // Planner — verify plan creation doesn't crash
    try {
        await deps.planner.createPlan({ goal: 'health check' });
        checks.push({ module: 'planner', healthy: true });
    }
    catch (error) {
        checks.push({ module: 'planner', healthy: false, error: errorMessage(error) });
    }
    // Observer — verify span creation
    try {
        const span = deps.observer.startSpan('__health_check__');
        span.end();
        checks.push({ module: 'observer', healthy: true });
    }
    catch (error) {
        checks.push({ module: 'observer', healthy: false, error: errorMessage(error) });
    }
    // Critique — verify review works
    try {
        await deps.critique.reviewPlan({ tasks: [] });
        checks.push({ module: 'critique', healthy: true });
    }
    catch (error) {
        checks.push({ module: 'critique', healthy: false, error: errorMessage(error) });
    }
    // Governor — verify approval request works
    try {
        await deps.governor.requestApproval({
            taskId: '__health__',
            summary: 'health check',
            requiresHitl: false,
        });
        checks.push({ module: 'governor', healthy: true });
    }
    catch (error) {
        checks.push({ module: 'governor', healthy: false, error: errorMessage(error) });
    }
    // Heartbeat — verify pulse works
    try {
        await deps.heartbeat.pulse();
        checks.push({ module: 'heartbeat', healthy: true });
    }
    catch (error) {
        checks.push({ module: 'heartbeat', healthy: false, error: errorMessage(error) });
    }
    return checks;
}
/** Returns true if all modules are healthy. */
export function allHealthy(results) {
    return results.every(r => r.healthy);
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=module-initializer.js.map