import { randomUUID } from 'node:crypto';
export function createSessionToken(params) {
    const now = new Date();
    return {
        tokenId: randomUUID(),
        approvalId: params.approvalId,
        scope: params.scope,
        grantedBy: params.grantedBy,
        grantedAt: now,
        expiresAt: new Date(now.getTime() + params.ttlMs),
    };
}
//# sourceMappingURL=session-token.js.map