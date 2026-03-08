import type { UnifiedRequest } from "../../types/index.js";
/**
 * Canned inputs and provider-specific response shapes for conformance testing.
 * Each adapter must produce identical UnifiedResponse shapes from its own raw format.
 */
export declare const SIMPLE_TEXT_REQUEST: UnifiedRequest;
export declare const TOOL_CALL_REQUEST: UnifiedRequest;
export declare const CLAUDE_TEXT_RESPONSE: {
    id: string;
    type: "message";
    role: "assistant";
    model: string;
    content: {
        type: "text";
        text: string;
    }[];
    stop_reason: "end_turn";
    stop_sequence: null;
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
};
export declare const CLAUDE_TOOL_RESPONSE: {
    id: string;
    type: "message";
    role: "assistant";
    model: string;
    content: {
        type: "tool_use";
        id: string;
        name: string;
        input: {
            location: string;
            unit: string;
        };
    }[];
    stop_reason: "tool_use";
    stop_sequence: null;
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
};
export declare const OPENAI_TEXT_RESPONSE: {
    id: string;
    object: "chat.completion";
    created: number;
    model: string;
    choices: {
        index: number;
        message: {
            role: "assistant";
            content: string;
        };
        finish_reason: "stop";
    }[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
};
export declare const OPENAI_TOOL_RESPONSE: {
    id: string;
    object: "chat.completion";
    created: number;
    model: string;
    choices: {
        index: number;
        message: {
            role: "assistant";
            content: null;
            tool_calls: {
                id: string;
                type: "function";
                function: {
                    name: string;
                    arguments: string;
                };
            }[];
        };
        finish_reason: "tool_calls";
    }[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
};
export declare const PROVIDER_SPECIFIC_FIELDS: readonly ["content_block", "stop_reason", "stop_sequence", "anthropic", "choices", "prompt_tokens", "completion_tokens", "total_tokens", "created", "object"];
//# sourceMappingURL=conformance-fixtures.d.ts.map