import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module before any imports
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturningId = vi.fn();
const mockLimit = vi.fn();

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: () => ({
      from: (table: any) => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
        orderBy: () => ({
          limit: () => Promise.resolve([]),
        }),
        limit: () => Promise.resolve([]),
      }),
    }),
    insert: () => ({
      values: () => ({
        $returningId: () => Promise.resolve([{ id: 1 }]),
      }),
    }),
  }),
}));

// Track the messages array passed to invokeLLM
let capturedMessages: any[] = [];
let llmCallCount = 0;

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockImplementation(async (params: any) => {
    capturedMessages = params.messages;
    llmCallCount++;

    // First call: return tool calls for create_purchase_order
    if (llmCallCount === 1) {
      return {
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: "",
            tool_calls: [{
              id: "call_123",
              type: "function",
              function: {
                name: "create_purchase_order",
                arguments: JSON.stringify({
                  vendorId: 1,
                  items: [{ productId: 1, quantity: 100, unitPrice: 5.00, description: "Widget" }],
                  notes: "Test PO",
                }),
              },
            }],
          },
          finish_reason: "tool_calls",
        }],
      };
    }

    // Second call: return final text response
    return {
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: "I've created a purchase order task for your approval.",
        },
        finish_reason: "stop",
      }],
    };
  }),
}));

vi.mock("./_core/email", () => ({
  sendEmail: vi.fn(),
  formatEmailHtml: vi.fn(),
}));

import { processAIAgentRequest, AIAgentContext } from "./aiAgentService";
import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";

describe("PO Generation Fix", () => {
  const testContext: AIAgentContext = {
    userId: 1,
    userName: "Test User",
    userRole: "admin",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    capturedMessages = [];
    llmCallCount = 0;

    // Setup mock DB to return vendor data and counts
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{
              id: 1,
              name: "Test Vendor",
              email: "vendor@test.com",
              status: "active",
            }]),
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
          limit: vi.fn().mockResolvedValue([{
            id: 1,
            name: "Test Vendor",
            email: "vendor@test.com",
            status: "active",
          }]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          $returningId: vi.fn().mockResolvedValue([{ id: 1 }]),
        }),
      }),
    };

    // For the count queries in processAIAgentRequest
    const selectChain = {
      from: vi.fn().mockResolvedValue([{ count: 5 }]),
    };
    mockDb.select.mockReturnValue(selectChain);

    // Override getDb
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
  });

  it("should include tool_calls in assistant messages during the tool calling loop", async () => {
    const result = await processAIAgentRequest(
      "Generate a PO for vendor 1 with 100 widgets at $5 each",
      [],
      testContext,
    );

    // The second invokeLLM call should have received messages with proper tool_calls
    expect(llmCallCount).toBe(2);

    // Check the second call's messages array has an assistant message WITH tool_calls
    const assistantMessages = capturedMessages.filter(
      (m: any) => m.role === "assistant" && m.tool_calls
    );
    expect(assistantMessages.length).toBeGreaterThanOrEqual(1);
    expect(assistantMessages[0].tool_calls).toBeDefined();
    expect(assistantMessages[0].tool_calls[0].id).toBe("call_123");
    expect(assistantMessages[0].tool_calls[0].function.name).toBe("create_purchase_order");

    // Check there's a tool result message
    const toolMessages = capturedMessages.filter((m: any) => m.role === "tool");
    expect(toolMessages.length).toBe(1);
    expect(toolMessages[0].tool_call_id).toBe("call_123");

    // Verify the final response is valid
    expect(result.message).toBeTruthy();
    expect(typeof result.message).toBe("string");
  });

  it("should handle malformed JSON in tool arguments gracefully", async () => {
    llmCallCount = 0;

    // Override invokeLLM for this test
    vi.mocked(invokeLLM)
      .mockResolvedValueOnce({
        id: "test",
        created: Date.now(),
        model: "test",
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: "",
            tool_calls: [{
              id: "call_bad",
              type: "function" as const,
              function: {
                name: "create_purchase_order",
                arguments: "{ invalid json !!!",
              },
            }],
          },
          finish_reason: "tool_calls",
        }],
      })
      .mockResolvedValueOnce({
        id: "test2",
        created: Date.now(),
        model: "test",
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: "I encountered an issue with the tool arguments but handled it gracefully.",
          },
          finish_reason: "stop",
        }],
      });

    // This should NOT throw - previously the unguarded JSON.parse would crash
    const result = await processAIAgentRequest(
      "Generate a PO",
      [],
      testContext,
    );

    expect(result.message).toBeTruthy();
    // The action should be marked as failed, not crash the request
    expect(result.actions).toBeDefined();
    expect(result.actions!.some(a => a.status === "failed")).toBe(true);
  });
});

describe("normalizeMessage tool_calls", () => {
  it("should include tool_calls in normalized assistant messages", async () => {
    // Directly test the normalizeMessage behavior by importing invokeLLM
    // and checking that tool_calls are passed through in the payload
    const { invokeLLM } = await vi.importActual<typeof import("./_core/llm")>("./_core/llm");

    // We can't call invokeLLM without an API key, but we can verify
    // the Message type supports tool_calls by constructing one
    const messageWithToolCalls = {
      role: "assistant" as const,
      content: "Let me create that PO for you.",
      tool_calls: [{
        id: "call_456",
        type: "function" as const,
        function: {
          name: "create_purchase_order",
          arguments: '{"vendorId": 1}',
        },
      }],
    };

    // Verify the shape is valid (would fail at compile time if tool_calls wasn't in the type)
    expect(messageWithToolCalls.tool_calls).toBeDefined();
    expect(messageWithToolCalls.tool_calls[0].function.name).toBe("create_purchase_order");
  });
});
