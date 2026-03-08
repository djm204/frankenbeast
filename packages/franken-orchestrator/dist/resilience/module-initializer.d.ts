import type { BeastLoopDeps } from '../deps.js';
export interface ModuleHealth {
    readonly module: string;
    readonly healthy: boolean;
    readonly error?: string;
}
/**
 * Checks health of all module dependencies on startup.
 * Returns a list of module health statuses.
 */
export declare function checkModuleHealth(deps: BeastLoopDeps): Promise<readonly ModuleHealth[]>;
/** Returns true if all modules are healthy. */
export declare function allHealthy(results: readonly ModuleHealth[]): boolean;
//# sourceMappingURL=module-initializer.d.ts.map