/**
 * Splits turns into those that must survive pruning and those that can be
 * compressed. Pure function — no side effects.
 *
 * Preservation rules (in priority order):
 *  1. Turns marked `pinned: true`
 *  2. The most recent Plan turn (assistant role, content starts with "[Plan]")
 *  3. The most recent tool turn (role === "tool")
 */
export function partitionForPruning(turns) {
    const preservedIds = new Set();
    // Rule 1: pinned
    for (const t of turns) {
        if (t.pinned === true)
            preservedIds.add(t.id);
    }
    // Rule 2: most recent Plan turn
    for (let i = turns.length - 1; i >= 0; i--) {
        const t = turns[i];
        if (t !== undefined && t.role === 'assistant' && t.content.startsWith('[Plan]')) {
            preservedIds.add(t.id);
            break;
        }
    }
    // Rule 3: most recent tool turn
    for (let i = turns.length - 1; i >= 0; i--) {
        const t = turns[i];
        if (t !== undefined && t.role === 'tool') {
            preservedIds.add(t.id);
            break;
        }
    }
    const preserved = [];
    const candidates = [];
    for (const t of turns) {
        if (preservedIds.has(t.id)) {
            preserved.push(t);
        }
        else {
            candidates.push(t);
        }
    }
    return { preserved, candidates };
}
//# sourceMappingURL=partition-for-pruning.js.map