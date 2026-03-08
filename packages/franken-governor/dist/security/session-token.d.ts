import type { SessionToken } from '../core/types.js';
export interface CreateSessionTokenParams {
    readonly approvalId: string;
    readonly scope: string;
    readonly grantedBy: string;
    readonly ttlMs: number;
}
export declare function createSessionToken(params: CreateSessionTokenParams): SessionToken;
//# sourceMappingURL=session-token.d.ts.map