import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  createEdiTransaction: vi.fn(),
  updateEdiTransaction: vi.fn(async () => undefined),
  createEdiTransactionItem: vi.fn(async () => ({ id: 1 })),
  getEdiProductCrosswalkByBuyerPart: vi.fn(async () => undefined),
  getEdiProductCrosswalkByUpc: vi.fn(async () => undefined),
  updateEdiTradingPartner: vi.fn(async () => undefined),
  getEdiTradingPartnerById: vi.fn(async () => undefined), // disables auto-997
}));

import * as db from "./db";
import { processInboundEdi } from "./ediService";

const ISA = "ISA*00*          *00*          *ZZ*RETAILER       *ZZ*VENDOR         *260212*1200*U*00401*000000001*0*P*>~";
const GS = "GS*PO*RETAILER*VENDOR*20260212*1200*1*X*004010~";

const set850 = (control: string, poNumber: string) =>
  [
    `ST*850*${control}~`,
    `BEG*00*NE*${poNumber}**20260212~`,
    "N1*ST*Store 1234*92*1234~",
    "PO1*1*24*CS*15.99**IN*WMT-001*VN*SKU-A100~",
    "PID*F****Organic Snack Bars 12pk~",
    "CTT*1~",
    `SE*7*${control}~`,
  ].join("");

const setUnsupported = (control: string) => [`ST*860*${control}~`, "BCH*04*SA*PO999~", `SE*3*${control}~`].join("");

describe("processInboundEdi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let next = 1;
    vi.mocked(db.createEdiTransaction).mockImplementation(async () => ({ id: next++ }) as any);
  });

  it("processes every transaction set in the interchange, not just the first", async () => {
    const raw = ISA + GS + set850("0001", "PO12345") + set850("0002", "PO67890") + "GE*2*1~IEA*1*000000001~";

    const result = await processInboundEdi(raw, 7);

    expect(db.createEdiTransaction).toHaveBeenCalledTimes(2);
    expect(vi.mocked(db.createEdiTransaction).mock.calls.map((c) => c[0].transactionSetControlNumber)).toEqual(["0001", "0002"]);
    expect(db.createEdiTransactionItem).toHaveBeenCalledTimes(2);

    // Backwards-compatible top-level shape mirrors the first set
    expect(result.transactionId).toBe(1);
    expect(result.status).toBe("validated");
    expect(result.message).toContain("PO12345");
    expect(result.message).toContain("PO67890");

    expect(result.transactionIds).toEqual([1, 2]);
    expect(result.results).toHaveLength(2);
    expect(result.results[1]).toMatchObject({ transactionId: 2, status: "validated" });

    // Partner timestamp is bumped once per interchange
    expect(db.updateEdiTradingPartner).toHaveBeenCalledTimes(1);
    expect(db.updateEdiTradingPartner).toHaveBeenCalledWith(7, { lastTransactionAt: expect.any(Date) });
  });

  it("reports an error status when any set fails while keeping the others", async () => {
    const raw = ISA + GS + set850("0001", "PO12345") + setUnsupported("0002") + "GE*2*1~IEA*1*000000001~";

    const result = await processInboundEdi(raw, 7);

    expect(result.results.map((r) => r.status)).toEqual(["validated", "error"]);
    expect(result.status).toBe("error");
    expect(result.transactionIds).toEqual([1, 2]);
    expect(db.updateEdiTransaction).toHaveBeenCalledWith(2, expect.objectContaining({ status: "error" }));
  });

  it("keeps the single-set result shape unchanged", async () => {
    const raw = ISA + GS + set850("0001", "PO12345") + "GE*1*1~IEA*1*000000001~";

    const result = await processInboundEdi(raw, 7);

    expect(result).toMatchObject({
      transactionId: 1,
      status: "validated",
      message: "Parsed 850 PO #PO12345 with 1 line items",
      transactionIds: [1],
    });
    expect(result.results).toHaveLength(1);
  });
});
