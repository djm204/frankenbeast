import { type ChildProcess, type SpawnOptions } from 'node:child_process';
import type { IAdapter } from './adapter-llm-client.js';
import type { ICliProvider } from '../skills/providers/cli-provider.js';
type CliTransformed = {
    prompt: string;
    maxTurns: number;
};
type SpawnFn = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
export interface CliLlmAdapterOpts {
    workingDir: string;
    timeoutMs?: number;
    commandOverride?: string;
}
export declare class CliLlmAdapter implements IAdapter {
    private readonly provider;
    private readonly opts;
    private readonly _spawn;
    constructor(provider: ICliProvider, opts: CliLlmAdapterOpts, _spawnFn?: SpawnFn);
    transformRequest(request: unknown): CliTransformed;
    execute(providerRequest: unknown): Promise<string>;
    transformResponse(providerResponse: unknown, _requestId: string): {
        content: string | null;
    };
    validateCapabilities(feature: string): boolean;
}
export {};
//# sourceMappingURL=cli-llm-adapter.d.ts.map