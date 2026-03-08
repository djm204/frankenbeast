import type { Eval, EvalResult } from './types.js';
export declare class EvalRunner {
    run<T>(ev: Eval<T>, input: T): Promise<EvalResult>;
    runAll<T>(evals: Eval<T>[], input: T): Promise<EvalResult[]>;
}
//# sourceMappingURL=EvalRunner.d.ts.map