export interface InterruptSignal {
    traceId: string;
    detectedPattern: string[];
    repetitions: number;
    timestamp: number;
}
type InterruptHandler = (signal: InterruptSignal) => void;
/**
 * Async-safe interrupt signal bus. Delivers signals to all registered
 * handlers. Handler errors are caught and isolated — the emitter never
 * throws and always delivers to remaining handlers.
 */
export declare class InterruptEmitter {
    private readonly handlers;
    emit(signal: InterruptSignal): void;
    on(event: 'interrupt', handler: InterruptHandler): void;
    off(event: 'interrupt', handler: InterruptHandler): void;
}
export {};
//# sourceMappingURL=InterruptEmitter.d.ts.map