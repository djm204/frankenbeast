/** Content item returned from a tool call. */
export type McpContent = {
    type: "text";
    text: string;
} | {
    type: "image";
    data: string;
    mimeType: string;
} | {
    type: "resource_link";
    uri: string;
};
/** Result of invoking an MCP tool via tools/call. */
export interface McpToolResult {
    /** Content items returned by the tool. */
    content: McpContent[];
    /** Whether the tool reported an error. */
    isError: boolean;
}
