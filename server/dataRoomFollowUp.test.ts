import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  getDataRooms: vi.fn(),
  getDataRoomVisitors: vi.fn(),
  updateDataRoomVisitor: vi.fn(async () => undefined),
}));
vi.mock("./_core/email", () => ({ sendEmail: vi.fn(async () => true) }));

import * as db from "./db";
import { sendEmail } from "./_core/email";
import { sendDataRoomFollowUps } from "./dataRoomFollowUp";

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

describe("sendDataRoomFollowUps", () => {
  beforeEach(() => vi.clearAllMocks());

  it("collects visitors room by room via getDataRoomVisitors(room.id)", async () => {
    vi.mocked(db.getDataRooms).mockResolvedValue([{ id: 1 }, { id: 2 }] as any);
    vi.mocked(db.getDataRoomVisitors).mockImplementation(async (roomId: number) =>
      roomId === 1
        ? ([{ id: 11, email: "a@example.com", name: "Ann", lastViewedAt: daysAgo(10) }] as any)
        : ([
            { id: 21, email: "b@example.com", name: "Bo", lastViewedAt: daysAgo(2) }, // too recent
            { id: 22, email: "c@example.com", name: "Cy", lastViewedAt: daysAgo(9) },
          ] as any)
    );

    const result = await sendDataRoomFollowUps();

    expect(db.getDataRoomVisitors).toHaveBeenCalledTimes(2);
    expect(db.getDataRoomVisitors).toHaveBeenNthCalledWith(1, 1);
    expect(db.getDataRoomVisitors).toHaveBeenNthCalledWith(2, 2);

    expect(result).toEqual({ sent: 2 });
    const recipients = vi.mocked(sendEmail).mock.calls.map((c) => c[0].to);
    expect(recipients).toEqual(["a@example.com", "c@example.com"]);
    expect(db.updateDataRoomVisitor).toHaveBeenCalledWith(11, { followUpSent: true });
    expect(db.updateDataRoomVisitor).toHaveBeenCalledWith(22, { followUpSent: true });
  });

  it("does nothing when there are no data rooms", async () => {
    vi.mocked(db.getDataRooms).mockResolvedValue([] as any);

    expect(await sendDataRoomFollowUps()).toEqual({ sent: 0 });
    expect(db.getDataRoomVisitors).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
