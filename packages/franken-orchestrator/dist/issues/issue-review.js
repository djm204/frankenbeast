const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low'];
const SEVERITY_RANK = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
};
const UNLABELLED_RANK = 4;
const TITLE_MAX = 50;
export class IssueReview {
    io;
    dryRun;
    constructor(io, options) {
        this.io = io;
        this.dryRun = options?.dryRun ?? false;
    }
    async review(issues, triage) {
        const issueMap = new Map();
        for (const issue of issues) {
            issueMap.set(issue.number, issue);
        }
        let entries = this.buildEntries(triage, issueMap);
        this.displayTable(entries);
        if (this.dryRun) {
            return { approved: [], action: 'abort' };
        }
        while (true) {
            this.io.write('Approve all? [Y/n/edit] ');
            const answer = (await this.io.read()).trim().toLowerCase();
            if (answer === '' || answer === 'y') {
                return {
                    approved: entries.map((e) => e.triage),
                    action: 'execute',
                };
            }
            if (answer === 'n') {
                return { approved: [], action: 'abort' };
            }
            if (answer === 'edit') {
                entries = await this.editLoop(entries);
                this.displayTable(entries);
            }
        }
    }
    buildEntries(triage, issueMap) {
        const entries = [];
        for (const t of triage) {
            const issue = issueMap.get(t.issueNumber);
            if (!issue)
                continue;
            const severity = this.extractSeverity(issue.labels);
            const rank = severity !== '-' ? (SEVERITY_RANK[severity] ?? UNLABELLED_RANK) : UNLABELLED_RANK;
            entries.push({ issue, triage: t, severity, severityRank: rank });
        }
        entries.sort((a, b) => {
            if (a.severityRank !== b.severityRank)
                return a.severityRank - b.severityRank;
            return a.issue.number - b.issue.number;
        });
        return entries;
    }
    extractSeverity(labels) {
        for (const label of labels) {
            const lower = label.toLowerCase();
            if (SEVERITY_LEVELS.includes(lower)) {
                return lower;
            }
        }
        return '-';
    }
    truncateTitle(title) {
        if (title.length <= TITLE_MAX)
            return title;
        return title.slice(0, TITLE_MAX - 3) + '...';
    }
    displayTable(entries) {
        const numWidth = Math.max(1, ...entries.map((e) => String(e.issue.number).length));
        const sevWidth = Math.max(8, ...entries.map((e) => e.severity.length));
        const cplxWidth = Math.max(10, ...entries.map((e) => e.triage.complexity.length));
        const header = '#'.padStart(numWidth) +
            '  ' +
            'Title'.padEnd(TITLE_MAX) +
            '  ' +
            'Severity'.padEnd(sevWidth) +
            '  ' +
            'Complexity'.padEnd(cplxWidth) +
            '  ' +
            'Rationale';
        const separator = '-'.repeat(header.length);
        this.io.write(header + '\n');
        this.io.write(separator + '\n');
        for (const entry of entries) {
            const line = String(entry.issue.number).padStart(numWidth) +
                '  ' +
                this.truncateTitle(entry.issue.title).padEnd(TITLE_MAX) +
                '  ' +
                entry.severity.padEnd(sevWidth) +
                '  ' +
                entry.triage.complexity.padEnd(cplxWidth) +
                '  ' +
                entry.triage.rationale;
            this.io.write(line + '\n');
        }
        this.io.write('\n');
    }
    async editLoop(entries) {
        const validNumbers = new Set(entries.map((e) => e.issue.number));
        while (true) {
            this.io.write('Enter issue numbers to remove (comma-separated): ');
            const input = await this.io.read();
            const parts = input.split(',').map((s) => s.trim()).filter(Boolean);
            const parsed = [];
            const invalid = [];
            for (const part of parts) {
                const num = parseInt(part, 10);
                if (isNaN(num) || !validNumbers.has(num)) {
                    invalid.push(part);
                }
                else {
                    parsed.push(num);
                }
            }
            if (invalid.length > 0) {
                this.io.write(`Invalid issue number(s): ${invalid.join(', ')}\n`);
                continue;
            }
            if (parsed.length === 0) {
                continue;
            }
            const removeSet = new Set(parsed);
            return entries.filter((e) => !removeSet.has(e.issue.number));
        }
    }
}
//# sourceMappingURL=issue-review.js.map