import type { ILlmClient } from '@franken/types';
export interface ProgressLlmClientOptions {
    label?: string;
    silent?: boolean;
    write?: (text: string) => void;
}
export declare class ProgressLlmClient implements ILlmClient {
    private readonly inner;
    private readonly label;
    private readonly silent;
    private readonly write;
    constructor(inner: ILlmClient, options?: ProgressLlmClientOptions);
    complete(prompt: string): Promise<string>;
}
//# sourceMappingURL=progress-llm-client.d.ts.map