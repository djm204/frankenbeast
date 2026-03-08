export declare class SignatureVerifier {
    private readonly secret;
    constructor(secret: string);
    sign(payload: string): string;
    verify(payload: string, signature: string): boolean;
}
//# sourceMappingURL=signature-verifier.d.ts.map