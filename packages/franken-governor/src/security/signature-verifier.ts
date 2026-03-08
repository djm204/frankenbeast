import { createHmac, timingSafeEqual } from 'node:crypto';

export class SignatureVerifier {
  constructor(private readonly secret: string) {}

  sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('hex');
  }

  verify(payload: string, signature: string): boolean {
    const expected = this.sign(payload);
    if (expected.length !== signature.length) return false;

    return timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature, 'hex'),
    );
  }
}
