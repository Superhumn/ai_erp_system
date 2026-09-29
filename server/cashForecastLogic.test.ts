import { describe, expect, it } from "vitest";
import {
  addMonthsClamped,
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

  it("puts past-due items in week 1 and flags them against the as-of date", () => {
    const f = buildCashForecast({
      asOf, // Wednesday 2026-09-30
      startingCash: 0,
      events: [
        { date: d("2026-08-01"), amount: 300, direction: "in", category: "customer_receipts", label: "late" },
        { date: d("2026-09-01"), amount: 100, direction: "out", category: "vendor_bills", label: "late bill" },
        { date: d("2026-09-29"), amount: 50, direction: "in", category: "customer_receipts", label: "due Tuesday" },
        { date: d("2026-09-30"), amount: 25, direction: "in", category: "customer_receipts", label: "due today" },
      ],
    });
    expect(f.weeks[0].inflows.customer_receipts).toBe(375);
    const byLabel = Object.fromEntries(f.weeks[0].events.map((e) => [e.label, e]));
    expect(byLabel["late"].overdue).toBe(true);
    expect(byLabel["late"].date).toBe("2026-08-01");
    expect(byLabel["due Tuesday"].overdue).toBe(true); // this week, but before as-of
    expect(byLabel["due today"].overdue).toBe(false);
    expect(f.overdueIn).toBe(350);
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

  it("month arithmetic clamps to the target month's last day", () => {
    expect(isoDate(addMonthsClamped(d("2026-01-31"), 1))).toBe("2026-02-28");
    expect(isoDate(addMonthsClamped(d("2028-01-31"), 1))).toBe("2028-02-29");
    expect(isoDate(addMonthsClamped(d("2026-02-28"), 1, 31))).toBe("2026-03-31"); // springs back to anchor day
    expect(isoDate(addMonthsClamped(d("2028-02-29"), 12))).toBe("2029-02-28");
    const ev = recurringToEvents(
      [{ id: 1, frequency: "monthly", dayOfMonth: 31, nextGenerationDate: d("2026-10-31"), totalAmount: "100", daysUntilDue: 0, isActive: true }],
      d("2027-01-15"),
    );
    expect(ev.map((e) => isoDate(e.date))).toEqual(["2026-10-31", "2026-11-30", "2026-12-31"]);
  });

  it("stale recurring anchors roll forward instead of replaying history", () => {
    const from = startOfWeek(asOf); // 2026-09-28
    const inv = recurringToEvents(
      [{ id: 1, frequency: "monthly", dayOfMonth: 1, nextGenerationDate: d("2026-03-01"), totalAmount: "100", daysUntilDue: 0, isActive: true }],
      d("2026-12-28"),
      from,
    );
    expect(inv.map((e) => isoDate(e.date))).toEqual(["2026-10-01", "2026-11-01", "2026-12-01"]);
    const exp = recurringExpensesToEvents(
      [{ id: 1, name: "Rent", frequency: "weekly", nextDate: d("2025-01-06"), amount: "10", isActive: true }],
      d("2026-10-19"),
      from,
    );
    expect(exp.map((e) => isoDate(e.date))).toEqual(["2026-09-28", "2026-10-05", "2026-10-12"]);
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

// ── v2 ─────────────────────────────────────────────────────────
import {
  applyScenario,
  computePayBehaviour,
  convertEventsToUsd,
  gradeSnapshot,
  receivablesToEventsWithBehaviour,
  recurringExpensesToEvents,
  summarizeAccuracy,
} from "./cashForecastLogic";

describe("recurring expenses", () => {
  it("expand on schedule until the horizon and stop at end date", () => {
    const ev = recurringExpensesToEvents(
      [
        { id: 1, name: "Rent", category: "rent", frequency: "monthly", dayOfMonth: 1, nextDate: d("2026-10-01"), amount: "2500", isActive: true },
        { id: 2, name: "SaaS", frequency: "weekly", nextDate: d("2026-10-01"), endDate: d("2026-10-10"), amount: "50", isActive: true },
        { id: 3, name: "Old", frequency: "monthly", nextDate: d("2026-10-01"), amount: "999", isActive: false },
      ],
      d("2026-12-28"),
    );
    expect(ev.filter((e) => e.ref?.startsWith("recurring_expense:1:")).map((e) => isoDate(e.date))).toEqual(["2026-10-01", "2026-11-01", "2026-12-01"]);
    expect(ev.filter((e) => e.ref?.startsWith("recurring_expense:2:"))).toHaveLength(2);
    expect(ev.every((e) => e.direction === "out" && e.category === "recurring_expenses")).toBe(true);
    expect(ev[0].label).toBe("Rent · rent");
  });
});

describe("payment behaviour", () => {
  it("returns the median days-to-pay for customers with enough history, one sample per invoice", () => {
    const b = computePayBehaviour([
      { invoiceId: 1, customerId: 1, issueDate: d("2026-01-01"), paymentDate: d("2026-02-15") }, // 45
      { invoiceId: 2, customerId: 1, issueDate: d("2026-02-01"), paymentDate: d("2026-03-03") }, // partial
      { invoiceId: 2, customerId: 1, issueDate: d("2026-02-01"), paymentDate: d("2026-04-02") }, // settles: 60
      { invoiceId: 3, customerId: 1, issueDate: d("2026-03-01"), paymentDate: d("2026-04-20") }, // 50
      { invoiceId: 4, customerId: 2, issueDate: d("2026-03-01"), paymentDate: d("2026-03-10") },
      { invoiceId: 5, customerId: 2, issueDate: d("2026-03-01"), paymentDate: d("2026-03-11") },
      { invoiceId: 5, customerId: 2, issueDate: d("2026-03-01"), paymentDate: d("2026-03-12") }, // same invoice
      { invoiceId: 6, customerId: 3, issueDate: d("2026-03-01"), paymentDate: d("2025-03-10") }, // negative, ignored
    ]);
    expect(b.get(1)).toEqual({ samples: 3, medianDaysToPay: 50 });
    expect(b.has(2)).toBe(false); // two invoices, not three
    expect(b.has(3)).toBe(false);
  });

  it("moves receipts to issue + median days, never earlier than the due date", () => {
    const behaviour = computePayBehaviour([
      { customerId: 1, issueDate: d("2026-01-01"), paymentDate: d("2026-03-02") },
      { customerId: 1, issueDate: d("2026-02-01"), paymentDate: d("2026-04-02") },
      { customerId: 1, issueDate: d("2026-03-01"), paymentDate: d("2026-04-30") },
    ]); // median 60
    const ev = receivablesToEventsWithBehaviour(
      [
        { id: 1, customerId: 1, status: "sent", issueDate: d("2026-09-01"), dueDate: d("2026-10-01"), totalAmount: "100" },
        { id: 2, customerId: 1, status: "sent", issueDate: d("2026-09-01"), dueDate: d("2026-12-01"), totalAmount: "100" },
        { id: 3, customerId: 9, status: "sent", issueDate: d("2026-09-01"), dueDate: d("2026-10-01"), totalAmount: "100" },
      ],
      behaviour,
    );
    expect(isoDate(ev[0].date)).toBe("2026-10-31"); // issue + 60 > due
    expect(isoDate(ev[1].date)).toBe("2026-12-01"); // due date later than behaviour → keep due
    expect(isoDate(ev[2].date)).toBe("2026-10-01"); // no history → due date
    expect(ev[0].label).toContain("pays ~60d");
  });
});

describe("scenarios", () => {
  const base = [
    { date: d("2026-10-01"), amount: 1000, direction: "in" as const, category: "customer_receipts" as const, label: "A", ref: "invoice:1" },
    { date: d("2026-10-01"), amount: 500, direction: "in" as const, category: "customer_receipts" as const, label: "B", ref: "invoice:2" },
    { date: d("2026-10-05"), amount: 300, direction: "out" as const, category: "vendor_bills" as const, label: "V" },
    { date: d("2026-10-05"), amount: 200, direction: "out" as const, category: "payroll" as const, label: "P" },
  ];
  it("slips AR/AP, haircuts AR and drops excluded customers", () => {
    const out = applyScenario(base, { arSlipDays: 14, arHaircutPct: 10, apSlipDays: -7, excludeCustomerIds: [2] }, new Map([["invoice:1", 1], ["invoice:2", 2]]));
    expect(out).toHaveLength(3);
    expect(isoDate(out[0].date)).toBe("2026-10-15");
    expect(out[0].amount).toBe(900);
    expect(isoDate(out[1].date)).toBe("2026-09-28");
    expect(isoDate(out[2].date)).toBe("2026-10-05"); // payroll untouched
  });
  it("is a no-op with empty knobs", () => {
    expect(applyScenario(base, {})).toEqual(base);
  });
});

describe("fx", () => {
  it("converts with known rates and counts the rest", () => {
    const r = convertEventsToUsd(
      [
        { date: d("2026-10-01"), amount: 1000, direction: "in", category: "customer_receipts", label: "ZA", currency: "ZAR" },
        { date: d("2026-10-01"), amount: 100, direction: "in", category: "customer_receipts", label: "IN", currency: "INR" },
        { date: d("2026-10-01"), amount: 5, direction: "in", category: "customer_receipts", label: "US", currency: "USD" },
      ],
      new Map([["ZAR", 0.055]]),
    );
    expect(r.events[0].amount).toBe(55);
    expect(r.events[0].currency).toBe("USD");
    expect(r.events[0].label).toBe("ZA (ZAR)");
    expect(r.events[1].amount).toBe(100);
    expect(r.unconverted).toBe(1);
  });
});

describe("accuracy", () => {
  it("grades only finished weeks against bank credits/debits", () => {
    const weeks = [
      { start: "2026-09-14", end: "2026-09-20", totalIn: 1000, totalOut: 400, closingCash: 0 },
      { start: "2026-09-21", end: "2026-09-27", totalIn: 500, totalOut: 500, closingCash: 0 },
      { start: "2026-09-28", end: "2026-10-04", totalIn: 700, totalOut: 100, closingCash: 0 }, // current week
    ];
    const rows = gradeSnapshot(
      weeks,
      [
        { date: d("2026-09-15"), amount: "800", type: "credit" },
        { date: d("2026-09-17"), amount: "-450", type: "debit" },
        { date: d("2026-09-22"), amount: "500", type: "credit" },
        { date: d("2026-09-29"), amount: "9999", type: "credit" },
      ],
      asOf,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ start: "2026-09-14", actualIn: 800, actualOut: 450, inError: -200, outError: 50, netError: -250 });
    expect(rows[1]).toMatchObject({ actualIn: 500, actualOut: 0 });
    const s = summarizeAccuracy(rows);
    expect(s.weeks).toBe(2);
    expect(s.inMape).toBe(12.5); // |800-1000|/800 = 25%, |500-500|/500 = 0% → 12.5%
    expect(s.outMape).toBe(55.56); // |450-400|/450 = 11.11%, actual 0 with forecast 500 → 100%
  });

  it("uses actuals as the denominator and never hides a missed movement", () => {
    const s = summarizeAccuracy([
      { start: "a", forecastIn: 0, actualIn: 1000, forecastOut: 0, actualOut: 0, inError: 1000, outError: 0, netError: 1000 },
    ]);
    expect(s.inMape).toBe(100); // forecast nothing, got 1000
    expect(s.outMape).toBeNull(); // neither side moved
  });
  it("summarizes nothing when nothing is graded", () => {
    expect(summarizeAccuracy([])).toEqual({ weeks: 0, inMape: null, outMape: null });
  });
});
