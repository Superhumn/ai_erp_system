import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Provide a fake API key/model so invokeLLM doesn't throw and the model is stable.
vi.mock('./env', () => ({
  ENV: {
    llmApiKey: 'test-key',
    llmApiUrl: '',
    llmModel: 'claude-sonnet-4-20250514',
  },
}));

import { invokeLLM } from './llm';

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
