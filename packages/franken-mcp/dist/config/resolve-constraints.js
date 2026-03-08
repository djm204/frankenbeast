const MODULE_DEFAULTS = {
    is_destructive: true,
    requires_hitl: true,
    sandbox_type: "DOCKER",
};
export function resolveConstraints(serverConstraints, toolOverrideConstraints) {
    return {
        is_destructive: toolOverrideConstraints?.is_destructive ??
            serverConstraints?.is_destructive ??
            MODULE_DEFAULTS.is_destructive,
        requires_hitl: toolOverrideConstraints?.requires_hitl ??
            serverConstraints?.requires_hitl ??
            MODULE_DEFAULTS.requires_hitl,
        sandbox_type: toolOverrideConstraints?.sandbox_type ??
            serverConstraints?.sandbox_type ??
            MODULE_DEFAULTS.sandbox_type,
    };
}
