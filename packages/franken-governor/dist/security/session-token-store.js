export class SessionTokenStore {
    tokens = new Map();
    store(token) {
        this.tokens.set(token.tokenId, token);
    }
    get(tokenId) {
        const token = this.tokens.get(tokenId);
        if (token === undefined)
            return undefined;
        if (this.isExpired(token)) {
            this.tokens.delete(tokenId);
            return undefined;
        }
        return token;
    }
    revoke(tokenId) {
        this.tokens.delete(tokenId);
    }
    isValid(tokenId) {
        return this.get(tokenId) !== undefined;
    }
    isExpired(token) {
        return Date.now() >= token.expiresAt.getTime();
    }
}
//# sourceMappingURL=session-token-store.js.map