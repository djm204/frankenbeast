export interface IEmbeddingProvider {
    /** Embed a batch of texts. Returns one vector per input string. */
    embed(texts: string[]): Promise<number[][]>;
}
//# sourceMappingURL=embedding-provider-interface.d.ts.map