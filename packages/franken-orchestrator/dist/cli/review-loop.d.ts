import type { InterviewIO } from '../planning/interview-loop.js';
export interface ReviewLoopOptions {
    /** Paths to display to the user */
    filePaths: string[];
    /** Label for what was generated (e.g., "Design document", "Chunk files") */
    artifactLabel: string;
    /** Called when user wants changes. Receives user feedback, returns updated file paths. */
    onRevise: (feedback: string) => Promise<string[]>;
    /** InterviewIO for user interaction */
    io: InterviewIO;
    /** Maximum revision rounds before forcing proceed (default: 10) */
    maxRevisions?: number;
}
/**
 * Runs a HITM review loop.
 * Displays file paths, asks user to proceed or request changes.
 * Returns when user approves.
 */
export declare function reviewLoop(options: ReviewLoopOptions): Promise<void>;
//# sourceMappingURL=review-loop.d.ts.map