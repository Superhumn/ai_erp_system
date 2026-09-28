import { describe, it, expect } from "vitest";
import {
  bucketBillsAging,
  billOutstanding,
  billDaysOverdue,
  compareBillToPo,
  isBillDueForPayment,
  nextStatusAfterPayment,
  pickClosestPurchaseOrder,
} from "./billsLogic";

const asOf = new Date("2026-09-28T12:00:00Z");
const daysAgo = (n: number) => new Date(asOf.getTime() - n * 86400000);

describe("bucketBillsAging", () => {
  it("buckets outstanding balances by days past due and skips paid / cancelled bills", () => {
    const summary = bucketBillsAging([
      { status: "approved", totalAmount: "100.00", amountPaid: "0", dueDate: daysAgo(-5), billDate: daysAgo(10) }, // not yet due
      { status: "approved", totalAmount: "200.00", amountPaid: "50.00", dueDate: daysAgo(10), billDate: daysAgo(40) }, // 1-30
      { status: "overdue", totalAmount: "300.00", amountPaid: "0", dueDate: daysAgo(45), billDate: daysAgo(75) }, // 31-60
      { status: "partially_paid", totalAmount: "400.00", amountPaid: "100", dueDate: daysAgo(75), billDate: daysAgo(100) }, // 61-90
      { status: "pending_approval", totalAmount: "500.00", amountPaid: "0", dueDate: daysAgo(120), billDate: daysAgo(150) }, // 90+
      { status: "paid", totalAmount: "999.00", amountPaid: "999.00", dueDate: daysAgo(200), billDate: daysAgo(200) },
      { status: "cancelled", totalAmount: "999.00", amountPaid: "0", dueDate: daysAgo(200), billDate: daysAgo(200) },
    ], asOf);

    expect(summary).toEqual({
      current: 100,
      days1to30: 150,
      days31to60: 300,
      days61to90: 300,
      days90plus: 500,
      totalOutstanding: 1350,
      billCount: 5,
      overdueCount: 4,
    });
  });

  it("ages a bill with no due date from its bill date and ignores fully settled rows", () => {
    const summary = bucketBillsAging([
      { status: "approved", totalAmount: 50, amountPaid: 0, dueDate: null, billDate: daysAgo(35) },
      { status: "approved", totalAmount: 50, amountPaid: 50, dueDate: null, billDate: daysAgo(35) },
    ], asOf);
    expect(summary.days31to60).toBe(50);
    expect(summary.billCount).toBe(1);
  });

  it("treats exactly 30 / 60 / 90 days as the upper edge of each bucket", () => {
    const summary = bucketBillsAging([
      { status: "approved", totalAmount: 1, amountPaid: 0, dueDate: daysAgo(30), billDate: null },
      { status: "approved", totalAmount: 2, amountPaid: 0, dueDate: daysAgo(60), billDate: null },
      { status: "approved", totalAmount: 4, amountPaid: 0, dueDate: daysAgo(90), billDate: null },
      { status: "approved", totalAmount: 8, amountPaid: 0, dueDate: daysAgo(91), billDate: null },
    ], asOf);
    expect([summary.days1to30, summary.days31to60, summary.days61to90, summary.days90plus]).toEqual([1, 2, 4, 8]);
  });

  it("returns an all-zero summary for no bills", () => {
    expect(bucketBillsAging([], asOf).totalOutstanding).toBe(0);
  });
});

describe("billOutstanding / billDaysOverdue", () => {
  it("never reports a negative balance and tolerates missing amounts", () => {
    expect(billOutstanding({ totalAmount: "10", amountPaid: "12" })).toBe(0);
    expect(billOutstanding({ totalAmount: null, amountPaid: undefined })).toBe(0);
    expect(billOutstanding({ totalAmount: "10.50", amountPaid: "0.25" })).toBe(10.25);
  });

  it("counts whole days past the due date", () => {
    expect(billDaysOverdue({ dueDate: daysAgo(3), billDate: null }, asOf)).toBe(3);
    expect(billDaysOverdue({ dueDate: daysAgo(-3), billDate: null }, asOf)).toBe(-3);
    expect(billDaysOverdue({ dueDate: null, billDate: null }, asOf)).toBe(0);
  });
});

describe("isBillDueForPayment", () => {
  it("includes bills due within the lookahead window and bills with no due date", () => {
    expect(isBillDueForPayment({ dueDate: daysAgo(1) }, asOf)).toBe(true);
    expect(isBillDueForPayment({ dueDate: daysAgo(-1) }, asOf)).toBe(false);
    expect(isBillDueForPayment({ dueDate: daysAgo(-1) }, asOf, 3)).toBe(true);
    expect(isBillDueForPayment({ dueDate: daysAgo(-5) }, asOf, 3)).toBe(false);
    expect(isBillDueForPayment({ dueDate: null }, asOf)).toBe(true);
  });
});

describe("compareBillToPo / pickClosestPurchaseOrder", () => {
  it("matches inside the tolerance and flags a variance outside it", () => {
    expect(compareBillToPo("102", "100")).toMatchObject({ variance: 2, variancePercent: 2, matched: true });
    expect(compareBillToPo("103", "100")).toMatchObject({ variance: 3, variancePercent: 3, matched: false });
    expect(compareBillToPo("103", "100", 5).matched).toBe(true);
    expect(compareBillToPo("10", "0")).toMatchObject({ variancePercent: 100, matched: false });
  });

  it("picks the open PO with the closest total and ignores cancelled / draft ones", () => {
    const pos = [
      { id: 1, totalAmount: "100.00", status: "cancelled" },
      { id: 2, totalAmount: "101.50", status: "received" },
      { id: 3, totalAmount: "100.00", status: "draft" },
      { id: 4, totalAmount: "100.50", status: "confirmed" },
      { id: 5, totalAmount: "130.00", status: "received" },
    ];
    expect(pickClosestPurchaseOrder("100", pos)?.id).toBe(4);
    expect(pickClosestPurchaseOrder("500", pos)).toBeNull();
  });
});

describe("nextStatusAfterPayment", () => {
  it("moves to partially_paid until the total is covered, then paid", () => {
    expect(nextStatusAfterPayment({ totalAmount: "100", amountPaid: "0" }, 40)).toEqual({ amountPaid: 40, status: "partially_paid" });
    expect(nextStatusAfterPayment({ totalAmount: "100", amountPaid: "40" }, 60)).toEqual({ amountPaid: 100, status: "paid" });
    // sub-cent rounding must not leave a bill stuck at partially_paid
    expect(nextStatusAfterPayment({ totalAmount: "10.00", amountPaid: "3.33" }, 6.67).status).toBe("paid");
  });
});
