import type { MemoryPort } from '../types/contracts.js';
import type { CritiqueLoopResult } from '../types/loop.js';
import type { TaskId } from '../types/common.js';
export declare class LessonRecorder {
    private readonly memory;
    constructor(memory: MemoryPort);
    record(result: CritiqueLoopResult, taskId: TaskId): Promise<void>;
    private extractLessons;
}
//# sourceMappingURL=lesson-recorder.d.ts.map