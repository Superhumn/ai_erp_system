// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  role: "finance",
  create: vi.fn(async (input: any) => ({ id: 99, billNumber: "BILL-099", ...input })),
  approve: vi.fn(async () => ({})),
  markPaid: vi.fn(async () => ({})),
  invalidateList: vi.fn(),
  invalidateAging: vi.fn(),
  invalidateGet: vi.fn(),
  aging: {
    current: 900,
    days1to30: 250.5,
    days31to60: 75,
    days61to90: 30,
    days90plus: 12.25,
    totalOutstanding: 1267.75,
    billCount: 4,
    overdueCount: 3,
  },
  bills: [
    {
      id: 1,
      billNumber: "BILL-001",
      vendorId: 3,
      vendorName: "Acme Supplies",
      poNumber: "PO-77",
      billDate: new Date(2026, 8, 1),
      dueDate: new Date(2026, 9, 1),
      totalAmount: "1250.00",
      amountPaid: "250.00",
      currency: "USD",
      status: "draft",
      matchStatus: "matched",
      lineItems: [{ description: "Widgets", quantity: 5, unitPrice: 250, totalPrice: 1250 }],
      notes: "Rush order",
    },
    {
      id: 2,
      billNumber: "BILL-002",
      vendorId: 4,
      vendorName: "Globex",
      poNumber: null,
      billDate: new Date(2026, 7, 15),
      dueDate: null,
      totalAmount: "480.00",
      amountPaid: "480.00",
      currency: "USD",
      status: "paid",
      matchStatus: "unmatched",
      lineItems: null,
      notes: null,
    },
  ] as any[],
  vendors: [
    { id: 3, name: "Acme Supplies" },
    { id: 4, name: "Globex" },
  ],
}));

vi.mock("@/lib/trpc", () => {
  const query = (get: (input?: any) => any) => ({
    useQuery: (input?: any) => ({ data: get(input), isLoading: false }),
  });
  const mutation = (fn: any) => ({
    useMutation: (opts: any = {}) => ({
      isPending: false,
      mutateAsync: fn,
      mutate: (input: any) =>
        Promise.resolve(fn(input)).then(
          (r: any) => opts.onSuccess?.(r, input),
          (e: any) => opts.onError?.(e, input),
        ),
    }),
  });
  return {
    trpc: {
      useUtils: () => ({
        bills: {
          list: { invalidate: mocks.invalidateList },
          aging: { invalidate: mocks.invalidateAging },
          get: { invalidate: mocks.invalidateGet },
        },
      }),
      bills: {
        aging: query(() => mocks.aging),
        list: query(() => mocks.bills),
        get: query((input) => {
          const row = mocks.bills.find((b) => b.id === input?.id);
          return row ? { ...row, outstanding: Number(row.totalAmount) - Number(row.amountPaid) } : undefined;
        }),
        create: mutation(mocks.create),
        update: mutation(async () => ({})),
        approve: mutation(mocks.approve),
        markPaid: mutation(mocks.markPaid),
        cancel: mutation(async () => ({})),
        createFromText: mutation(async () => ({ bill: null, createdVendor: false, confidence: 0.9 })),
      },
      vendors: { list: query(() => mocks.vendors) },
    },
  };
});

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, role: mocks.role }, loading: false, isAuthenticated: true }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Radix Select needs pointer APIs jsdom lacks; swap in a flat, always-rendered option list.
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const Ctx = React.createContext({ value: "", onValueChange: (_v: string) => {} });
  return {
    Select: ({ value, onValueChange, children }: any) => (
      <Ctx.Provider value={{ value: value ?? "", onValueChange }}>{children}</Ctx.Provider>
    ),
    SelectTrigger: ({ children, ...props }: any) => <button type="button" {...props}>{children}</button>,
    SelectValue: ({ placeholder }: any) => {
      const { value } = React.useContext(Ctx);
      return <span>{value || placeholder}</span>;
    },
    SelectContent: ({ children }: any) => <div role="listbox">{children}</div>,
    SelectItem: ({ value, children }: any) => {
      const ctx = React.useContext(Ctx);
      return (
        <button type="button" role="option" aria-selected={ctx.value === value} onClick={() => ctx.onValueChange(value)}>
          {children}
        </button>
      );
    },
  };
});

import { toast } from "sonner";
import Bills, { BillsSection } from "./Bills";

const openBill = (billNumber: string) => {
  fireEvent.click(screen.getByText(billNumber));
  return screen.getByRole("dialog");
};

describe("Bills page", () => {
  beforeEach(() => {
    mocks.role = "finance";
    mocks.create.mockClear();
    mocks.approve.mockClear();
    mocks.markPaid.mockClear();
    mocks.invalidateList.mockClear();
    mocks.invalidateAging.mockClear();
    mocks.invalidateGet.mockClear();
    (toast.error as any).mockClear();
    (toast.success as any).mockClear();
  });
  afterEach(cleanup);

  it("renders the aging tiles from bills.aging", () => {
    render(<Bills />);
    const tiles = screen.getByLabelText("Bills aging summary");
    expect(within(tiles).getByText("$900.00")).toBeInTheDocument();
    expect(within(tiles).getByText("$250.50")).toBeInTheDocument();
    expect(within(tiles).getByText("$75.00")).toBeInTheDocument();
    expect(within(tiles).getByText("$30.00")).toBeInTheDocument();
    expect(within(tiles).getByText("$12.25")).toBeInTheDocument();
    expect(within(tiles).getByText("$1,267.75")).toBeInTheDocument();
    expect(within(tiles).getByText("Overdue bills")).toBeInTheDocument();
    expect(within(tiles).getByText("3")).toBeInTheDocument();
  });

  it("renders the bills table with vendor, outstanding, status, match and PO", () => {
    render(<Bills />);
    const table = screen.getByRole("table");
    const row1 = within(table).getByText("BILL-001").closest("tr")!;
    expect(within(row1).getByText("Acme Supplies")).toBeInTheDocument();
    expect(within(row1).getByText("$1,250.00")).toBeInTheDocument();
    expect(within(row1).getByText("$1,000.00")).toBeInTheDocument();
    expect(within(row1).getByText("Draft")).toBeInTheDocument();
    expect(within(row1).getByText("Matched")).toBeInTheDocument();
    expect(within(row1).getByText("PO-77")).toBeInTheDocument();
    expect(within(row1).getByText("Sep 1, 2026")).toBeInTheDocument();

    const row2 = within(table).getByText("BILL-002").closest("tr")!;
    expect(within(row2).getByText("Paid")).toBeInTheDocument();
    expect(within(row2).getByText("$0.00")).toBeInTheDocument();
  });

  it("hides Approve / Mark paid / Edit and the create buttons for a sales user", () => {
    mocks.role = "sales";
    render(<Bills />);
    expect(screen.queryByRole("button", { name: /new bill/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /from text/i })).not.toBeInTheDocument();

    const sheet = openBill("BILL-001");
    expect(within(sheet).getByText("Widgets")).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: /mark paid/i })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
  });

  it("shows Approve and Mark paid for finance and invalidates list, aging and get on approve", async () => {
    render(<Bills />);
    const sheet = openBill("BILL-001");
    expect(within(sheet).getByRole("button", { name: /mark paid/i })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: /^edit/i })).toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole("button", { name: /approve/i }));
    await waitFor(() => expect(mocks.approve).toHaveBeenCalledWith({ id: 1 }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Bill approved"));
    expect(mocks.invalidateList).toHaveBeenCalled();
    expect(mocks.invalidateAging).toHaveBeenCalled();
    expect(mocks.invalidateGet).toHaveBeenCalledWith({ id: 1 });
  });

  it("does not offer Approve on a bill that is already paid", () => {
    render(<Bills />);
    const sheet = openBill("BILL-002");
    expect(within(sheet).queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: /mark paid/i })).not.toBeInTheDocument();
  });

  it("defaults the Mark paid amount to the outstanding balance and sends a number", async () => {
    render(<Bills />);
    const sheet = openBill("BILL-001");
    fireEvent.click(within(sheet).getByRole("button", { name: /mark paid/i }));
    const dialog = screen.getByRole("dialog", { name: /mark bill paid/i });
    expect(within(dialog).getByLabelText("Amount")).toHaveValue(1000);
    fireEvent.change(within(dialog).getByLabelText("Reference"), { target: { value: "CHK-12" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /record payment/i }));

    await waitFor(() => expect(mocks.markPaid).toHaveBeenCalledTimes(1));
    const input = mocks.markPaid.mock.calls[0][0];
    expect(input).toMatchObject({ id: 1, amount: 1000, paymentMethod: "bank_transfer", referenceNumber: "CHK-12" });
    expect(input.paymentDate).toBeInstanceOf(Date);
    expect(input).not.toHaveProperty("notes", "");
  });

  it("sends the new-bill form with totalAmount as a string, dates as Dates, and no empty strings", async () => {
    mocks.role = "ops";
    render(<BillsSection />);
    fireEvent.click(screen.getByRole("button", { name: /new bill/i }));
    const dialog = screen.getByRole("dialog", { name: /new bill/i });

    fireEvent.click(within(dialog).getByRole("option", { name: "Acme Supplies" }));
    fireEvent.change(within(dialog).getByLabelText("Total amount *"), { target: { value: "150" } });
    fireEvent.change(within(dialog).getByLabelText("Due date"), { target: { value: "2026-10-15" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /add line/i }));
    fireEvent.change(within(dialog).getByLabelText("Line 1 description"), { target: { value: "Bolts" } });
    fireEvent.change(within(dialog).getByLabelText("Line 1 quantity"), { target: { value: "3" } });
    fireEvent.change(within(dialog).getByLabelText("Line 1 unit price"), { target: { value: "50" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /create bill/i }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    const input = mocks.create.mock.calls[0][0];
    expect(input.vendorId).toBe(3);
    expect(input.totalAmount).toBe("150.00");
    expect(input.billDate).toBeInstanceOf(Date);
    expect(input.dueDate).toBeInstanceOf(Date);
    expect(input.dueDate.getDate()).toBe(15);
    expect(input.currency).toBe("USD");
    expect(input.lineItems).toEqual([{ description: "Bolts", quantity: 3, unitPrice: 50, totalPrice: 150 }]);
    expect(input).not.toHaveProperty("billNumber");
    expect(input).not.toHaveProperty("notes");
    expect(input).not.toHaveProperty("paymentTerms");
    for (const value of Object.values(input)) expect(value).not.toBe("");

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(mocks.invalidateList).toHaveBeenCalled();
    expect(mocks.invalidateAging).toHaveBeenCalled();
  });

  it("rejects the new-bill form without a vendor before calling the API", async () => {
    mocks.role = "finance";
    render(<BillsSection />);
    fireEvent.click(screen.getByRole("button", { name: /new bill/i }));
    const dialog = screen.getByRole("dialog", { name: /new bill/i });
    fireEvent.change(within(dialog).getByLabelText("Total amount *"), { target: { value: "150" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /create bill/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Choose a vendor"));
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
