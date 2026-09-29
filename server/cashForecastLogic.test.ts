import { describe, expect, it } from "vitest";
import {
  adjustmentsToEvents,
  billsToEvents,
  buildCashForecast,
  payrollToEvents,
  purchaseOrdersToEvents,
  receivablesToEvents,
  recurringToEvents,
  startOfWeek,
  isoDate,
  addDays,
} from "./cashForecastLogic";

// Wednesday 2026-09-30 → week 1 starts Monday 2026-09-28
const asOf = new Date("2026-09-30T15:00:00Z");
const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("startOfWeek", () => {
  it("returns the Monday on or before the date", () => {
    expect(isoDate(startOfWeek(asOf))).toBe("2026-09-28");
    expect(isoDate(startOfWeek(d("2026-10-04")))).toBe("2026-09-28"); // Sunday
    expect(isoDate(startOfWeek(d("2026-10-05")))).toBe("2026-10-05"); // Monday
  });
});

describe("buildCashForecast", () => {
  it("rolls opening/closing cash week to week", () => {
    const f = buildCashForecast({
      asOf,
      startingCash: 1000,
      events: [
        { date: d("2026-10-01"), amount: 500, direction: "in", category: "customer_receipts", label: "A" },
        { date: d("2026-10-07"), amount: 2000, direction: "out", category: "vendor_bills", label: "B" },
      ],
    });
    expect(f.weeks).toHaveLength(13);
    expect(f.weeks[0].start).toBe("2026-09-28");
    expect(f.weeks[0].closingCash).toBe(1500);
    expect(f.weeks[1].openingCash).toBe(1500);
    expect(f.weeks[1].closingCash).toBe(-500);
    expect(f.firstNegativeWeek).toBe(2);
    expect(f.lowestCash).toBe(-500);
    expect(f.lowestWeek).toBe(2);
    expect(f.endingCash).toBe(-500);
    expect(f.totalIn).toBe(500);
    expect(f.totalOut).toBe(2000);
  });

  it("puts past-due items in week 1 and flags them", () => {
    const f = buildCashForecast({
      asOf,
      startingCash: 0,
      events: [
        { date: d("2026-08-01"), amount: 300, direction: "in", category: "customer_receipts", label: "late" },
        { date: d("2026-09-01"), amount: 100, direction: "out", category: "vendor_bills", label: "late bill" },
      ],
    });
    expect(f.weeks[0].inflows.customer_receipts).toBe(300);
    expect(f.weeks[0].events.every((e) => e.overdue)).toBe(true);
    expect(f.overdueIn).toBe(300);
    expect(f.overdueOut).toBe(100);
  });

  it("drops items beyond the 13-week horizon", () => {
    const f = buildCashForecast({
      asOf,
      startingCash: 0,
      events: [{ date: d("2026-12-28"), amount: 999, direction: "in", category: "customer_receipts", label: "far" }],
    });
    // week 13 ends Sunday 2026-12-27
    expect(f.weeks[12].end).toBe("2026-12-27");
    expect(f.totalIn).toBe(0);
  });
});

describe("converters", () => {
  it("receivables use outstanding balance and skip paid, drafts and credit notes", () => {
    const ev = receivablesToEvents([
      { id: 1, invoiceNumber: "INV-1", status: "partial", issueDate: d("2026-09-01"), dueDate: d("2026-10-01"), totalAmount: "1000", paidAmount: "400", customer: { name: "NYC DOE" } },
      { id: 2, status: "paid", issueDate: d("2026-09-01"), dueDate: d("2026-10-01"), totalAmount: "1000" },
      { id: 3, status: "draft", issueDate: d("2026-09-01"), dueDate: d("2026-10-01"), totalAmount: "1000" },
      { id: 4, type: "credit_note", status: "sent", issueDate: d("2026-09-01"), dueDate: d("2026-10-01"), totalAmount: "1000" },
      { id: 5, status: "sent", issueDate: d("2026-09-10"), dueDate: null, totalAmount: "200" },
    ]);
    expect(ev).toHaveLength(2);
    expect(ev[0].amount).toBe(600);
    expect(ev[0].label).toContain("NYC DOE");
    expect(isoDate(ev[1].date)).toBe("2026-10-10"); // issue + 30
  });

  it("bills skip drafts, disputed and paid", () => {
    const ev = billsToEvents([
      { id: 1, status: "approved", billDate: d("2026-09-01"), dueDate: d("2026-10-15"), totalAmount: "500", amountPaid: "0", vendorName: "Jyoti" },
      { id: 2, status: "draft", billDate: d("2026-09-01"), dueDate: d("2026-10-15"), totalAmount: "500" },
      { id: 3, status: "disputed", billDate: d("2026-09-01"), dueDate: d("2026-10-15"), totalAmount: "500" },
      { id: 4, status: "paid", billDate: d("2026-09-01"), dueDate: d("2026-10-15"), totalAmount: "500", amountPaid: "500" },
    ]);
    expect(ev).toHaveLength(1);
    expect(ev[0].direction).toBe("out");
  });

  it("POs pay at expected date + vendor terms and skip already-billed POs", () => {
    const ev = purchaseOrdersToEvents(
      [
        { id: 1, poNumber: "PO-1", status: "confirmed", orderDate: d("2026-09-01"), expectedDate: d("2026-10-01"), totalAmount: "1000", vendor: { name: "V", paymentTerms: 15 } },
        { id: 2, status: "confirmed", orderDate: d("2026-09-01"), totalAmount: "1000" },
        { id: 3, status: "draft", orderDate: d("2026-09-01"), totalAmount: "1000" },
      ],
      new Set([2]),
    );
    expect(ev).toHaveLength(1);
    expect(isoDate(ev[0].date)).toBe("2026-10-16");
  });

  it("recurring templates expand until the horizon and respect end date", () => {
    const horizon = addDays(startOfWeek(asOf), 91);
    const ev = recurringToEvents(
      [
        { id: 1, frequency: "monthly", nextGenerationDate: d("2026-10-01"), totalAmount: "100", daysUntilDue: 30, isActive: true },
        { id: 2, frequency: "weekly", nextGenerationDate: d("2026-10-01"), endDate: d("2026-10-15"), totalAmount: "10", daysUntilDue: 0, isActive: true },
        { id: 3, frequency: "monthly", nextGenerationDate: d("2026-10-01"), totalAmount: "100", isActive: false },
      ],
      horizon,
    );
    const monthly = ev.filter((e) => e.ref?.startsWith("recurring:1:"));
    const weekly = ev.filter((e) => e.ref?.startsWith("recurring:2:"));
    expect(monthly.map((e) => isoDate(e.date))).toEqual(["2026-10-31", "2026-12-01"]);
    expect(weekly).toHaveLength(3); // Oct 1, 8, 15
  });

  it("payroll uses only pending payments", () => {
    const ev = payrollToEvents([
      { id: 1, status: "pending", paymentDate: d("2026-10-15"), amount: "3000" },
      { id: 2, status: "processed", paymentDate: d("2026-09-15"), amount: "3000" },
    ]);
    expect(ev).toHaveLength(1);
  });

  it("manual adjustments map to in/out categories and ignore bad rows", () => {
    const ev = adjustmentsToEvents([
      { label: "Legal reserve", amount: 5000, direction: "out", date: "2026-10-20" },
      { label: "SAFE close", amount: 250000, direction: "in", date: "2026-11-02" },
      { label: "bad", amount: 0, direction: "in", date: "2026-11-02" },
      { label: "bad date", amount: 5, direction: "in", date: "not-a-date" },
    ]);
    expect(ev.map((e) => e.category)).toEqual(["adjustment_out", "adjustment_in"]);
  });
});
