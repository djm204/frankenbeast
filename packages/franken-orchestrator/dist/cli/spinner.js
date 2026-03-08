const FRAMES = ['|', '/', '-', '\\'];
const INTERVAL_MS = 100;
export class Spinner {
    write;
    silent;
    interval = null;
    frameIdx = 0;
    label = '';
    startMs = 0;
    constructor(options = {}) {
        this.write = options.write ?? ((text) => process.stderr.write(text));
        this.silent = options.silent ?? false;
    }
    start(label) {
        if (this.silent)
            return;
        this.label = label;
        this.startMs = Date.now();
        this.frameIdx = 0;
        this.render();
        this.interval = setInterval(() => this.render(), INTERVAL_MS);
    }
    stop(finalMessage) {
        if (this.silent)
            return;
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.write('\r\x1b[K');
        if (finalMessage) {
            this.write(`${finalMessage}\n`);
        }
    }
    elapsed() {
        return Date.now() - this.startMs;
    }
    render() {
        const frame = FRAMES[this.frameIdx % FRAMES.length];
        const secs = ((Date.now() - this.startMs) / 1000).toFixed(1);
        this.write(`\r\x1b[K${frame} ${this.label} (${secs}s)`);
        this.frameIdx++;
    }
}
//# sourceMappingURL=spinner.js.map