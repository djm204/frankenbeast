import { Hono } from 'hono';
import { createHmac } from 'node:crypto';
export function createGovernorApp(options = {}) {
    const app = new Hono();
    const pendingApprovals = new Map();
    // Health check
    app.get('/health', (c) => {
        return c.json({
            status: 'ok',
            service: 'franken-governor',
            pendingApprovals: pendingApprovals.size,
        });
    });
    // POST /v1/approval/request — submit an approval request
    app.post('/v1/approval/request', async (c) => {
        const body = await c.req.json();
        if (!body.requestId || !body.taskId || !body.summary) {
            return c.json({ error: { message: 'Missing required fields: requestId, taskId, summary' } }, 400);
        }
        pendingApprovals.set(body.requestId, {
            taskId: body.taskId,
            summary: body.summary,
            resolve: () => { }, // placeholder
        });
        return c.json({
            requestId: body.requestId,
            status: 'pending',
            message: 'Approval request created',
        }, 201);
    });
    // POST /v1/approval/respond — respond to an approval request
    app.post('/v1/approval/respond', async (c) => {
        const body = await c.req.json();
        // Verify signature if signing secret configured
        if (options.signingSecret) {
            const signature = c.req.header('x-governor-signature');
            if (!signature) {
                return c.json({ error: { message: 'Missing signature' } }, 401);
            }
            const rawBody = JSON.stringify(body);
            const expected = createHmac('sha256', options.signingSecret)
                .update(rawBody)
                .digest('hex');
            if (signature !== `sha256=${expected}`) {
                return c.json({ error: { message: 'Invalid signature' } }, 401);
            }
        }
        if (!body.requestId || !body.decision) {
            return c.json({ error: { message: 'Missing required fields: requestId, decision' } }, 400);
        }
        const pending = pendingApprovals.get(body.requestId);
        if (!pending) {
            return c.json({ error: { message: 'Approval request not found' } }, 404);
        }
        pendingApprovals.delete(body.requestId);
        return c.json({
            requestId: body.requestId,
            decision: body.decision,
            status: 'resolved',
        });
    });
    // POST /v1/webhook/slack — Slack interactive message callback
    app.post('/v1/webhook/slack', async (c) => {
        const body = await c.req.json();
        const action = body.actions?.[0];
        if (!action) {
            return c.json({ error: { message: 'No action found in payload' } }, 400);
        }
        const requestId = action.value;
        const decision = action.action_id; // 'approve' or 'reject'
        return c.json({
            requestId,
            decision,
            source: 'slack',
            status: 'processed',
        });
    });
    return app;
}
//# sourceMappingURL=app.js.map