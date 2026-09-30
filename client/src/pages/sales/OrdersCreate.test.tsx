// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  create: vi.fn(async (input: any) => ({ id: 7, ...input })),
  createCustomer: vi.fn(async (input: any) => ({ id: 9, ...input })),
  invalidateOrders: vi.fn(),
  invalidateCustomers: vi.fn(),
  customers: [{ id: 3, name: "Acme Foods" }] as any[],
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
        orders: { invalidate: mocks.invalidateOrders, list: { invalidate: mocks.invalidateOrders } },
        customers: { invalidate: mocks.invalidateCustomers, list: { invalidate: mocks.invalidateCustomers } },
      }),
      orders: {
        list: query(() => []),
        listPaged: query(() => ({ rows: [], total: 0 })),
        create: mutation(mocks.create),
        update: mutation(async () => ({ success: true })),
        delete: mutation(async () => ({ success: true })),
        bulkDelete: mutation(async () => ({ success: true, deleted: 0 })),
      },
      customers: {
        list: query(() => mocks.customers),
        listPaged: query(() => ({ rows: mocks.customers, total: mocks.customers.length })),
        get: query(() => undefined),
        create: mutation(mocks.createCustomer),
      },
    },
  };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// The grid is not under test; keep jsdom away from its virtualised layout.
vi.mock("@/components/SpreadsheetTable", () => ({
  SpreadsheetTable: () => <div data-testid="orders-table" />,
}));

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
import Orders from "./Orders";

function openCreateDialog() {
  render(<Orders />);
  fireEvent.click(screen.getByRole("button", { name: /create order/i }));
  const dialog = screen.getByRole("dialog", { name: /create order/i });
  fireEvent.click(within(dialog).getByRole("option", { name: "Acme Foods" }));
  return dialog;
}

describe("Orders create dialog", () => {
  beforeEach(() => {
    mocks.create.mockClear();
    mocks.invalidateOrders.mockClear();
    (toast.success as any).mockClear();
    (toast.error as any).mockClear();
  });
  afterEach(cleanup);

  it("sends line items with computed totals in the orders.create payload shape", async () => {
    const dialog = openCreateDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: /add line/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: /add line/i }));
    fireEvent.change(within(dialog).getByLabelText("Line 1 description"), { target: { value: "Granola 12oz" } });
    fireEvent.change(within(dialog).getByLabelText("Line 1 quantity"), { target: { value: "10" } });
    fireEvent.change(within(dialog).getByLabelText("Line 1 unit price"), { target: { value: "12.5" } });
    fireEvent.change(within(dialog).getByLabelText("Line 2 description"), { target: { value: "Granola 32oz" } });
    fireEvent.change(within(dialog).getByLabelText("Line 2 quantity"), { target: { value: "4" } });
    fireEvent.change(within(dialog).getByLabelText("Line 2 unit price"), { target: { value: "25" } });

    // Subtotal and total are derived from the lines; tax is still keyed in.
    expect(within(dialog).getByLabelText("Line 1 total")).toHaveTextContent("$125.00");
    expect(within(dialog).getByLabelText("Subtotal")).toHaveValue(225);
    expect(within(dialog).getByLabelText("Subtotal")).toHaveAttribute("readonly");
    fireEvent.change(within(dialog).getByLabelText("Tax"), { target: { value: "18" } });
    expect(within(dialog).getByLabelText("Total")).toHaveValue(243);

    fireEvent.click(within(dialog).getByRole("button", { name: /create order/i }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    const input = mocks.create.mock.calls[0][0];
    expect(input.orderDate).toBeInstanceOf(Date);
    expect(input).toMatchObject({ customerId: 3, subtotal: "225.00", taxAmount: "18", totalAmount: "243.00" });
    expect(input.items).toEqual([
      { name: "Granola 12oz", quantity: "10", unitPrice: "12.50", totalAmount: "125.00" },
      { name: "Granola 32oz", quantity: "4", unitPrice: "25.00", totalAmount: "100.00" },
    ]);
    for (const item of input.items) for (const value of Object.values(item)) expect(typeof value).toBe("string");

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Order created successfully"));
    expect(mocks.invalidateOrders).toHaveBeenCalled();
  });

  it("keeps the totals-only path: no items key when no line is filled in", async () => {
    const dialog = openCreateDialog();
    // A blank line that was added and left empty is dropped, not sent.
    fireEvent.click(within(dialog).getByRole("button", { name: /add line/i }));
    expect(within(dialog).getByLabelText("Subtotal")).not.toHaveAttribute("readonly");
    fireEvent.change(within(dialog).getByLabelText("Subtotal"), { target: { value: "100" } });
    fireEvent.change(within(dialog).getByLabelText("Tax"), { target: { value: "8" } });
    expect(within(dialog).getByLabelText("Total")).toHaveValue(108);

    fireEvent.click(within(dialog).getByRole("button", { name: /create order/i }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    const input = mocks.create.mock.calls[0][0];
    expect(input).toMatchObject({ customerId: 3, subtotal: "100", taxAmount: "8", totalAmount: "108.00" });
    expect(input).not.toHaveProperty("items");
  });

  it("removing a line recomputes the subtotal", () => {
    const dialog = openCreateDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: /add line/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: /add line/i }));
    fireEvent.change(within(dialog).getByLabelText("Line 1 description"), { target: { value: "A" } });
    fireEvent.change(within(dialog).getByLabelText("Line 1 unit price"), { target: { value: "30" } });
    fireEvent.change(within(dialog).getByLabelText("Line 2 description"), { target: { value: "B" } });
    fireEvent.change(within(dialog).getByLabelText("Line 2 unit price"), { target: { value: "20" } });
    expect(within(dialog).getByLabelText("Subtotal")).toHaveValue(50);
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove line 1" }));
    expect(within(dialog).getByLabelText("Subtotal")).toHaveValue(20);
    expect(within(dialog).getByLabelText("Line 1 description")).toHaveValue("B");
  });
});
