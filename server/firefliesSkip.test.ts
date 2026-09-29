import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// appRouter.fireflies.meetings.setSkipped — dismiss meetings without processing.
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  transitionFirefliesMeetingStatus: vi.fn(),
}));

import * as db from "./db";
import { appRouter } from "./routers";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function ctx(role = "admin"): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "u",
      email: "u@example.com",
      name: "U",
      loginMethod: "manus",
      role,
      companyId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as AuthenticatedUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("fireflies.meetings.setSkipped", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.transitionFirefliesMeetingStatus).mockResolvedValue(2);
  });

  it("moves only pending meetings to skipped, deduping ids", async () => {
    const caller = appRouter.createCaller(ctx());
    const res = await caller.fireflies.meetings.setSkipped({ meetingIds: [1, 2, 2] });
    expect(res).toEqual({ updated: 2 });
    expect(db.transitionFirefliesMeetingStatus).toHaveBeenCalledWith(
      [1, 2],
      "pending",
      expect.objectContaining({ processingStatus: "skipped", processedBy: 7 }),
    );
  });

  it("unskip moves only skipped meetings back to pending", async () => {
    const caller = appRouter.createCaller(ctx());
    await caller.fireflies.meetings.setSkipped({ meetingIds: [4], unskip: true });
    expect(db.transitionFirefliesMeetingStatus).toHaveBeenCalledWith(
      [4],
      "skipped",
      { processingStatus: "pending", processedAt: null, processedBy: null },
    );
  });

  it("rejects an empty list and more than 500 ids", async () => {
    const caller = appRouter.createCaller(ctx());
    await expect(caller.fireflies.meetings.setSkipped({ meetingIds: [] })).rejects.toBeTruthy();
    const many = Array.from({ length: 501 }, (_, i) => i + 1);
    await expect(caller.fireflies.meetings.setSkipped({ meetingIds: many })).rejects.toBeTruthy();
    expect(db.transitionFirefliesMeetingStatus).not.toHaveBeenCalled();
  });

  it.each(["vendor", "copacker", "investor", "contractor"])("forbids external %s accounts", async (role) => {
    const caller = appRouter.createCaller(ctx(role));
    await expect(caller.fireflies.meetings.setSkipped({ meetingIds: [1] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.transitionFirefliesMeetingStatus).not.toHaveBeenCalled();
  });
});
