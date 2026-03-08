import { Hono } from 'hono';
import type { CritiquePipeline } from '../pipeline/critique-pipeline.js';
export interface CritiqueAppOptions {
    bearerToken?: string;
    rateLimitPerMinute?: number;
    pipeline?: CritiquePipeline;
}
export declare function createCritiqueApp(options?: CritiqueAppOptions): Hono;
//# sourceMappingURL=app.d.ts.map