import { writeFile, readFile } from 'node:fs/promises';
import { BeastContext } from '../context/franken-context.js';
/** Serialize a BeastContext to a JSON snapshot. */
export function serializeContext(ctx) {
    return {
        projectId: ctx.projectId,
        sessionId: ctx.sessionId,
        userInput: ctx.userInput,
        phase: ctx.phase,
        sanitizedIntent: ctx.sanitizedIntent,
        plan: ctx.plan,
        tokenSpend: ctx.tokenSpend,
        audit: ctx.audit,
        savedAt: new Date().toISOString(),
    };
}
/** Restore a BeastContext from a snapshot. */
export function deserializeContext(snapshot) {
    const ctx = new BeastContext(snapshot.projectId, snapshot.sessionId, snapshot.userInput);
    ctx.phase = snapshot.phase;
    ctx.sanitizedIntent = snapshot.sanitizedIntent;
    ctx.plan = snapshot.plan;
    ctx.tokenSpend = snapshot.tokenSpend;
    for (const entry of snapshot.audit) {
        ctx.audit.push(entry);
    }
    return ctx;
}
/** Save context snapshot to a file. */
export async function saveContext(ctx, filePath) {
    const snapshot = serializeContext(ctx);
    await writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
}
/** Load context snapshot from a file. */
export async function loadContext(filePath) {
    const raw = await readFile(filePath, 'utf-8');
    const snapshot = JSON.parse(raw);
    return deserializeContext(snapshot);
}
//# sourceMappingURL=context-serializer.js.map