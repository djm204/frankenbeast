const MAX_QUESTIONS = 5;
const MAX_REVISIONS = 3;
/**
 * GraphBuilder that interviews the user to gather requirements,
 * generates a design document via LLM, and delegates to LlmGraphBuilder
 * for decomposition into a PlanGraph.
 *
 * This is Mode 3 (interview input) — the full "idea to PR" pipeline.
 */
export class InterviewLoop {
    llm;
    io;
    graphBuilder;
    constructor(llm, io, graphBuilder) {
        this.llm = llm;
        this.io = io;
        this.graphBuilder = graphBuilder;
    }
    async build(intent) {
        const answers = await this.gatherAnswers(intent.goal);
        let designDoc = await this.generateDesignDoc(intent.goal, answers);
        let revisions = 0;
        while (true) {
            this.io.display(designDoc);
            const approval = await this.io.ask('Approve this design? (yes/no)');
            if (this.isApproved(approval)) {
                return this.graphBuilder.build({ ...intent, goal: designDoc });
            }
            revisions++;
            if (revisions > MAX_REVISIONS) {
                throw new Error(`Maximum ${MAX_REVISIONS} revision rounds reached. Aborting interview loop.`);
            }
            const feedback = await this.io.ask('What would you like to change?');
            designDoc = await this.reviseDesignDoc(intent.goal, answers, designDoc, feedback);
        }
    }
    async gatherAnswers(goal) {
        const raw = await this.llm.complete(`Given the following goal, what clarifying questions do you need to ask?\n\n` +
            `Goal: ${goal}\n\n` +
            `Respond with numbered questions only (e.g., "1. Question?"). ` +
            `Maximum ${MAX_QUESTIONS} questions.`);
        const questions = this.parseQuestions(raw);
        const answers = [];
        for (const question of questions) {
            const answer = await this.io.ask(question);
            answers.push({ question, answer });
        }
        return answers;
    }
    parseQuestions(raw) {
        const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
        const questions = [];
        for (const line of lines) {
            // Match numbered questions like "1. What...?" or "1) What...?"
            const match = line.match(/^\d+[.)]\s*(.+)/);
            if (match) {
                questions.push(match[1]);
            }
        }
        return questions.slice(0, MAX_QUESTIONS);
    }
    async generateDesignDoc(goal, answers) {
        const answersText = answers
            .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
            .join('\n\n');
        return this.llm.complete(`Generate a design document for the following project.\n\n` +
            `## Goal\n${goal}\n\n` +
            (answersText
                ? `## Clarifying Questions and Answers\n${answersText}\n\n`
                : '') +
            `## Format\n` +
            `The design document should include these sections:\n` +
            `- Problem\n- Goal\n- Architecture\n- Components\n- Data Flow\n- Success Criteria\n\n` +
            `Write the complete design document now.`);
    }
    async reviseDesignDoc(goal, answers, currentDoc, feedback) {
        const answersText = answers
            .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
            .join('\n\n');
        return this.llm.complete(`Revise the following design document based on the user's feedback.\n\n` +
            `## Goal\n${goal}\n\n` +
            (answersText
                ? `## Clarifying Questions and Answers\n${answersText}\n\n`
                : '') +
            `## Current Design Document\n${currentDoc}\n\n` +
            `## User Feedback\n${feedback}\n\n` +
            `Write the revised design document now.`);
    }
    isApproved(response) {
        const normalized = response.trim().toLowerCase();
        return normalized === 'yes' || normalized === 'y';
    }
}
//# sourceMappingURL=interview-loop.js.map