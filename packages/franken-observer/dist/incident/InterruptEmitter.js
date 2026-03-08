/**
 * Async-safe interrupt signal bus. Delivers signals to all registered
 * handlers. Handler errors are caught and isolated — the emitter never
 * throws and always delivers to remaining handlers.
 */
export class InterruptEmitter {
    handlers = new Set();
    emit(signal) {
        for (const handler of this.handlers) {
            try {
                handler(signal);
            }
            catch {
                // Isolate handler failures; other handlers still receive the signal.
            }
        }
    }
    on(event, handler) {
        this.handlers.add(handler);
    }
    off(event, handler) {
        this.handlers.delete(handler);
    }
}
//# sourceMappingURL=InterruptEmitter.js.map