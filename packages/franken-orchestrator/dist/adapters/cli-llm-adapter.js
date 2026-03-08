import { spawn as nodeSpawn } from 'node:child_process';
export class CliLlmAdapter {
    provider;
    opts;
    _spawn;
    constructor(provider, opts, _spawnFn) {
        this.provider = provider;
        this.opts = {
            workingDir: opts.workingDir,
            timeoutMs: opts.timeoutMs ?? 120_000,
            ...(opts.commandOverride !== undefined ? { commandOverride: opts.commandOverride } : {}),
        };
        this._spawn = _spawnFn ?? nodeSpawn;
    }
    transformRequest(request) {
        const req = request;
        const userMessages = req.messages.filter((m) => m.role === 'user');
        const last = userMessages[userMessages.length - 1];
        return { prompt: last?.content ?? '', maxTurns: 1 };
    }
    async execute(providerRequest) {
        const { prompt, maxTurns } = providerRequest;
        const cmd = this.opts.commandOverride ?? this.provider.command;
        const args = this.provider.buildArgs({ maxTurns });
        args.push(prompt);
        const rawEnv = {};
        for (const [key, value] of Object.entries(process.env)) {
            if (value !== undefined)
                rawEnv[key] = value;
        }
        const env = this.provider.filterEnv(rawEnv);
        return new Promise((resolve, reject) => {
            const child = this._spawn(cmd, args, {
                stdio: ['ignore', 'pipe', 'pipe'],
                cwd: this.opts.workingDir,
                env,
            });
            let stdout = '';
            let stderr = '';
            let settled = false;
            const settle = (fn) => {
                if (settled)
                    return;
                settled = true;
                fn();
            };
            child.stdout.on('data', (chunk) => {
                stdout += chunk.toString();
            });
            child.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
            });
            const timer = setTimeout(() => {
                child.kill('SIGTERM');
                const killTimer = setTimeout(() => {
                    try {
                        child.kill('SIGKILL');
                    }
                    catch { /* already dead */ }
                }, 5_000);
                killTimer.unref();
                settle(() => reject(new Error(`CLI timeout after ${this.opts.timeoutMs}ms`)));
            }, this.opts.timeoutMs);
            child.on('close', (code) => {
                clearTimeout(timer);
                if (code !== 0) {
                    settle(() => reject(new Error(`CLI exited with code ${code}: ${stderr}`)));
                }
                else {
                    settle(() => resolve(stdout));
                }
            });
            child.on('error', (err) => {
                clearTimeout(timer);
                settle(() => reject(err));
            });
        });
    }
    transformResponse(providerResponse, _requestId) {
        const raw = providerResponse;
        if (!raw)
            return { content: '' };
        const normalized = this.provider.normalizeOutput(raw);
        return { content: normalized };
    }
    validateCapabilities(feature) {
        return feature === 'text-completion';
    }
}
//# sourceMappingURL=cli-llm-adapter.js.map