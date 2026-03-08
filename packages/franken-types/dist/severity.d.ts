/**
 * Severity types used across modules.
 * The superset covers all values; module-specific subsets provide narrower typing.
 */
/** Superset covering all severity values used by any module. */
export type Severity = 'info' | 'low' | 'medium' | 'high' | 'warning' | 'critical';
/** MOD-06 Critique: evaluation severity levels. */
export type CritiqueSeverity = 'critical' | 'warning' | 'info';
/** MOD-07 Governor: trigger severity levels. */
export type TriggerSeverity = 'low' | 'medium' | 'high' | 'critical';
/** MOD-08 Heartbeat: flag severity levels. */
export type FlagSeverity = 'low' | 'medium' | 'high';
//# sourceMappingURL=severity.d.ts.map