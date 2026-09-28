import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// inventory.transferFromText used to insert an inventory_transfers row with no requestedDate
// (NOT NULL, no default) and possibly-null warehouse ids (NOT NULL), so every call either failed
// at the database or wrote a half-formed transfer. It now rejects unresolved warehouses up front
// and stamps requestedDate.

vi.mock("./db", () => ({
  createTransfer: vi.fn(async () => ({ id: 11, transferNumber: "TR-11" })),
  createAuditLog: vi.fn(async () => undefined),
}));
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import * as db from "./db";
import { invokeLLM } from "./_core/llm";

function llmReplies(json: string) {
  (invokeLLM as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    choices: [{ message: { content: json } }],
  });
}

function ctxFor(user: Partial<AuthenticatedUser>): TrpcContext {
  return {
    user: {
      id: 4,
      openId: "u",
      email: "u@example.com",
      name: "U",
      loginMethod: "manus",
      role: "ops",
      companyId: 2,
      regionScope: "global",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...user,
    } as AuthenticatedUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("inventory.transferFromText", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects with BAD_REQUEST when a warehouse could not be determined, without inserting", async () => {
    llmReplies('{"fromWarehouseId": null, "toWarehouseId": 2, "notes": "move pallets"}');
    const caller = appRouter.createCaller(ctxFor({}));
    await expect(caller.inventory.transferFromText({ text: "move pallets to WH2" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(db.createTransfer).not.toHaveBeenCalled();
  });

  it("rejects when the LLM output is not parseable JSON", async () => {
    llmReplies("not json at all");
    const caller = appRouter.createCaller(ctxFor({}));
    await expect(caller.inventory.transferFromText({ text: "???" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.createTransfer).not.toHaveBeenCalled();
  });

  it("creates the transfer with both warehouses, a requestedDate and the user's companyId", async () => {
    llmReplies('```json\n{"fromWarehouseId": 1, "toWarehouseId": 2, "notes": "move pallets"}\n```');
    const caller = appRouter.createCaller(ctxFor({ id: 4, companyId: 2 }));
    const result = await caller.inventory.transferFromText({ text: "move pallets from WH1 to WH2" });
    expect(result).toEqual({ id: 11, transferNumber: "TR-11" });
    expect(db.createTransfer).toHaveBeenCalledTimes(1);
    const arg = (db.createTransfer as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg).toMatchObject({
      fromWarehouseId: 1,
      toWarehouseId: 2,
      notes: "move pallets",
      status: "pending",
      requestedBy: 4,
      companyId: 2,
    });
    expect(arg.requestedDate).toBeInstanceOf(Date);
    expect(db.createAuditLog).toHaveBeenCalledTimes(1);
  });
});
