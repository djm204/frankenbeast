import type { SessionToken } from '../core/types.js';
export declare class SessionTokenStore {
    private readonly tokens;
    store(token: SessionToken): void;
    get(tokenId: string): SessionToken | undefined;
    revoke(tokenId: string): void;
    isValid(tokenId: string): boolean;
    private isExpired;
}
//# sourceMappingURL=session-token-store.d.ts.map