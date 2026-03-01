import { ENV } from "./env";

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
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
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

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id, tool_calls } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    const result: Record<string, unknown> = {
      role,
      name,
      content: contentParts[0].text,
    };
    if (tool_calls && tool_calls.length > 0) {
      result.tool_calls = tool_calls;
    }
    return result;
  }

  const result: Record<string, unknown> = {
    role,
    name,
    content: contentParts,
  };
  if (tool_calls && tool_calls.length > 0) {
    result.tool_calls = tool_calls;
  }
  return result;
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const assertApiKey = () => {
  if (!ENV.llmApiKey) {
    throw new Error("LLM_API_KEY is not configured. Set LLM_API_KEY in your environment.");
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

// ============================================
// Provider Detection
// ============================================

function isAnthropicProvider(): boolean {
  const provider = (process.env.LLM_PROVIDER ?? "").toLowerCase();
  if (provider === "anthropic" || provider === "claude") return true;

  const model = (ENV.llmModel ?? "").toLowerCase();
  if (model.startsWith("claude")) return true;

  const url = (ENV.llmApiUrl ?? "").toLowerCase();
  if (url.includes("anthropic.com")) return true;

  return false;
}

// ============================================
// OpenAI Provider
// ============================================

function resolveOpenAIUrl(): string {
  const baseUrl = ENV.llmApiUrl && ENV.llmApiUrl.trim().length > 0
    ? ENV.llmApiUrl.trim().replace(/\/$/, "")
    : "https://api.openai.com";
  return `${baseUrl}/v1/chat/completions`;
}

async function invokeOpenAI(params: InvokeParams): Promise<InvokeResult> {
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  const payload: Record<string, unknown> = {
    model: ENV.llmModel || "gpt-4o",
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  payload.max_tokens = 32768;
  payload.thinking = {
    "budget_tokens": 128
  };

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  const response = await fetch(resolveOpenAIUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.llmApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  return (await response.json()) as InvokeResult;
}

// ============================================
// Anthropic Provider
// ============================================

function resolveAnthropicUrl(): string {
  const baseUrl = ENV.llmApiUrl && ENV.llmApiUrl.trim().length > 0
    ? ENV.llmApiUrl.trim().replace(/\/$/, "")
    : "https://api.anthropic.com";
  return `${baseUrl}/v1/messages`;
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

type AnthropicResponse = {
  id: string;
  model: string;
  content: AnthropicContentBlock[];
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
};

function convertContentToAnthropic(content: MessageContent | MessageContent[]): unknown {
  const parts = ensureArray(content);

  if (parts.length === 1 && typeof parts[0] === "string") {
    return parts[0];
  }

  return parts.map(part => {
    if (typeof part === "string") {
      return { type: "text", text: part };
    }
    if (part.type === "text") {
      return { type: "text", text: part.text };
    }
    if (part.type === "image_url") {
      return {
        type: "image",
        source: { type: "url", url: part.image_url.url },
      };
    }
    if (part.type === "file_url") {
      return {
        type: "document",
        source: { type: "url", url: part.file_url.url, media_type: part.file_url.mime_type ?? "application/pdf" },
      };
    }
    return { type: "text", text: JSON.stringify(part) };
  });
}

function convertMessagesToAnthropic(messages: Message[]): { system: string | undefined; messages: unknown[] } {
  let system: string | undefined;
  const anthropicMessages: unknown[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      const parts = ensureArray(msg.content);
      system = parts.map(p => (typeof p === "string" ? p : (p as TextContent).text ?? JSON.stringify(p))).join("\n");
      continue;
    }

    if (msg.role === "tool") {
      anthropicMessages.push({
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: msg.tool_call_id,
          content: typeof msg.content === "string" ? msg.content :
            ensureArray(msg.content).map(p => typeof p === "string" ? p : JSON.stringify(p)).join("\n"),
        }],
      });
      continue;
    }

    if (msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0) {
      const content: unknown[] = [];
      const textParts = ensureArray(msg.content);
      const textStr = textParts.map(p => typeof p === "string" ? p : (p as TextContent).text ?? "").filter(Boolean).join("\n");
      if (textStr) {
        content.push({ type: "text", text: textStr });
      }
      for (const tc of msg.tool_calls) {
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        });
      }
      anthropicMessages.push({ role: "assistant", content });
      continue;
    }

    anthropicMessages.push({
      role: msg.role === "function" ? "user" : msg.role,
      content: convertContentToAnthropic(msg.content),
    });
  }

  return { system, messages: anthropicMessages };
}

function convertToolsToAnthropic(tools: Tool[]): unknown[] {
  return tools.map(t => ({
    name: t.function.name,
    description: t.function.description ?? "",
    input_schema: t.function.parameters ?? { type: "object", properties: {} },
  }));
}

function convertAnthropicToolChoice(
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined,
): Record<string, unknown> | undefined {
  if (!toolChoice) return undefined;
  if (toolChoice === "none") return undefined;
  if (toolChoice === "auto") return { type: "auto" };
  if (toolChoice === "required") {
    if (tools && tools.length === 1) {
      return { type: "tool", name: tools[0].function.name };
    }
    return { type: "any" };
  }
  if ("name" in toolChoice) {
    return { type: "tool", name: toolChoice.name };
  }
  if ("function" in toolChoice) {
    return { type: "tool", name: toolChoice.function.name };
  }
  return undefined;
}

function convertAnthropicResponse(anthropicResp: AnthropicResponse): InvokeResult {
  let textContent = "";
  const toolCalls: ToolCall[] = [];

  for (const block of anthropicResp.content) {
    if (block.type === "text") {
      textContent += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      });
    }
  }

  return {
    id: anthropicResp.id,
    created: Math.floor(Date.now() / 1000),
    model: anthropicResp.model,
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: textContent,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
      finish_reason: anthropicResp.stop_reason === "end_turn" ? "stop" :
        anthropicResp.stop_reason === "tool_use" ? "tool_calls" :
        anthropicResp.stop_reason,
    }],
    usage: {
      prompt_tokens: anthropicResp.usage.input_tokens,
      completion_tokens: anthropicResp.usage.output_tokens,
      total_tokens: anthropicResp.usage.input_tokens + anthropicResp.usage.output_tokens,
    },
  };
}

async function invokeAnthropic(params: InvokeParams): Promise<InvokeResult> {
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

  const converted = convertMessagesToAnthropic(messages);

  const payload: Record<string, unknown> = {
    model: ENV.llmModel || "claude-sonnet-4-20250514",
    messages: converted.messages,
    max_tokens: maxTokens ?? max_tokens ?? 8192,
  };

  if (converted.system) {
    payload.system = converted.system;
  }

  if (tools && tools.length > 0) {
    payload.tools = convertToolsToAnthropic(tools);
  }

  const anthropicToolChoice = convertAnthropicToolChoice(toolChoice || tool_choice, tools);
  if (anthropicToolChoice) {
    payload.tool_choice = anthropicToolChoice;
  }

  // For JSON schema response format, inject as system prompt instruction
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat && normalizedResponseFormat.type === "json_schema") {
    const schemaStr = JSON.stringify(normalizedResponseFormat.json_schema.schema, null, 2);
    const jsonInstruction = `\n\nYou MUST respond with valid JSON matching this schema:\n${schemaStr}\n\nRespond ONLY with the JSON object, no other text.`;
    payload.system = (converted.system ?? "") + jsonInstruction;
  } else if (normalizedResponseFormat && normalizedResponseFormat.type === "json_object") {
    const jsonInstruction = `\n\nYou MUST respond with valid JSON. Respond ONLY with the JSON object, no other text.`;
    payload.system = (converted.system ?? "") + jsonInstruction;
  }

  const response = await fetch(resolveAnthropicUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ENV.llmApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  const anthropicResp = (await response.json()) as AnthropicResponse;
  return convertAnthropicResponse(anthropicResp);
}

// ============================================
// Main Entry Point
// ============================================

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  if (isAnthropicProvider()) {
    return invokeAnthropic(params);
  }

  return invokeOpenAI(params);
}
