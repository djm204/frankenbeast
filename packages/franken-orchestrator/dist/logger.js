function formatLine(prefix, msg) {
    const timestamp = new Date().toISOString();
    return `${timestamp} ${prefix} ${msg}`;
}
function formatDebug(prefix, msg, data) {
    const base = formatLine(prefix, msg);
    if (data === undefined) {
        return base;
    }
    return `${base} ${JSON.stringify(data)}`;
}
export class ConsoleLogger {
    verbose;
    constructor(options) {
        this.verbose = options.verbose;
    }
    info(msg, _data) {
        console.log(formatLine('[beast]', msg));
    }
    debug(msg, data) {
        if (!this.verbose) {
            return;
        }
        console.log(formatDebug('[beast:debug]', msg, data));
    }
    warn(msg, _data) {
        console.warn(formatLine('[beast:warn]', msg));
    }
    error(msg, _data) {
        console.error(formatLine('[beast:error]', msg));
    }
}
export class NullLogger {
    info(_msg, _data) { }
    debug(_msg, _data) { }
    warn(_msg, _data) { }
    error(_msg, _data) { }
}
//# sourceMappingURL=logger.js.map