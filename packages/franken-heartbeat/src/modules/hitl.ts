/**
 * MOD-07 (HITL Gateway) contract — what MOD-08 requires from the human-in-the-loop system.
 */

import type { HeartbeatReport } from '../core/types.js';

export interface Alert {
  readonly severity: 'warning' | 'critical';
  readonly title: string;
  readonly message: string;
  readonly timestamp: string;
}

export interface IHitlGateway {
  sendMorningBrief(report: HeartbeatReport): Promise<void>;
  notifyAlert(alert: Alert): Promise<void>;
}
