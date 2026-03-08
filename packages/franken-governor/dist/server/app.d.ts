import { Hono } from 'hono';
export interface GovernorAppOptions {
    signingSecret?: string;
    slackWebhookUrl?: string;
}
export declare function createGovernorApp(options?: GovernorAppOptions): Hono;
//# sourceMappingURL=app.d.ts.map