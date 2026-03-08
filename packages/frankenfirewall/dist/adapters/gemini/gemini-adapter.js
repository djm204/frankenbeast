import { BaseAdapter } from "../base-adapter.js";
export class GeminiAdapter extends BaseAdapter {
    constructor(config) {
        super({ costPerInputTokenM: 0, costPerOutputTokenM: 0 });
    }
    validateCapabilities(_feature) {
        throw new Error("Not implemented: GeminiAdapter.validateCapabilities");
    }
    transformRequest(_request) {
        throw new Error("Not implemented: GeminiAdapter.transformRequest");
    }
    async execute(_providerRequest) {
        throw new Error("Not implemented: GeminiAdapter.execute");
    }
    transformResponse(_providerResponse, _requestId) {
        throw new Error("Not implemented: GeminiAdapter.transformResponse");
    }
}
//# sourceMappingURL=gemini-adapter.js.map