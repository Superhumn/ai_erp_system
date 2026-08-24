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
      mime_type?:
        | "audio/mpeg"
        | "audio/wav"
        | "application/pdf"
        | "audio/mp4"
        | "video/mp4";
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

export type WebSearchOptions = {
    /** Max number of web searches the model may run in a single turn (default 5). */
    maxUses?: number;
};

// Prompt caching (Anthropic ephemeral cache).
//
// Cache writes happen only at a cache breakpoint, and the cache is a prefix
// match — render order is `tools` → `system` → `messages`. The stable,
// reusable prefix for this codebase is the system prompt (and tool
// definitions); the incoming user message varies per request. So we place the
// breakpoint at the end of the system prompt and on the last tool, NOT on the
// trailing message. Marking the volatile final message (what top-level
// "automatic" caching would do) writes a fresh entry every request and never
// reads — see the prompt-caching docs' "common mistake".
//
// Caching is opt-in per call: pass `cache: true` (or a CacheOptions object).
// The 5-minute cache refreshes for free on each hit; use `ttl: "1h"` for
// prefixes reused less often than every 5 minutes (2x the write cost).
export type CacheTtl = "5m" | "1h";

export type CacheOptions = {
    // Cache the system prompt prefix (caches preceding tools too). Default true.
    system?: boolean;
    // Cache the tool definitions block. Default true when tools are present.
    tools?: boolean;
    // Cache lifetime. Default "5m".
    ttl?: CacheTtl;
};

export type CacheControlOption = boolean | CacheOptions;

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
    /**
     * Enable Anthropic's server-side web search tool so the model can look up
     * live information online before answering. Pass `true` for defaults or an
     * options object to tune it. Handled entirely server-side by the provider —
     * the final response is still plain text/tool_use blocks.
     */
    webSearch?: boolean | WebSearchOptions;
    cache?: CacheControlOption;
    cache_control?: CacheControlOption;
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
      // Anthropic prompt-caching breakdown (0 when caching is not in effect).
      // `prompt_tokens` above is the full input count
      // (uncached + cache reads + cache writes), so existing cost math stays
      // correct; these fields let callers track cache hit rates.
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
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

const assertApiKey = () => {
    if (!ENV.llmApiKey) {
          throw new Error(
                  "LLM_API_KEY is not configured. Set LLM_API_KEY in your environment. " +
                  "Get your Anthropic API key at: https://console.anthropic.com/settings/keys"
                );
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
// Anthropic Provider
// ============================================

function resolveAnthropicUrl(): string {
    const baseUrl =
          ENV.llmApiUrl && ENV.llmApiUrl.trim().length > 0
        ? ENV.llmApiUrl.trim().replace(/\/$/, "")
            : "https://api.anthropic.com";
    return `${baseUrl}/v1/messages`;
}

type AnthropicContentBlock =
    | { type: "text"; text: string; citations?: unknown }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  // Server-side tool blocks (e.g. web search). Emitted when webSearch is enabled;
  // handled by the provider, so we simply skip them when reading the response.
  | { type: "server_tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "web_search_tool_result"; tool_use_id: string; content: unknown };

type AnthropicResponse = {
    id: string;
    model: string;
    content: AnthropicContentBlock[];
    stop_reason: string | null;
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
};

type CacheControl = { type: "ephemeral"; ttl?: "1h" };

// Resolve the user-supplied cache option into a concrete config, or null when
// caching is disabled.
function resolveCacheOptions(
    option: CacheControlOption | undefined,
  ): { system: boolean; tools: boolean; control: CacheControl } | null {
    if (!option) return null;
    const opts: CacheOptions = option === true ? {} : option;
    const ttl = opts.ttl ?? "5m";
    const control: CacheControl =
          ttl === "1h" ? { type: "ephemeral", ttl: "1h" } : { type: "ephemeral" };
    return {
          system: opts.system ?? true,
          tools: opts.tools ?? true,
          control,
    };
}

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
                          source: {
                                      type: "url",
                                      url: part.file_url.url,
                                      media_type: part.file_url.mime_type ?? "application/pdf"
                          },
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
                                    content: typeof msg.content === "string"
                                      ? msg.content
                                                  : ensureArray(msg.content).map(p => typeof p === "string" ? p : JSON.stringify(p)).join("\n"),
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

function convertToolsToAnthropic(
    tools: Tool[],
    cacheControl?: CacheControl,
  ): unknown[] {
    const converted = tools.map(t => ({
          name: t.function.name,
          description: t.function.description ?? "",
          input_schema: t.function.parameters ?? { type: "object", properties: {} },
    }));
    // A single breakpoint on the last tool caches every preceding tool too.
    if (cacheControl && converted.length > 0) {
          (converted[converted.length - 1] as Record<string, unknown>).cache_control =
                  cacheControl;
    }
    return converted;
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
                finish_reason:
                          anthropicResp.stop_reason === "end_turn"
                    ? "stop"
                            : anthropicResp.stop_reason === "tool_use"
                      ? "tool_calls"
                              : anthropicResp.stop_reason,
        }],
        usage: buildUsage(anthropicResp.usage),
  };
}

function buildUsage(
    usage: AnthropicResponse["usage"],
  ): NonNullable<InvokeResult["usage"]> {
    const cacheCreation = usage.cache_creation_input_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    // `input_tokens` only counts tokens after the last cache breakpoint, so the
    // full prompt size is the sum of uncached + cache writes + cache reads.
    const promptTokens = usage.input_tokens + cacheCreation + cacheRead;
    return {
          prompt_tokens: promptTokens,
          completion_tokens: usage.output_tokens,
          total_tokens: promptTokens + usage.output_tokens,
          ...(cacheCreation > 0 ? { cache_creation_input_tokens: cacheCreation } : {}),
          ...(cacheRead > 0 ? { cache_read_input_tokens: cacheRead } : {}),
    };
}

// ============================================
// Main Entry Point (Anthropic Claude Only)
// ============================================

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
    assertApiKey();

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
        webSearch,
        cache,
        cache_control,
  } = params;

  const cacheConfig = resolveCacheOptions(cache ?? cache_control);

  const converted = convertMessagesToAnthropic(messages);

  const payload: Record<string, unknown> = {
        model: ENV.llmModel || "claude-opus-5",
        messages: converted.messages,
        max_tokens: maxTokens ?? max_tokens ?? 8192,
  };

  if (converted.system) {
        payload.system = converted.system;
  }

  const anthropicTools: unknown[] = [];
  if (tools && tools.length > 0) {
        anthropicTools.push(...convertToolsToAnthropic(
                tools,
                cacheConfig?.tools ? cacheConfig.control : undefined,
        ));
  }
  if (webSearch) {
        const maxUses =
              typeof webSearch === "object" && typeof webSearch.maxUses === "number"
                ? webSearch.maxUses
                : 5;
        anthropicTools.push({ type: "web_search_20250305", name: "web_search", max_uses: maxUses });
  }
  if (anthropicTools.length > 0) {
        payload.tools = anthropicTools;
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

  // Place the cache breakpoint at the end of the (now fully assembled) system
  // prompt. Done last so the cached prefix includes any appended JSON-schema
  // instruction; a breakpoint here also caches the preceding tools block.
  if (cacheConfig?.system && typeof payload.system === "string" && payload.system.length > 0) {
        payload.system = [
                {
                          type: "text",
                          text: payload.system,
                          cache_control: cacheConfig.control,
                },
        ];
  }

  // Server-side tools (e.g. web search) can pause a long turn: the API returns
  // stop_reason "pause_turn" with the partial assistant content. To continue, we
  // append that content and re-request until the turn actually ends. Without this,
  // a paused turn would surface as empty/partial text to the caller.
  const MAX_PAUSE_CONTINUATIONS = 4;
  const carriedText: string[] = [];
  let anthropicResp: AnthropicResponse;
  let continuations = 0;

  for (;;) {
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

        anthropicResp = (await response.json()) as AnthropicResponse;

        if (anthropicResp.stop_reason === "pause_turn" && continuations < MAX_PAUSE_CONTINUATIONS) {
              continuations++;
              for (const block of anthropicResp.content) {
                      if (block.type === "text") carriedText.push(block.text);
              }
              (payload.messages as unknown[]).push({ role: "assistant", content: anthropicResp.content });
              continue;
        }
        break;
  }

  // If the turn is still paused after the continuation cap, fail loudly rather
  // than handing callers a truncated/partial answer they might act on.
  if (anthropicResp.stop_reason === "pause_turn") {
        throw new Error(
              `LLM invoke did not complete: turn still paused after ${MAX_PAUSE_CONTINUATIONS} continuations`,
            );
  }

  const result = convertAnthropicResponse(anthropicResp);
    // Prepend any text emitted during the paused segments so nothing is lost.
    if (carriedText.length > 0) {
          const msg = result.choices[0].message;
          if (typeof msg.content === "string") {
                msg.content = carriedText.join("") + msg.content;
          }
    }
    return result;
}

// ============================================
// Streaming entry point (Anthropic SSE)
// ============================================

/**
 * Assemble the Anthropic request payload from InvokeParams. Mirrors the payload
 * building inside `invokeLLM` so the streaming path produces an identical request
 * (tools, web search, tool_choice, response-format, prompt caching). Kept separate
 * so the streaming variant can add `stream: true` without duplicating this logic
 * or altering the heavily-depended-on `invokeLLM`.
 */
function buildAnthropicPayload(params: InvokeParams): Record<string, unknown> {
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
    webSearch,
    cache,
    cache_control,
  } = params;

  const cacheConfig = resolveCacheOptions(cache ?? cache_control);
  const converted = convertMessagesToAnthropic(messages);

  const payload: Record<string, unknown> = {
    model: ENV.llmModel || "claude-opus-5",
    messages: converted.messages,
    max_tokens: maxTokens ?? max_tokens ?? 8192,
  };

  if (converted.system) {
    payload.system = converted.system;
  }

  const anthropicTools: unknown[] = [];
  if (tools && tools.length > 0) {
    anthropicTools.push(
      ...convertToolsToAnthropic(tools, cacheConfig?.tools ? cacheConfig.control : undefined),
    );
  }
  if (webSearch) {
    const maxUses =
      typeof webSearch === "object" && typeof webSearch.maxUses === "number"
        ? webSearch.maxUses
        : 5;
    anthropicTools.push({ type: "web_search_20250305", name: "web_search", max_uses: maxUses });
  }
  if (anthropicTools.length > 0) {
    payload.tools = anthropicTools;
  }

  const anthropicToolChoice = convertAnthropicToolChoice(toolChoice || tool_choice, tools);
  if (anthropicToolChoice) {
    payload.tool_choice = anthropicToolChoice;
  }

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

  if (cacheConfig?.system && typeof payload.system === "string" && payload.system.length > 0) {
    payload.system = [
      {
        type: "text",
        text: payload.system,
        cache_control: cacheConfig.control,
      },
    ];
  }

  return payload;
}

/**
 * A single event emitted while streaming an LLM turn: incremental text tokens,
 * followed by exactly one terminal `result` carrying the fully aggregated
 * InvokeResult (identical in shape to `invokeLLM`'s return).
 */
export type LLMStreamChunk =
  | { type: "text"; delta: string }
  | { type: "result"; result: InvokeResult };

type StreamBlockAccumulator = {
  type: string;
  raw: Record<string, unknown>;
  text: string;
  jsonBuf: string;
};

/**
 * Streaming counterpart to `invokeLLM`. Yields `{ type: "text", delta }` for each
 * incremental text token as Anthropic produces it, then yields exactly one
 * terminal `{ type: "result", result }` chunk carrying the fully aggregated
 * `InvokeResult` (identical in shape to `invokeLLM`'s) so callers can inspect
 * tool calls / finish reason exactly as before.
 *
 * Supports tools and server-side web search: `pause_turn` (emitted mid web search)
 * is handled by the same continuation strategy as `invokeLLM` — the partial
 * assistant content is echoed back and the request re-issued, all while text
 * deltas keep streaming. Pass `signal` to abort generation (e.g. a Stop button);
 * the abort propagates to the underlying fetch and ends the stream promptly.
 */
export async function* invokeLLMStream(
  params: InvokeParams & { signal?: AbortSignal },
): AsyncGenerator<LLMStreamChunk, void, void> {
  assertApiKey();

  const payload = buildAnthropicPayload(params);
  payload.stream = true;

  const MAX_PAUSE_CONTINUATIONS = 4;
  let continuations = 0;

  // Accumulated across the whole (possibly multi-continuation) turn.
  let fullText = "";
  const toolCalls: ToolCall[] = [];
  let respId = "";
  let respModel = (payload.model as string) ?? "";
  let stopReason: string | null = null;
  const usage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };

  for (;;) {
    const response = await fetch(resolveAnthropicUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ENV.llmApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
      signal: params.signal,
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `LLM stream failed: ${response.status} ${response.statusText} – ${errorText}`,
      );
    }

    // Blocks for THIS request only — reset each continuation so we can rebuild the
    // assistant content array to echo back on pause_turn.
    const blocks: Record<number, StreamBlockAccumulator> = {};
    stopReason = null;

    const decoder = new TextDecoder();
    let buffer = "";

    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });

      // Anthropic SSE frames are separated by a blank line ("\n\n").
      let sepIdx: number;
      while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);

        const dataStr = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("");
        if (!dataStr || dataStr === "[DONE]") continue;

        let evt: any;
        try {
          evt = JSON.parse(dataStr);
        } catch {
          continue;
        }

        switch (evt.type) {
          case "message_start": {
            respId = evt.message?.id ?? respId;
            respModel = evt.message?.model ?? respModel;
            const u = evt.message?.usage;
            if (u) {
              usage.input_tokens = u.input_tokens ?? usage.input_tokens;
              usage.cache_creation_input_tokens =
                u.cache_creation_input_tokens ?? usage.cache_creation_input_tokens;
              usage.cache_read_input_tokens =
                u.cache_read_input_tokens ?? usage.cache_read_input_tokens;
            }
            break;
          }
          case "content_block_start": {
            const cb = (evt.content_block ?? {}) as Record<string, unknown>;
            blocks[evt.index] = {
              type: (cb.type as string) ?? "text",
              raw: cb,
              text: "",
              jsonBuf: "",
            };
            break;
          }
          case "content_block_delta": {
            const d = evt.delta ?? {};
            const b = blocks[evt.index];
            if (d.type === "text_delta") {
              fullText += d.text;
              if (b) b.text += d.text;
              yield { type: "text", delta: d.text as string };
            } else if (d.type === "input_json_delta") {
              if (b) b.jsonBuf += d.partial_json ?? "";
            }
            break;
          }
          case "content_block_stop": {
            const b = blocks[evt.index];
            if (b && b.type === "tool_use") {
              // Prefer the streamed input_json_delta buffer, but fall back to the
              // `input` delivered on content_block_start if no deltas arrived, so
              // streamed tool_calls match the non-streaming convertAnthropicResponse.
              let input: Record<string, unknown> = {};
              try {
                input = b.jsonBuf
                  ? JSON.parse(b.jsonBuf)
                  : ((b.raw.input as Record<string, unknown>) ?? {});
              } catch {
                input = (b.raw.input as Record<string, unknown>) ?? {};
              }
              toolCalls.push({
                id: (b.raw.id as string) ?? "",
                type: "function",
                function: {
                  name: (b.raw.name as string) ?? "",
                  arguments: JSON.stringify(input),
                },
              });
            }
            break;
          }
          case "message_delta": {
            if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
            if (evt.usage?.output_tokens != null) usage.output_tokens = evt.usage.output_tokens;
            break;
          }
          case "error":
            throw new Error(
              `LLM stream error: ${evt.error?.type ?? "unknown"} – ${evt.error?.message ?? ""}`,
            );
          default:
            break;
        }
      }
    }

    // Server-side tools (web search) pause the turn: echo the partial assistant
    // content back and re-request, mirroring invokeLLM's continuation loop.
    if (stopReason === "pause_turn" && continuations < MAX_PAUSE_CONTINUATIONS) {
      continuations++;
      const assistantContent = Object.keys(blocks)
        .map((k) => Number(k))
        .sort((a, b) => a - b)
        .map((i) => {
          const b = blocks[i];
          if (b.type === "text") return { type: "text", text: b.text };
          if (b.type === "tool_use" || b.type === "server_tool_use") {
            let input: Record<string, unknown> = {};
            try {
              input = b.jsonBuf ? JSON.parse(b.jsonBuf) : (b.raw.input as Record<string, unknown>) ?? {};
            } catch {
              input = {};
            }
            return { ...b.raw, type: b.type, input };
          }
          // web_search_tool_result and any other server block: echo as delivered.
          return b.raw;
        });
      (payload.messages as unknown[]).push({ role: "assistant", content: assistantContent });
      continue;
    }
    break;
  }

  if (stopReason === "pause_turn") {
    throw new Error(
      `LLM stream did not complete: turn still paused after ${MAX_PAUSE_CONTINUATIONS} continuations`,
    );
  }

  const promptTokens =
    usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens;

  yield {
    type: "result",
    result: {
      id: respId || "stream",
      created: Math.floor(Date.now() / 1000),
      model: respModel,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: fullText,
            ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
          },
          finish_reason:
            stopReason === "end_turn"
              ? "stop"
              : stopReason === "tool_use"
                ? "tool_calls"
                : stopReason,
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: usage.output_tokens,
        total_tokens: promptTokens + usage.output_tokens,
        ...(usage.cache_creation_input_tokens > 0
          ? { cache_creation_input_tokens: usage.cache_creation_input_tokens }
          : {}),
        ...(usage.cache_read_input_tokens > 0
          ? { cache_read_input_tokens: usage.cache_read_input_tokens }
          : {}),
      },
    },
  };
}
