const VALID_COMPLEXITIES = new Set(['one-shot', 'chunked']);
const MAX_BODY_LENGTH = 2000;
export class IssueTriage {
    complete;
    constructor(complete) {
        this.complete = complete;
    }
    async triage(issues) {
        const prompt = this.buildPrompt(issues);
        let lastError;
        for (let attempt = 0; attempt < 2; attempt++) {
            const raw = await this.complete(prompt);
            try {
                const parsed = this.extractAndParse(raw);
                return this.toTriageResults(parsed);
            }
            catch (err) {
                lastError = err;
            }
        }
        throw lastError;
    }
    buildPrompt(issues) {
        const issueList = issues
            .map((issue) => {
            const body = issue.body.length > MAX_BODY_LENGTH
                ? issue.body.slice(0, MAX_BODY_LENGTH)
                : issue.body;
            return `### Issue #${issue.number}: ${issue.title}\n${body}`;
        })
            .join('\n\n');
        return `You are an issue triage assistant. Classify each GitHub issue by complexity.

## Classification Criteria

- **one-shot**: single file or tightly scoped change, 1-2 acceptance criteria, straightforward fix
- **chunked**: multi-file changes, 3+ acceptance criteria, architectural changes, multiple concerns

## Issues

${issueList}

## Instructions

Return a JSON array with one entry per issue. Each entry must have these fields:
- issueNumber (number)
- complexity ("one-shot" or "chunked")
- rationale (string explaining the classification)
- estimatedScope (string describing files/areas affected)

Return ONLY the JSON array, no other text.`;
    }
    extractAndParse(raw) {
        const start = raw.indexOf('[');
        const end = raw.lastIndexOf(']');
        if (start === -1 || end === -1 || end <= start) {
            throw new Error('No JSON array found in LLM response');
        }
        const jsonStr = raw.slice(start, end + 1);
        const parsed = JSON.parse(jsonStr);
        if (!Array.isArray(parsed)) {
            throw new Error('Parsed value is not an array');
        }
        return parsed;
    }
    toTriageResults(parsed) {
        const results = parsed.map((entry) => {
            const obj = entry;
            const complexity = typeof obj['complexity'] === 'string' && VALID_COMPLEXITIES.has(obj['complexity'])
                ? obj['complexity']
                : 'one-shot';
            return {
                issueNumber: typeof obj['issueNumber'] === 'number' ? obj['issueNumber'] : 0,
                complexity,
                rationale: typeof obj['rationale'] === 'string' ? obj['rationale'] : 'No rationale provided',
                estimatedScope: typeof obj['estimatedScope'] === 'string' ? obj['estimatedScope'] : 'Unknown scope',
            };
        });
        return results.sort((a, b) => a.issueNumber - b.issueNumber);
    }
}
//# sourceMappingURL=issue-triage.js.map