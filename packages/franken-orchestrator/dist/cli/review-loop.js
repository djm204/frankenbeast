const PROCEED_PATTERNS = /^(y|yes|proceed|ok|lgtm|looks good|go|continue|ship it)$/i;
/**
 * Runs a HITM review loop.
 * Displays file paths, asks user to proceed or request changes.
 * Returns when user approves.
 */
export async function reviewLoop(options) {
    const { artifactLabel, onRevise, io, maxRevisions = 10 } = options;
    let { filePaths } = options;
    for (let i = 0; i < maxRevisions; i++) {
        io.display(`\n${artifactLabel} written to:\n${filePaths.map((p) => `  ${p}`).join('\n')}\n`);
        const answer = await io.ask('Would you like to proceed, or is there something you\'d like to change?');
        const trimmed = answer.trim();
        if (PROCEED_PATTERNS.test(trimmed)) {
            return;
        }
        // User wants changes — pass feedback to regeneration callback
        filePaths = await onRevise(trimmed);
    }
    io.display(`Maximum revisions (${maxRevisions}) reached. Proceeding with current output.`);
}
//# sourceMappingURL=review-loop.js.map