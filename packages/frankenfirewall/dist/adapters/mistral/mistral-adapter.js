import { BaseAdapter } from "../base-adapter.js";
export class MistralAdapter extends BaseAdapter {
    constructor(config) {
        super({ costPerInputTokenM: 0, costPerOutputTokenM: 0 });
    }
    validateCapabilities(_feature) {
        throw new Error("Not implemented: MistralAdapter.validateCapabilities");
    }
    transformRequest(_request) {
        throw new Error("Not implemented: MistralAdapter.transformRequest");
    }
    async execute(_providerRequest) {
        throw new Error("Not implemented: MistralAdapter.execute");
    }
    transformResponse(_providerResponse, _requestId) {
        throw new Error("Not implemented: MistralAdapter.transformResponse");
    }
}
//# sourceMappingURL=mistral-adapter.js.map