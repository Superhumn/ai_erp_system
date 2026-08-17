import { describe, it, expect, vi, beforeEach } from "vitest";

// Simulated inbox rows the fake DB returns for any select(). Declared via
// vi.hoisted so the hoisted vi.mock factory below can reference them.
const { FAKE_EMAILS } = vi.hoisted(() => ({
  FAKE_EMAILS: [
    {
      id: 12,
      messageId: "m-12",
      fromEmail: "ap@acme.com",
      fromName: "Acme AP",
      toEmail: "me@co.com",
      subject: "Invoice 1234 is overdue",
      bodyText: "Hi, invoice 1234 for $5,000 is now 15 days overdue. Please advise.",
      bodyHtml: null,
      receivedAt: new Date("2026-07-20T10:00:00Z"),
      category: "invoice",
      priority: "high",
    },
  ],
}));

// getDb returns a plain (non-thenable) db object; only the query CHAIN is
// thenable, so `await getDb()` yields the db, and `await db.select()...` yields
// the rows. The agent's startup count queries also hit this and harmlessly read
// `[0].count` as undefined -> 0.
vi.mock("./db", () => {
  const makeChain = () => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then: (resolve: (v: any) => any) => resolve(FAKE_EMAILS),
    };
    return chain;
  };
  return { getDb: async () => ({ select: () => makeChain() }) };
});

// Drive the LLM: first turn asks to call search_inbox, second turn answers.
const { invokeLLM } = vi.hoisted(() => ({ invokeLLM: vi.fn() }));
vi.mock("./_core/llm", () => ({
  invokeLLM: (...args: any[]) => invokeLLM(...args),
}));

import { processAIAgentRequest } from "./aiAgentService";

describe("inbox tools drive through the real agent path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invokeLLM
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: "",
            tool_calls: [{
              id: "call_1",
              function: { name: "search_inbox", arguments: JSON.stringify({ query: "Acme" }) },
            }],
          },
        }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "Found 1 email from Acme AP about invoice 1234." } }],
      });
  });

  it("executes search_inbox against the inbox and returns the results to the agent", async () => {
    const res = await processAIAgentRequest("find the latest email from Acme", [], {
      userId: 1, userName: "Jade", userRole: "admin",
    });

    // The tool actually ran and surfaced the inbox row in the agent's data.
    const searchResult = res.data?.search_inbox;
    expect(searchResult).toBeTruthy();
    expect(searchResult.count).toBe(1);
    expect(searchResult.emails[0].from).toBe("Acme AP <ap@acme.com>");
    expect(searchResult.emails[0].subject).toBe("Invoice 1234 is overdue");
    expect(searchResult.emails[0].snippet).toContain("overdue");

    // The action was recorded as completed and the agent produced its answer.
    const action = res.actions?.find((a) => a.type === "search_inbox");
    expect(action?.status).toBe("completed");
    expect(res.message).toContain("Acme");

    // Both inbox tools were advertised to the LLM.
    expect(invokeLLM.mock.calls[0][0].tools.some((t: any) => t.function.name === "search_inbox")).toBe(true);
    expect(invokeLLM.mock.calls[0][0].tools.some((t: any) => t.function.name === "read_email")).toBe(true);
  });
});
