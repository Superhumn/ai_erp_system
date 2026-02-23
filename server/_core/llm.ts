import { ENV } from "./env";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

// ── Public types (unchanged — all existing callers continue to work) ──

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

// ── Provider helpers ──

const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-20250514",
  google: "gemini-2.5-flash",
};

function getProviderAndModel() {
  const provider = ENV.llmProvider || "openai";
  const model = ENV.llmModel || DEFAULT_MODELS[provider] || DEFAULT_MODELS.openai;
  return { provider, model };
}

function getLanguageModel() {
  const { provider, model } = getProviderAndModel();

  // If legacy Forge API is configured and no new provider key is set, fall back to it
  if (provider === "openai" && !ENV.openaiApiKey && ENV.forgeApiKey) {
    const forge = createOpenAI({
      apiKey: ENV.forgeApiKey,
      baseURL: ENV.forgeApiUrl
        ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1`
        : "https://forge.manus.im/v1",
    });
    return forge(ENV.llmModel || "gemini-2.5-flash");
  }

  switch (provider) {
    case "anthropic": {
      if (!ENV.anthropicApiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
      const anthropic = createAnthropic({ apiKey: ENV.anthropicApiKey });
      return anthropic(model);
    }
    case "google": {
      if (!ENV.googleAiApiKey) throw new Error("GOOGLE_AI_API_KEY is not configured");
      const google = createGoogleGenerativeAI({ apiKey: ENV.googleAiApiKey });
      return google(model);
    }
    case "openai":
    default: {
      if (!ENV.openaiApiKey) throw new Error("OPENAI_API_KEY is not configured");
      const openai = createOpenAI({ apiKey: ENV.openaiApiKey });
      return openai(model);
    }
  }
}

// ── Message conversion ──

function convertMessages(messages: Message[]): Array<{
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<{ type: string; [key: string]: unknown }>;
  toolCallId?: string;
}> {
  const result: any[] = [];

  for (const msg of messages) {
    if (msg.role === "tool" || msg.role === "function") {
      const text = Array.isArray(msg.content)
        ? msg.content.map(p => (typeof p === "string" ? p : JSON.stringify(p))).join("\n")
        : typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);

      result.push({
        role: "tool" as const,
        content: text,
        toolCallId: msg.tool_call_id ?? msg.name ?? "unknown",
      });
      continue;
    }

    if (msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0) {
      // Convert assistant message with tool_calls into Vercel AI SDK format
      const textContent = typeof msg.content === "string" ? msg.content : "";
      result.push({
        role: "assistant" as const,
        content: [
          ...(textContent ? [{ type: "text", text: textContent }] : []),
          ...msg.tool_calls.map(tc => ({
            type: "tool-call",
            toolCallId: tc.id,
            toolName: tc.function.name,
            args: JSON.parse(tc.function.arguments || "{}"),
          })),
        ],
      });
      continue;
    }

    const parts = Array.isArray(msg.content) ? msg.content : [msg.content];
    const converted: any[] = [];

    for (const part of parts) {
      if (typeof part === "string") {
        converted.push({ type: "text", text: part });
      } else if (part.type === "text") {
        converted.push({ type: "text", text: part.text });
      } else if (part.type === "image_url") {
        converted.push({
          type: "image",
          image: part.image_url.url,
        });
      } else if (part.type === "file_url") {
        // Pass file URLs as text descriptions since not all providers support file content
        converted.push({
          type: "text",
          text: `[Attached file: ${part.file_url.url}]`,
        });
      }
    }

    // Collapse single text part to plain string for simpler API calls
    const content =
      converted.length === 1 && converted[0].type === "text"
        ? converted[0].text
        : converted;

    result.push({
      role: msg.role as "system" | "user" | "assistant",
      content,
    });
  }

  return result;
}

// ── Tool conversion ──

function convertTools(tools?: Tool[]): Record<string, { description?: string; parameters: unknown }> | undefined {
  if (!tools || tools.length === 0) return undefined;

  const result: Record<string, { description?: string; parameters: unknown }> = {};
  for (const tool of tools) {
    result[tool.function.name] = {
      description: tool.function.description,
      parameters: tool.function.parameters ?? { type: "object", properties: {} },
    };
  }
  return result;
}

function convertToolChoice(
  tc: ToolChoice | undefined,
  tools?: Tool[]
): "auto" | "none" | "required" | { type: "tool"; toolName: string } | undefined {
  if (!tc) return undefined;
  if (tc === "none") return "none";
  if (tc === "auto") return "auto";
  if (tc === "required") {
    if (tools && tools.length === 1) {
      return { type: "tool", toolName: tools[0].function.name };
    }
    return "required";
  }
  if ("name" in tc) {
    return { type: "tool", toolName: tc.name };
  }
  if ("type" in tc && tc.function) {
    return { type: "tool", toolName: tc.function.name };
  }
  return undefined;
}

// ── Main entry point ──

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    maxTokens,
    max_tokens,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  const languageModel = getLanguageModel();
  const convertedMessages = convertMessages(messages);
  const convertedTools = convertTools(tools);
  const convertedToolChoice = convertToolChoice(toolChoice || tool_choice, tools);
  const tokenLimit = maxTokens || max_tokens || 32768;

  // Build the generateText options
  const options: Parameters<typeof generateText>[0] = {
    model: languageModel,
    messages: convertedMessages as any,
    maxOutputTokens: tokenLimit,
  };

  if (convertedTools) {
    options.tools = convertedTools as any;
  }
  if (convertedToolChoice) {
    options.toolChoice = convertedToolChoice as any;
  }

  const result = await generateText(options);

  // Convert Vercel AI SDK result back to InvokeResult format for backward compatibility
  const toolCalls: ToolCall[] = (result.toolCalls || []).map((tc: any, idx: number) => ({
    id: tc.toolCallId || `call_${idx}`,
    type: "function" as const,
    function: {
      name: tc.toolName,
      arguments: JSON.stringify(tc.args),
    },
  }));

  return {
    id: result.response?.id ?? `gen_${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model: result.response?.modelId ?? "unknown",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: result.text ?? "",
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: result.finishReason ?? "stop",
      },
    ],
    usage: result.usage
      ? {
          prompt_tokens: result.usage.inputTokens ?? 0,
          completion_tokens: result.usage.outputTokens ?? 0,
          total_tokens: (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0),
        }
      : undefined,
  };
}
