import { requireOperatorAuth } from '../../http/operator-auth.js';
import { TransportSecurityService } from '../../http/security/transport-security.js';

export interface BeastAuthOptions {
  operatorToken: string;
  security: TransportSecurityService;
}

export function requireBeastOperatorAuth(options: BeastAuthOptions) {
  return requireOperatorAuth({
    operatorToken: options.operatorToken,
    security: options.security,
  });
}
