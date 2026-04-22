import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock external dependencies before importing the module under test
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

vi.mock("./db", () => ({
  getProjects: vi.fn(),
  getCustomerByEmail: vi.fn(),
  createAiAgentLog: vi.fn(),
}));

vi.mock("./db/projects", () => ({
  getProjectTaskBySourceExternalId: vi.fn(),
}));

vi.mock("./taskAgentBridge", () => ({
  createProjectTaskFromSource: vi.fn(),
}));

import { invokeLLM } from "./_core/llm";
import * as db from "./db";
import { getProjectTaskBySourceExternalId } from "./db/projects";
import { createProjectTaskFromSource } from "./taskAgentBridge";
import {
  preFilter,
  computeSignalBoost,
  classifyEmail,
  extractAndCreateTasks,
  DEFAULT_EXTRACTION_CONFIG,
  type ExtractionConfig,
} from "./emailTaskExtractor";

const mockInvokeLLM = vi.mocked(invokeLLM);
const mockDb = vi.mocked(db);
const mockGetProjectTaskBySourceExternalId = vi.mocked(getProjectTaskBySourceExternalId);
const mockCreateProjectTaskFromSource = vi.mocked(createProjectTaskFromSource);

// Minimal email that passes pre-filter
const validEmail = {
  messageId: "<test-123@example.com>",
  from: { address: "john@acme.com", name: "John Smith" },
  subject: "Please review the contract",
  bodyText: "Hi, could you please review the attached contract and let me know your thoughts before EOD Friday?",
  date: new Date("2025-06-01T10:00:00Z"),
};

// Helper to build a fake LLM response
function makeLlmResponse(payload: object): any {
  return {
    choices: [{ message: { content: JSON.stringify(payload) } }],
  };
}

// NOTE: snake_case keys here are intentional – this object represents the raw
// JSON payload that the LLM returns (matching CLASSIFY_SCHEMA).  The
// classifyEmail() function maps them to camelCase before returning.
const actionablePayload = {
  is_actionable: true,
  importance: 75,
  confidence: 80,
  category: "sales",
  tasks: [{ name: "Review contract", suggested_priority: "high", description: "Review attached contract", due_hint: "EOD Friday" }],
  reasoning: "Explicit request with deadline.",
};

// ---------------------------------------------------------------------------
// Stage 1: preFilter
// ---------------------------------------------------------------------------

describe("preFilter – deterministic pre-filter stage", () => {
  const cfg = DEFAULT_EXTRACTION_CONFIG;

  it("passes a normal business email", () => {
    expect(preFilter(validEmail, cfg).skip).toBe(false);
  });

  it("skips auto-reply senders", () => {
    const cases = [
      "auto-reply@company.com",
      "autoreply@company.com",
      "noreply@company.com",
      "no-reply@company.com",
      "bounces@company.com",
      "mailer-daemon@company.com",
      "postmaster@company.com",
      "donotreply@company.com",
      "do-not-reply@company.com",
    ];
    for (const address of cases) {
      const result = preFilter({ ...validEmail, from: { address } }, cfg);
      expect(result.skip, `expected skip for ${address}`).toBe(true);
      expect(result.reason).toMatch(/auto.*reply|no.*reply/i);
    }
  });

  it("skips emails with body shorter than minBodyLength", () => {
    const result = preFilter({ ...validEmail, bodyText: "Hi there" }, cfg);
    expect(result.skip).toBe(true);
    expect(result.reason).toMatch(/too short/i);
  });

  it("skips emails with empty body", () => {
    const result = preFilter({ ...validEmail, bodyText: "" }, cfg);
    expect(result.skip).toBe(true);
    expect(result.reason).toMatch(/too short/i);
  });

  it("skips marketing/newsletter emails (unsubscribe link)", () => {
    const marketingBody =
      "Check out our latest deals! Click here to unsubscribe from this list or manage your preferences.";
    const result = preFilter({ ...validEmail, bodyText: marketingBody }, cfg);
    expect(result.skip).toBe(true);
    expect(result.reason).toMatch(/marketing/i);
  });

  it("skips emails with 'you received this email because' in body", () => {
    const body =
      "You received this email because you are subscribed to our newsletter. " +
      "Lorem ipsum dolor sit amet consectetur adipiscing elit.";
    const result = preFilter({ ...validEmail, bodyText: body }, cfg);
    expect(result.skip).toBe(true);
    expect(result.reason).toMatch(/marketing/i);
  });

  it("skips emails containing copyright + newsletter footer pattern", () => {
    const body =
      "Latest company news and updates. " +
      "View this email in your browser if it looks weird. " +
      "© 2025 Acme Corp. All rights reserved.";
    const result = preFilter({ ...validEmail, bodyText: body }, cfg);
    expect(result.skip).toBe(true);
  });

  it("respects a custom minBodyLength from config", () => {
    const strictCfg: ExtractionConfig = { ...cfg, minBodyLength: 200 };
    // validEmail body is about 90 chars — short enough to fail a 200-char cutoff
    const result = preFilter(validEmail, strictCfg);
    expect(result.skip).toBe(true);
    expect(result.reason).toMatch(/too short/i);
  });

  it("does not skip a genuine business email with a long enough body", () => {
    const body =
      "Hi team, I wanted to follow up on the proposal we discussed last week. " +
      "Could you please send me the revised pricing and delivery timeline by Thursday? " +
      "This is urgent for our Q3 planning.";
    const result = preFilter({ ...validEmail, bodyText: body }, cfg);
    expect(result.skip).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Signal boost (Stage 3)
// ---------------------------------------------------------------------------

describe("computeSignalBoost – deterministic signal scoring", () => {
  const baseEmail = {
    messageId: "<x@x.com>",
    from: { address: "x@x.com" },
    subject: "",
    bodyText: "",
  };

  it("returns zero boost and empty signals for a plain email", () => {
    const { boost, signals } = computeSignalBoost({ email: baseEmail });
    expect(boost).toBe(0);
    expect(signals).toEqual([]);
  });

  it("boosts for urgency phrases in body", () => {
    const email = { ...baseEmail, bodyText: "We need this ASAP." };
    const { boost, signals } = computeSignalBoost({ email });
    expect(boost).toBeGreaterThan(0);
    expect(signals).toContain("urgency-phrase");
  });

  it("boosts for urgency phrases in subject", () => {
    const email = { ...baseEmail, subject: "URGENT: review needed" };
    const { boost, signals } = computeSignalBoost({ email });
    expect(signals).toContain("urgency-phrase");
  });

  it("boosts for explicit request verbs", () => {
    const email = { ...baseEmail, bodyText: "Can you please review this before COB?" };
    const { boost, signals } = computeSignalBoost({ email });
    expect(signals).toContain("explicit-request");
    expect(signals).toContain("urgency-phrase"); // COB triggers urgency
  });

  it("boosts for dollar amounts", () => {
    const email = { ...baseEmail, bodyText: "Invoice for $12,500.00 is attached." };
    const { boost, signals } = computeSignalBoost({ email });
    expect(signals).toContain("dollar-amount");
  });

  it("boosts for known customer", () => {
    const { boost, signals } = computeSignalBoost({
      email: baseEmail,
      knownCustomer: { id: 1, name: "Acme" },
    });
    expect(boost).toBeGreaterThan(0);
    expect(signals).toContain("known-customer");
  });

  it("boosts for open deal", () => {
    const { boost, signals } = computeSignalBoost({ email: baseEmail, hasOpenDeal: true });
    expect(boost).toBeGreaterThan(0);
    expect(signals).toContain("open-deal");
  });

  it("caps total boost at 40 even when many signals fire", () => {
    const email = {
      ...baseEmail,
      subject: "URGENT: please approve $50,000 payment ASAP by EOD today",
      bodyText: "Can you please approve? We are waiting on this critical blocker. $50,000 payment is due.",
    };
    const { boost, signals } = computeSignalBoost({
      email,
      knownCustomer: { id: 5 },
      hasOpenDeal: true,
    });
    expect(boost).toBe(40);
    expect(signals.length).toBeGreaterThan(1);
  });

  it("detects shorthand urgency patterns (EOD, COB, end of day)", () => {
    for (const phrase of ["EOD", "COB", "end of day", "end of week"]) {
      const email = { ...baseEmail, bodyText: `Please respond by ${phrase}.` };
      const { signals } = computeSignalBoost({ email });
      expect(signals, `should detect "${phrase}"`).toContain("urgency-phrase");
    }
  });

  it("detects production-down urgency", () => {
    const email = { ...baseEmail, bodyText: "We have a production outage, need fix now." };
    const { signals } = computeSignalBoost({ email });
    expect(signals).toContain("urgency-phrase");
  });
});

// ---------------------------------------------------------------------------
// LLM output parsing / normalization (Stage 2)
// ---------------------------------------------------------------------------

describe("classifyEmail – LLM response parsing and normalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses a clean JSON response from the LLM", async () => {
    mockInvokeLLM.mockResolvedValue(makeLlmResponse(actionablePayload));

    const result = await classifyEmail(validEmail);

    expect(result.isActionable).toBe(true);
    expect(result.importance).toBe(75);
    expect(result.confidence).toBe(80);
    expect(result.category).toBe("sales");
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].name).toBe("Review contract");
    expect(result.tasks[0].suggestedPriority).toBe("high");
    expect(result.tasks[0].dueHint).toBe("EOD Friday");
    expect(result.reasoning).toBe("Explicit request with deadline.");
  });

  it("strips markdown code fences from LLM output before parsing", async () => {
    const raw = "```json\n" + JSON.stringify(actionablePayload) + "\n```";
    mockInvokeLLM.mockResolvedValue({
      choices: [{ message: { content: raw } }],
    });

    const result = await classifyEmail(validEmail);
    expect(result.isActionable).toBe(true);
    expect(result.tasks).toHaveLength(1);
  });

  it("throws on completely malformed (non-JSON) LLM output", async () => {
    mockInvokeLLM.mockResolvedValue({
      choices: [{ message: { content: "Sorry, I cannot do that." } }],
    });

    await expect(classifyEmail(validEmail)).rejects.toThrow();
  });

  it("returns defaults when LLM returns an empty object", async () => {
    mockInvokeLLM.mockResolvedValue(makeLlmResponse({}));

    const result = await classifyEmail(validEmail);
    expect(result.isActionable).toBe(false);
    expect(result.importance).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.tasks).toEqual([]);
    expect(result.reasoning).toBe("");
  });

  it("clamps importance above 100 to 100 and confidence below 0 to 0", async () => {
    mockInvokeLLM.mockResolvedValue(
      makeLlmResponse({ ...actionablePayload, importance: 150, confidence: -5 })
    );

    const result = await classifyEmail(validEmail);
    expect(result.importance).toBe(100);
    expect(result.confidence).toBe(0);
  });

  it("clamps importance below 0 to 0 and confidence above 100 to 100", async () => {
    mockInvokeLLM.mockResolvedValue(
      makeLlmResponse({ ...actionablePayload, importance: -20, confidence: 200 })
    );

    const result = await classifyEmail(validEmail);
    expect(result.importance).toBe(0);
    expect(result.confidence).toBe(100);
  });

  it("normalizes 'urgent' priority string to 'critical'", async () => {
    const payload = {
      ...actionablePayload,
      tasks: [{ name: "Ship product", suggested_priority: "urgent" }],
    };
    mockInvokeLLM.mockResolvedValue(makeLlmResponse(payload));

    const result = await classifyEmail(validEmail);
    expect(result.tasks[0].suggestedPriority).toBe("critical");
  });

  it("normalizes unknown priority string to 'medium'", async () => {
    const payload = {
      ...actionablePayload,
      tasks: [{ name: "Ship product", suggested_priority: "someday" }],
    };
    mockInvokeLLM.mockResolvedValue(makeLlmResponse(payload));

    const result = await classifyEmail(validEmail);
    expect(result.tasks[0].suggestedPriority).toBe("medium");
  });

  it("handles null/undefined tasks field gracefully (returns empty array)", async () => {
    mockInvokeLLM.mockResolvedValue(
      makeLlmResponse({ ...actionablePayload, tasks: null })
    );

    const result = await classifyEmail(validEmail);
    expect(result.tasks).toEqual([]);
  });

  it("truncates task names longer than 255 chars", async () => {
    const longName = "A".repeat(300);
    const payload = {
      ...actionablePayload,
      tasks: [{ name: longName, suggested_priority: "low" }],
    };
    mockInvokeLLM.mockResolvedValue(makeLlmResponse(payload));

    const result = await classifyEmail(validEmail);
    expect(result.tasks[0].name.length).toBeLessThanOrEqual(255);
  });

  it("omits dueHint when the LLM returns an empty due_hint string", async () => {
    const payload = {
      ...actionablePayload,
      tasks: [{ name: "Task A", suggested_priority: "medium", due_hint: "" }],
    };
    mockInvokeLLM.mockResolvedValue(makeLlmResponse(payload));

    const result = await classifyEmail(validEmail);
    expect(result.tasks[0].dueHint).toBeUndefined();
  });

  it("preserves an unrecognised category string as-is (no normalisation)", async () => {
    mockInvokeLLM.mockResolvedValue(
      makeLlmResponse({ ...actionablePayload, category: "unknown_category" })
    );

    const result = await classifyEmail(validEmail);
    // classifyEmail casts but does not validate; the raw string is passed through
    expect(result.category).toBe("unknown_category");
  });

  it("falls back to 'other' when the LLM omits the category field", async () => {
    const { category: _omit, ...noCategory } = actionablePayload;
    mockInvokeLLM.mockResolvedValue(makeLlmResponse(noCategory));

    const result = await classifyEmail(validEmail);
    expect(result.category).toBe("other");
  });
});

// ---------------------------------------------------------------------------
// Dedup key generation (Stage 5)
// ---------------------------------------------------------------------------

describe("extractAndCreateTasks – dedup key generation", () => {
  const activeProject = { id: 7, name: "Sales Pipeline", status: "active" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.getProjects.mockResolvedValue([activeProject]);
    mockDb.getCustomerByEmail.mockResolvedValue(null);
    mockDb.createAiAgentLog.mockResolvedValue(undefined);
    mockGetProjectTaskBySourceExternalId.mockResolvedValue(undefined);
    mockCreateProjectTaskFromSource.mockResolvedValue({ id: 99 } as any);
  });

  it("uses the raw messageId as externalId when there is exactly one task", async () => {
    mockInvokeLLM.mockResolvedValue(makeLlmResponse(actionablePayload)); // 1 task

    await extractAndCreateTasks(validEmail);

    // createProjectTaskFromSource should be called with sourceExternalId = messageId
    expect(mockCreateProjectTaskFromSource).toHaveBeenCalledWith(
      expect.objectContaining({ sourceExternalId: validEmail.messageId })
    );
  });

  it("appends #idx (1-based) when there are multiple tasks", async () => {
    const twoTaskPayload = {
      ...actionablePayload,
      tasks: [
        { name: "Task A", suggested_priority: "high" },
        { name: "Task B", suggested_priority: "medium" },
      ],
    };
    mockInvokeLLM.mockResolvedValue(makeLlmResponse(twoTaskPayload));

    await extractAndCreateTasks(validEmail);

    expect(mockCreateProjectTaskFromSource).toHaveBeenCalledTimes(2);
    expect(mockCreateProjectTaskFromSource).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sourceExternalId: `${validEmail.messageId}#1` })
    );
    expect(mockCreateProjectTaskFromSource).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sourceExternalId: `${validEmail.messageId}#2` })
    );
  });

  it("returns 'deduped' outcome when messageId already has a project task (early check)", async () => {
    mockGetProjectTaskBySourceExternalId.mockResolvedValue({ id: 42 } as any);

    const result = await extractAndCreateTasks(validEmail);

    expect(result.kind).toBe("deduped");
    expect((result as any).existingTaskId).toBe(42);
    // LLM should never be called
    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });

  it("skips individual task creation when the per-candidate externalId already exists", async () => {
    const twoTaskPayload = {
      ...actionablePayload,
      tasks: [
        { name: "Task A", suggested_priority: "high" },
        { name: "Task B", suggested_priority: "medium" },
      ],
    };
    mockInvokeLLM.mockResolvedValue(makeLlmResponse(twoTaskPayload));

    // First call: initial messageId check — not deduped
    // Subsequent calls: per-candidate check — first is deduped, second is not
    mockGetProjectTaskBySourceExternalId
      .mockResolvedValueOnce(undefined)          // early messageId check: not found
      .mockResolvedValueOnce({ id: 55 } as any) // Task A (#1) already exists
      .mockResolvedValueOnce(undefined);         // Task B (#2) is new

    const result = await extractAndCreateTasks(validEmail);

    expect(result.kind).toBe("created");
    // Only Task B should be newly created
    expect(mockCreateProjectTaskFromSource).toHaveBeenCalledTimes(1);
    expect(mockCreateProjectTaskFromSource).toHaveBeenCalledWith(
      expect.objectContaining({ sourceExternalId: `${validEmail.messageId}#2` })
    );
    // Both ids should appear in taskIds (existing + newly created)
    expect((result as any).taskIds).toContain(55);
    expect((result as any).taskIds).toContain(99);
  });
});

// ---------------------------------------------------------------------------
// Orchestrator: end-to-end outcome variants
// ---------------------------------------------------------------------------

describe("extractAndCreateTasks – orchestrator outcomes", () => {
  const activeProject = { id: 3, name: "General", status: "active" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.getProjects.mockResolvedValue([activeProject]);
    mockDb.getCustomerByEmail.mockResolvedValue(null);
    mockDb.createAiAgentLog.mockResolvedValue(undefined);
    mockGetProjectTaskBySourceExternalId.mockResolvedValue(undefined);
    mockCreateProjectTaskFromSource.mockResolvedValue({ id: 1 } as any);
  });

  it("returns 'skipped' for auto-reply sender without calling LLM", async () => {
    const email = { ...validEmail, from: { address: "noreply@corp.com" } };
    const result = await extractAndCreateTasks(email);

    expect(result.kind).toBe("skipped");
    expect(mockInvokeLLM).not.toHaveBeenCalled();
  });

  it("returns 'skipped' when LLM throws an error", async () => {
    mockInvokeLLM.mockRejectedValue(new Error("LLM unavailable"));

    const result = await extractAndCreateTasks(validEmail);

    expect(result.kind).toBe("skipped");
    expect((result as any).reason).toMatch(/llm_error/i);
  });

  it("returns 'rejected' when LLM marks email as not actionable", async () => {
    mockInvokeLLM.mockResolvedValue(
      makeLlmResponse({ ...actionablePayload, is_actionable: false, importance: 20, confidence: 20 })
    );

    const result = await extractAndCreateTasks(validEmail);

    expect(result.kind).toBe("rejected");
    expect((result as any).reason).toBe("not_actionable");
  });

  it("returns 'rejected' when boosted importance is below threshold", async () => {
    mockInvokeLLM.mockResolvedValue(
      makeLlmResponse({ ...actionablePayload, is_actionable: true, importance: 10, confidence: 90 })
    );

    const result = await extractAndCreateTasks(validEmail);

    expect(result.kind).toBe("rejected");
    expect((result as any).reason).toMatch(/importance_below_threshold/);
  });

  it("returns 'rejected' when confidence is below threshold", async () => {
    mockInvokeLLM.mockResolvedValue(
      makeLlmResponse({ ...actionablePayload, is_actionable: true, importance: 90, confidence: 10 })
    );

    const result = await extractAndCreateTasks(validEmail);

    expect(result.kind).toBe("rejected");
    expect((result as any).reason).toMatch(/confidence_below_threshold/);
  });

  it("returns 'rejected' when task list is empty", async () => {
    mockInvokeLLM.mockResolvedValue(
      makeLlmResponse({ ...actionablePayload, tasks: [] })
    );

    const result = await extractAndCreateTasks(validEmail);

    expect(result.kind).toBe("rejected");
    expect((result as any).reason).toBe("no_task_candidates");
  });

  it("returns 'rejected' when no project is available for routing", async () => {
    mockDb.getProjects.mockResolvedValue([]);
    mockInvokeLLM.mockResolvedValue(makeLlmResponse(actionablePayload));

    const result = await extractAndCreateTasks(validEmail);

    expect(result.kind).toBe("rejected");
    expect((result as any).reason).toBe("no_project_route");
  });

  it("returns 'created' with autoPublished=true when thresholds are met", async () => {
    mockInvokeLLM.mockResolvedValue(
      makeLlmResponse({ ...actionablePayload, importance: 90, confidence: 90 })
    );

    const result = await extractAndCreateTasks(validEmail);

    expect(result.kind).toBe("created");
    expect((result as any).autoPublished).toBe(true);
    expect((result as any).taskIds).toHaveLength(1);
    expect((result as any).projectId).toBe(activeProject.id);
  });

  it("returns 'created' with autoPublished=false below auto-publish thresholds", async () => {
    mockInvokeLLM.mockResolvedValue(
      makeLlmResponse({ ...actionablePayload, importance: 75, confidence: 75 })
    );

    const result = await extractAndCreateTasks(validEmail);

    expect(result.kind).toBe("created");
    expect((result as any).autoPublished).toBe(false);
  });

  it("prefers a project whose name matches the email category", async () => {
    const projects = [
      { id: 1, name: "HR Projects", status: "active" },
      { id: 2, name: "Sales Pipeline", status: "active" },
      { id: 3, name: "Vendor Relations", status: "active" },
    ];
    mockDb.getProjects.mockResolvedValue(projects);
    mockInvokeLLM.mockResolvedValue(makeLlmResponse({ ...actionablePayload, category: "vendor" }));

    const result = await extractAndCreateTasks(validEmail);

    expect(result.kind).toBe("created");
    expect((result as any).projectId).toBe(3); // "Vendor Relations" matches "vendor"
  });
});
