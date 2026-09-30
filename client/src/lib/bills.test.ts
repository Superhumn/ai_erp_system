import { describe, it, expect } from "vitest";
import {
  billOutstanding,
  billCanApprove,
  billIsOpen,
  billStatusLabel,
  blankToUndefined,
  buildBillPayload,
  buildLineItems,
  lineItemTotal,
  moneyString,
  type BillFormState,
} from "./bills";
import { parseDateInput } from "./dateInput";

const baseForm: BillFormState = {
  vendorId: "3",
  billNumber: "",
  billDate: "2026-09-01",
  dueDate: "",
  totalAmount: "150",
  subtotal: "",
  taxAmount: "",
  shippingAmount: "",
  currency: "usd",
  paymentTerms: "",
  autopay: false,
  notes: "",
  lineItems: [],
};

describe("billOutstanding", () => {
  it("subtracts amountPaid from totalAmount on decimal strings", () => {
    expect(billOutstanding({ totalAmount: "1250.50", amountPaid: "250.25" })).toBe(1000.25);
  });

  it("treats a missing amountPaid as zero and never goes negative", () => {
    expect(billOutstanding({ totalAmount: "99.99", amountPaid: null })).toBe(99.99);
    expect(billOutstanding({ totalAmount: "10", amountPaid: "25" })).toBe(0);
  });

  it("returns zero for unparseable input", () => {
    expect(billOutstanding({ totalAmount: "abc", amountPaid: undefined })).toBe(0);
  });
});

describe("status helpers", () => {
  it("only draft and pending_approval bills can be approved", () => {
    expect(billCanApprove("draft")).toBe(true);
    expect(billCanApprove("pending_approval")).toBe(true);
    expect(billCanApprove("approved")).toBe(false);
    expect(billCanApprove("paid")).toBe(false);
  });

  it("paid and cancelled bills are closed", () => {
    expect(billIsOpen("paid")).toBe(false);
    expect(billIsOpen("cancelled")).toBe(false);
    expect(billIsOpen("overdue")).toBe(true);
  });

  it("labels snake_case statuses", () => {
    expect(billStatusLabel("pending_approval")).toBe("Pending approval");
    expect(billStatusLabel(null)).toBe("—");
  });
});

describe("blankToUndefined / moneyString", () => {
  it("drops empty strings so optional fields are omitted", () => {
    expect(blankToUndefined("")).toBeUndefined();
    expect(blankToUndefined("   ")).toBeUndefined();
    expect(blankToUndefined(" net 30 ")).toBe("net 30");
  });

  it("normalises money to 2dp strings and flags bad input", () => {
    expect(moneyString("")).toBeUndefined();
    expect(moneyString("12.5")).toBe("12.50");
    expect(moneyString("abc")).toBeNull();
    expect(moneyString("-3")).toBeNull();
  });
});

describe("line items", () => {
  it("computes the row total from quantity and unit price", () => {
    expect(lineItemTotal({ quantity: "3", unitPrice: "19.99" })).toBe(59.97);
  });

  it("drops rows without a description", () => {
    const items = buildLineItems([
      { description: "Widgets", quantity: "2", unitPrice: "5" },
      { description: "  ", quantity: "1", unitPrice: "100" },
    ]);
    expect(items).toEqual([{ description: "Widgets", quantity: 2, unitPrice: 5, totalPrice: 10 }]);
  });
});

describe("buildBillPayload", () => {
  it("sends money as strings, dates as Date objects, and no empty strings", () => {
    const result = buildBillPayload({ ...baseForm, dueDate: "2026-10-01" }, parseDateInput);
    expect("payload" in result).toBe(true);
    if (!("payload" in result)) return;
    expect(result.payload.vendorId).toBe(3);
    expect(result.payload.totalAmount).toBe("150.00");
    expect(result.payload.billDate).toBeInstanceOf(Date);
    expect(result.payload.dueDate).toBeInstanceOf(Date);
    expect(result.payload.currency).toBe("USD");
    for (const value of Object.values(result.payload)) {
      expect(value).not.toBe("");
    }
    expect(result.payload).not.toHaveProperty("billNumber");
    expect(result.payload).not.toHaveProperty("notes");
    expect(result.payload).not.toHaveProperty("lineItems");
  });

  it("falls back to the line-item sum when the total is blank", () => {
    const result = buildBillPayload(
      {
        ...baseForm,
        totalAmount: "",
        lineItems: [
          { description: "A", quantity: "2", unitPrice: "10" },
          { description: "B", quantity: "1", unitPrice: "5.5" },
        ],
      },
      parseDateInput,
    );
    if (!("payload" in result)) throw new Error(result.error);
    expect(result.payload.totalAmount).toBe("25.50");
    expect(result.payload.lineItems).toHaveLength(2);
  });

  it("rejects a missing vendor, bill date, or total", () => {
    expect(buildBillPayload({ ...baseForm, vendorId: "" }, parseDateInput)).toEqual({ error: "Choose a vendor" });
    expect(buildBillPayload({ ...baseForm, billDate: "" }, parseDateInput)).toEqual({ error: "Bill date is required" });
    expect(buildBillPayload({ ...baseForm, totalAmount: "" }, parseDateInput)).toEqual({ error: "Total amount is required" });
    expect(buildBillPayload({ ...baseForm, totalAmount: "x" }, parseDateInput)).toEqual({ error: "Total amount must be a number" });
  });

  it("rejects a malformed currency code", () => {
    expect(buildBillPayload({ ...baseForm, currency: "dollars" }, parseDateInput)).toEqual({ error: "Currency must be a 3-letter code" });
  });
});
