import { describe, it, expect, vi, beforeEach } from "vitest";

// Records every Anthropic client construction and lets each test script the
// model's replies (a queue of Message-shaped objects).
const ctorCalls: unknown[] = [];
const createMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class AnthropicMock {
    messages = { create: createMock };
    constructor(opts: unknown) {
      ctorCalls.push(opts);
    }
  },
}));

const env = { llmApiKey: "", llmApiUrl: "", llmModel: "" };
vi.mock("../_core/env", () => ({ ENV: env }));

vi.mock("./persistence", () => ({
  createAgentRun: vi.fn(async () => 101),
  recordAgentStep: vi.fn(async () => undefined),
  completeAgentRun: vi.fn(async () => undefined),
}));
const dispatchTool = vi.fn(async () => "ok");
vi.mock("./tools/dispatch", () => ({ dispatchTool: (...a: unknown[]) => dispatchTool(...a) }));
vi.mock("./tools", () => ({ getTools: () => [] }));
vi.mock("./logger", () => ({ logAgent: vi.fn() }));

const endTurn = (text = "done") => ({
  content: [{ type: "text", text }],
  stop_reason: "end_turn",
  usage: { input_tokens: 1, output_tokens: 1 },
});

async function loadLoop() {
  vi.resetModules();
  return import("./loop");
}

describe("agent loop Anthropic client", () => {
  const savedAnthropicKey = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    ctorCalls.length = 0;
    createMock.mockReset();
    dispatchTool.mockClear();
    env.llmApiKey = "";
    env.llmApiUrl = "";
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterAllRestore(savedAnthropicKey);

  it("does not construct the client at import time, even with no key configured", async () => {
    await loadLoop();
    expect(ctorCalls).toHaveLength(0);
  });

  it("fails the run with a config error (not an import crash) when LLM_API_KEY is missing", async () => {
    const { runAgent } = await loadLoop();
    const result = await runAgent("goal", { userId: 1 } as any, { maxIterations: 1 });
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/LLM_API_KEY is not configured/);
    expect(ctorCalls).toHaveLength(0);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("builds the client from ENV.llmApiKey / ENV.llmApiUrl (trailing slash stripped) on first use, once", async () => {
    env.llmApiKey = "sk-from-env";
    env.llmApiUrl = "https://llm-proxy.example.com/v1/";
    createMock.mockResolvedValue(endTurn());

    const { runAgent } = await loadLoop();
    const first = await runAgent("goal", { userId: 1 } as any, { maxIterations: 5 });
    await runAgent("goal 2", { userId: 1 } as any, { maxIterations: 5 });

    expect(first.status).toBe("completed");
    expect(ctorCalls).toEqual([{ apiKey: "sk-from-env", baseURL: "https://llm-proxy.example.com/v1" }]);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("omits baseURL when LLM_API_URL is blank", async () => {
    env.llmApiKey = "sk-from-env";
    env.llmApiUrl = "   ";
    createMock.mockResolvedValue(endTurn());
    const { runAgent } = await loadLoop();
    await runAgent("goal", { userId: 1 } as any, { maxIterations: 5 });
    expect(ctorCalls).toEqual([{ apiKey: "sk-from-env", baseURL: undefined }]);
  });

  it("injects the run's companyId as scopeCompanyId on query_database tool calls only", async () => {
    env.llmApiKey = "sk-from-env";
    createMock
      .mockResolvedValueOnce({
        content: [
          { type: "tool_use", id: "t1", name: "query_database", input: { table: "orders", filters: { status: "open" } } },
          { type: "tool_use", id: "t2", name: "lookup_contact", input: { query: "acme" } },
        ],
        stop_reason: "tool_use",
        usage: { input_tokens: 1, output_tokens: 1 },
      })
      .mockResolvedValueOnce(endTurn());

    const { runAgent } = await loadLoop();
    const result = await runAgent("goal", { userId: 1 } as any, { maxIterations: 3, companyId: 42 });

    expect(result.status).toBe("completed");
    expect(dispatchTool).toHaveBeenCalledWith("query_database", {
      table: "orders",
      filters: { status: "open" },
      scopeCompanyId: 42,
    });
    expect(dispatchTool).toHaveBeenCalledWith("lookup_contact", { query: "acme" });
  });
});

function afterAllRestore(saved: string | undefined) {
  // Restore the real ANTHROPIC_API_KEY (if any) once this file is done.
  import("vitest").then(({ afterAll }) =>
    afterAll(() => {
      if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = saved;
    }),
  );
}
