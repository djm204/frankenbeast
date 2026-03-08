import { z } from 'zod';
export declare const MemoryStatusSchema: z.ZodEnum<{
    success: "success";
    failure: "failure";
    pending: "pending";
    compressed: "compressed";
}>;
export type MemoryStatus = z.infer<typeof MemoryStatusSchema>;
export declare function parseMemoryStatus(value: unknown): MemoryStatus;
declare const MemoryMetadataSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    status: z.ZodEnum<{
        success: "success";
        failure: "failure";
        pending: "pending";
        compressed: "compressed";
    }>;
    createdAt: z.ZodNumber;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type MemoryMetadata = z.infer<typeof MemoryMetadataSchema>;
export declare const WorkingTurnSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    status: z.ZodEnum<{
        success: "success";
        failure: "failure";
        pending: "pending";
        compressed: "compressed";
    }>;
    createdAt: z.ZodNumber;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodLiteral<"working">;
    role: z.ZodEnum<{
        user: "user";
        assistant: "assistant";
        tool: "tool";
    }>;
    content: z.ZodString;
    tokenCount: z.ZodNumber;
    pinned: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type WorkingTurn = z.infer<typeof WorkingTurnSchema>;
export declare const EpisodicTraceSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    status: z.ZodEnum<{
        success: "success";
        failure: "failure";
        pending: "pending";
        compressed: "compressed";
    }>;
    createdAt: z.ZodNumber;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodLiteral<"episodic">;
    taskId: z.ZodString;
    toolName: z.ZodOptional<z.ZodString>;
    input: z.ZodUnknown;
    output: z.ZodUnknown;
}, z.core.$strip>;
export type EpisodicTrace = z.infer<typeof EpisodicTraceSchema>;
export declare const SemanticChunkSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    status: z.ZodEnum<{
        success: "success";
        failure: "failure";
        pending: "pending";
        compressed: "compressed";
    }>;
    createdAt: z.ZodNumber;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodLiteral<"semantic">;
    source: z.ZodString;
    content: z.ZodString;
    embedding: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
}, z.core.$strip>;
export type SemanticChunk = z.infer<typeof SemanticChunkSchema>;
export declare const MemoryEntrySchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    status: z.ZodEnum<{
        success: "success";
        failure: "failure";
        pending: "pending";
        compressed: "compressed";
    }>;
    createdAt: z.ZodNumber;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodLiteral<"working">;
    role: z.ZodEnum<{
        user: "user";
        assistant: "assistant";
        tool: "tool";
    }>;
    content: z.ZodString;
    tokenCount: z.ZodNumber;
    pinned: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    status: z.ZodEnum<{
        success: "success";
        failure: "failure";
        pending: "pending";
        compressed: "compressed";
    }>;
    createdAt: z.ZodNumber;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodLiteral<"episodic">;
    taskId: z.ZodString;
    toolName: z.ZodOptional<z.ZodString>;
    input: z.ZodUnknown;
    output: z.ZodUnknown;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    status: z.ZodEnum<{
        success: "success";
        failure: "failure";
        pending: "pending";
        compressed: "compressed";
    }>;
    createdAt: z.ZodNumber;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodLiteral<"semantic">;
    source: z.ZodString;
    content: z.ZodString;
    embedding: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
}, z.core.$strip>], "type">;
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;
export declare function parseMemoryEntry(value: unknown): MemoryEntry;
export {};
//# sourceMappingURL=memory.d.ts.map