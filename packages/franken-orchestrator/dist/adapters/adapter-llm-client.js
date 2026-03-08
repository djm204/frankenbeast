export class AdapterLlmClient {
    adapter;
    constructor(adapter) {
        this.adapter = adapter;
    }
    async complete(prompt) {
        const requestId = `llm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const request = {
            id: requestId,
            provider: 'adapter',
            model: 'adapter',
            messages: [{ role: 'user', content: prompt }],
        };
        const providerRequest = this.adapter.transformRequest(request);
        const providerResponse = await this.adapter.execute(providerRequest);
        const response = this.adapter.transformResponse(providerResponse, requestId);
        return response.content ?? '';
    }
}
//# sourceMappingURL=adapter-llm-client.js.map