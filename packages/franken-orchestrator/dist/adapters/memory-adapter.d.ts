import type { IMemoryModule, MemoryContext, EpisodicEntry } from '../deps.js';
export interface MemoryPortAdapterConfig {
    context?: MemoryContext | undefined;
}
export declare class MemoryPortAdapter implements IMemoryModule {
    private readonly traces;
    private readonly context;
    constructor(config?: MemoryPortAdapterConfig);
    frontload(_projectId: string): Promise<void>;
    getContext(_projectId: string): Promise<MemoryContext>;
    recordTrace(trace: EpisodicEntry): Promise<void>;
}
//# sourceMappingURL=memory-adapter.d.ts.map