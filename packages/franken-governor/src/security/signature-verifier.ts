import { createHmac, timingSafeEqual } from 'node:crypto';

export interface ApprovalResponseSignaturePayloadFields {
  readonly requestId: string;
  readonly decision: string;
}

/**
 * Canonical payload signed for governor approval responses.
 *
 * Keep this independent from object/JSON key ordering so clients implemented in
 * other runtimes can produce the same bytes deterministically.
 */
export function formatApprovalResponseSignaturePayload(
  fields: ApprovalResponseSignaturePayloadFields,
): string {
  return `requestId:${encodeURIComponent(fields.requestId)}|decision:${encodeURIComponent(fields.decision)}`;
}

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
