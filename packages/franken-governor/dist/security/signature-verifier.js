import { createHmac, timingSafeEqual } from 'node:crypto';
export class SignatureVerifier {
    secret;
    constructor(secret) {
        this.secret = secret;
    }
    sign(payload) {
        return createHmac('sha256', this.secret).update(payload).digest('hex');
    }
    verify(payload, signature) {
        const expected = this.sign(payload);
        if (expected.length !== signature.length)
            return false;
        return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
    }
}
//# sourceMappingURL=signature-verifier.js.map