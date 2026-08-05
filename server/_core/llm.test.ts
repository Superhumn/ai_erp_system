import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Provide a fake API key/model so invokeLLM doesn't throw and the model is stable.
vi.mock('./env', () => ({
  ENV: {
    llmApiKey: 'test-key',
    llmApiUrl: '',
    llmModel: 'claude-sonnet-4-20250514',
  },
}));

import { invokeLLM, invokeLLMStream } from './llm';

type CapturedRequest = { url: string; body: any };

function mockFetch(usage?: Record<string, number>): {
  fetchMock: ReturnType<typeof vi.fn>;
  captured: CapturedRequest[];
} {
  const captured: CapturedRequest[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    captured.push({ url, body: JSON.parse(init.body as string) });
    return {
      ok: true,
      json: async () => ({
        id: 'msg_1',
        model: 'claude-sonnet-4-20250514',
        content: [{ type: 'text', text: 'hi' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5, ...usage },
      }),
    } as any;
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, captured };
}

// Encode a list of Anthropic SSE events into a single byte chunk, then expose it
// as an async-iterable body (what invokeLLMStream reads via `response.body`).
function mockStreamFetch(events: any[]): ReturnType<typeof vi.fn> {
  const enc = new TextEncoder();
  const payload = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  const bytes = enc.encode(payload);
  const body = {
    async *[Symbol.asyncIterator]() {
      yield bytes;
    },
  };
  const fetchMock = vi.fn(async () => ({ ok: true, body }) as any);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// Like mockStreamFetch, but returns a different SSE body on each successive
// fetch call — used to exercise the pause_turn continuation loop (each
// continuation is a separate request). Also captures each request body.
function mockStreamFetchSequence(eventLists: any[][]): {
  fetchMock: ReturnType<typeof vi.fn>;
  captured: any[];
} {
  const enc = new TextEncoder();
  const captured: any[] = [];
  let call = 0;
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    captured.push(JSON.parse(init.body as string));
    const events = eventLists[Math.min(call, eventLists.length - 1)];
    call++;
    const payload = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
    const bytes = enc.encode(payload);
    const body = {
      async *[Symbol.asyncIterator]() {
        yield bytes;
      },
    };
    return { ok: true, body } as any;
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, captured };
}

// Drive the generator to completion, collecting yielded text deltas and the
// returned aggregated InvokeResult.
async function drain(
  gen: AsyncGenerator<{ type: 'text'; delta: string } | { type: 'result'; result: any }, void, void>,
): Promise<{ deltas: string[]; result: any }> {
  const deltas: string[] = [];
  let result: any;
  for await (const chunk of gen) {
    if (chunk.type === 'text') deltas.push(chunk.delta);
    else result = chunk.result;
  }
  return { deltas, result };
}

describe('invokeLLMStream', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('streams text deltas in order and aggregates the final message', async () => {
    mockStreamFetch([
      { type: 'message_start', message: { id: 'msg_1', model: 'claude-sonnet-4-20250514', usage: { input_tokens: 10 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ', ' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'world' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
      { type: 'message_stop' },
    ]);

    const { deltas, result } = await drain(invokeLLMStream({ messages: [{ role: 'user', content: 'hi' }] }));

    expect(deltas).toEqual(['Hello', ', ', 'world']);
    expect(result.choices[0].message.content).toBe('Hello, world');
    expect(result.choices[0].message.tool_calls).toBeUndefined();
    expect(result.choices[0].finish_reason).toBe('stop');
    expect(result.usage.completion_tokens).toBe(3);
  });

  it('sets stream: true on the request payload', async () => {
    const fetchMock = mockStreamFetch([
      { type: 'message_start', message: { id: 'm', model: 'x', usage: { input_tokens: 1 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hi' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
    ]);
    await drain(invokeLLMStream({ messages: [{ role: 'user', content: 'hi' }] }));
    const body = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(body.stream).toBe(true);
  });

  it('aggregates a streamed tool_use block into tool_calls', async () => {
    mockStreamFetch([
      { type: 'message_start', message: { id: 'msg_2', model: 'claude-sonnet-4-20250514', usage: { input_tokens: 12 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu_1', name: 'create_shipment', input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"orderId":' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '42}' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 8 } },
      { type: 'message_stop' },
    ]);

    const { deltas, result } = await drain(invokeLLMStream({ messages: [{ role: 'user', content: 'ship it' }] }));

    expect(deltas).toEqual([]); // no text tokens on a pure tool turn
    const toolCalls = result.choices[0].message.tool_calls;
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].function.name).toBe('create_shipment');
    expect(JSON.parse(toolCalls[0].function.arguments)).toEqual({ orderId: 42 });
    expect(result.choices[0].finish_reason).toBe('tool_calls');
  });

  it('falls back to content_block_start input when no json deltas are streamed', async () => {
    mockStreamFetch([
      { type: 'message_start', message: { id: 'msg_c', model: 'claude-sonnet-4-20250514', usage: { input_tokens: 5 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu_2', name: 'query_system', input: { module: 'inventory' } } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 4 } },
      { type: 'message_stop' },
    ]);

    const { result } = await drain(invokeLLMStream({ messages: [{ role: 'user', content: 'check inventory' }] }));

    const toolCalls = result.choices[0].message.tool_calls;
    expect(toolCalls).toHaveLength(1);
    // No input_json_delta was sent, so the input must come from content_block_start.
    expect(JSON.parse(toolCalls[0].function.arguments)).toEqual({ module: 'inventory' });
  });

  it('continues across a pause_turn and aggregates text from all requests', async () => {
    const { fetchMock, captured } = mockStreamFetchSequence([
      // First request pauses mid-turn (as server-side web search does).
      [
        { type: 'message_start', message: { id: 'msg_a', model: 'claude-sonnet-4-20250514', usage: { input_tokens: 10 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Let me check. ' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'pause_turn' }, usage: { output_tokens: 2 } },
      ],
      // Continuation completes the turn.
      [
        { type: 'message_start', message: { id: 'msg_b', model: 'claude-sonnet-4-20250514', usage: { input_tokens: 20 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'The answer is 42.' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
        { type: 'message_stop' },
      ],
    ]);

    const { deltas, result } = await drain(invokeLLMStream({ messages: [{ role: 'user', content: 'ask' }], webSearch: true }));

    // Two requests were made (original + one continuation).
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Tokens from both requests stream in order...
    expect(deltas).toEqual(['Let me check. ', 'The answer is 42.']);
    // ...and the aggregated result concatenates them and ends cleanly.
    expect(result.choices[0].message.content).toBe('Let me check. The answer is 42.');
    expect(result.choices[0].finish_reason).toBe('stop');
    // The continuation echoes the paused assistant content back to the API.
    const secondRequestMessages = captured[1].messages;
    expect(secondRequestMessages[secondRequestMessages.length - 1].role).toBe('assistant');
  });
});

describe('invokeLLM prompt caching', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('does not add cache_control by default', async () => {
    const { captured } = mockFetch();
    await invokeLLM({
      messages: [
        { role: 'system', content: 'You are a helpful ERP assistant.' },
        { role: 'user', content: 'Hello' },
      ],
    });
    expect(typeof captured[0].body.system).toBe('string');
    expect(JSON.stringify(captured[0].body)).not.toContain('cache_control');
  });

  it('caches the system prompt prefix when cache: true', async () => {
    const { captured } = mockFetch();
    await invokeLLM({
      cache: true,
      messages: [
        { role: 'system', content: 'You are a helpful ERP assistant.' },
        { role: 'user', content: 'Hello' },
      ],
    });
    const system = captured[0].body.system;
    expect(Array.isArray(system)).toBe(true);
    expect(system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(system[0].text).toBe('You are a helpful ERP assistant.');
  });

  it('caches the system prompt including an appended JSON-schema instruction', async () => {
    const { captured } = mockFetch();
    await invokeLLM({
      cache: true,
      messages: [
        { role: 'system', content: 'Base prompt.' },
        { role: 'user', content: 'Extract' },
      ],
      outputSchema: {
        name: 'thing',
        schema: { type: 'object', properties: { a: { type: 'string' } } },
      },
    });
    const system = captured[0].body.system;
    expect(Array.isArray(system)).toBe(true);
    // Breakpoint must cover the whole assembled system text, schema included.
    expect(system[0].text).toContain('Base prompt.');
    expect(system[0].text).toContain('valid JSON matching this schema');
    expect(system[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('marks the last tool with the cache breakpoint', async () => {
    const { captured } = mockFetch();
    await invokeLLM({
      cache: true,
      messages: [{ role: 'user', content: 'Hello' }],
      tools: [
        { type: 'function', function: { name: 'a', description: 'A' } },
        { type: 'function', function: { name: 'b', description: 'B' } },
      ],
    });
    const tools = captured[0].body.tools;
    expect(tools[0].cache_control).toBeUndefined();
    expect(tools[1].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('supports a 1-hour TTL', async () => {
    const { captured } = mockFetch();
    await invokeLLM({
      cache: { ttl: '1h' },
      messages: [
        { role: 'system', content: 'Long-lived prompt.' },
        { role: 'user', content: 'Hi' },
      ],
    });
    expect(captured[0].body.system[0].cache_control).toEqual({
      type: 'ephemeral',
      ttl: '1h',
    });
  });

  it('can cache only tools, leaving the system prompt as a plain string', async () => {
    const { captured } = mockFetch();
    await invokeLLM({
      cache: { system: false, tools: true },
      messages: [
        { role: 'system', content: 'Prompt.' },
        { role: 'user', content: 'Hi' },
      ],
      tools: [{ type: 'function', function: { name: 'a' } }],
    });
    expect(typeof captured[0].body.system).toBe('string');
    expect(captured[0].body.tools[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('reports cache usage and a full prompt-token total', async () => {
    mockFetch({
      input_tokens: 10,
      cache_creation_input_tokens: 100,
      cache_read_input_tokens: 900,
    });
    const result = await invokeLLM({
      cache: true,
      messages: [
        { role: 'system', content: 'Prompt.' },
        { role: 'user', content: 'Hi' },
      ],
    });
    // prompt_tokens = uncached + cache writes + cache reads = 10 + 100 + 900.
    expect(result.usage?.prompt_tokens).toBe(1010);
    expect(result.usage?.cache_creation_input_tokens).toBe(100);
    expect(result.usage?.cache_read_input_tokens).toBe(900);
    expect(result.usage?.total_tokens).toBe(1015);
  });
});
