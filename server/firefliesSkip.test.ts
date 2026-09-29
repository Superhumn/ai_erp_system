import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// appRouter.fireflies.meetings.setSkipped — dismiss meetings without processing.
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  getFirefliesMeetingById: vi.fn(),
  updateFirefliesMeeting: vi.fn().mockResolvedValue(undefined),
}));

import * as db from "./db";
import { appRouter } from "./routers";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function ctx(): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "u",
      email: "u@example.com",
      name: "U",
      loginMethod: "manus",
      role: "admin",
      companyId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as AuthenticatedUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const statuses: Record<number, string> = {};

describe("fireflies.meetings.setSkipped", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(statuses, { 1: "pending", 2: "pending", 3: "fully_processed", 4: "skipped" });
    vi.mocked(db.getFirefliesMeetingById).mockImplementation(async (id: number) =>
      (statuses[id] ? { id, processingStatus: statuses[id] } : null) as any,
    );
  });

  it("skips pending meetings and leaves processed or missing ones alone", async () => {
    const caller = appRouter.createCaller(ctx());
    const res = await caller.fireflies.meetings.setSkipped({ meetingIds: [1, 2, 2, 3, 99] });
    expect(res).toEqual({ updated: 2 });
    expect(db.updateFirefliesMeeting).toHaveBeenCalledTimes(2);
    expect(db.updateFirefliesMeeting).toHaveBeenCalledWith(1, expect.objectContaining({ processingStatus: "skipped", processedBy: 7 }));
    expect(db.updateFirefliesMeeting).not.toHaveBeenCalledWith(3, expect.anything());
  });

  it("unskip moves only skipped meetings back to pending", async () => {
    const caller = appRouter.createCaller(ctx());
    const res = await caller.fireflies.meetings.setSkipped({ meetingIds: [1, 4], unskip: true });
    expect(res).toEqual({ updated: 1 });
    expect(db.updateFirefliesMeeting).toHaveBeenCalledWith(4, { processingStatus: "pending", processedAt: null, processedBy: null });
  });

  it("rejects an empty list", async () => {
    const caller = appRouter.createCaller(ctx());
    await expect(caller.fireflies.meetings.setSkipped({ meetingIds: [] })).rejects.toBeTruthy();
  });
});
