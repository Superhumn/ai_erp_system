// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  role: "finance",
  queryInputs: [] as Array<{ path: string; input: any; opts: any }>,
  match: vi.fn(async () => ({})),
  unmatch: vi.fn(async () => ({})),
  exclude: vi.fn(async () => ({})),
  autoMatch: vi.fn(async () => ({ scanned: 2, reconciled: 1, needsReview: 1, noCandidates: 0, minConfidence: 90, matches: [] })),
  invalidateSuggest: vi.fn(),
  invalidateSummary: vi.fn(),
  invalidateTransactions: vi.fn(),
  summary: {
    unreconciled: { count: 2, inflow: 500, outflow: 1200, total: 1700 },
    suggested: { count: 0, inflow: 0, outflow: 0, total: 0 },
    reconciled: { count: 3, inflow: 0, outflow: 450.25, total: 450.25 },
    excluded: { count: 1, inflow: 0, outflow: 12, total: 12 },
    all: { count: 6, inflow: 500, outflow: 1662.25, total: 2162.25 },
  },
  lines: [
    {
      id: 7,
      date: new Date(2026, 8, 10),
      amount: "1200.00",
      type: "debit",
      signedAmount: -1200,
      description: "ACH ACME MILLS ACH-777",
      counterpartyName: "Acme Mills",
      reconciliationStatus: "unreconciled",
      suggestions: [
        {
          paymentId: 50,
          confidence: 100,
          daysApart: 0,
          reasons: ["Amount matches exactly ($1,200.00)", "Same day"],
          payment: { id: 50, paymentNumber: "PAY-050", vendorName: "Acme Mills", customerName: null, paymentDate: new Date(2026, 8, 10) },
        },
        {
          paymentId: 51,
          confidence: 70,
          daysApart: 3,
          reasons: ["Amount matches exactly ($1,200.00)", "3 days apart"],
          payment: { id: 51, paymentNumber: "PAY-051", vendorName: "Other Co", customerName: null, paymentDate: new Date(2026, 8, 13) },
        },
      ],
    },
    {
      id: 8,
      date: new Date(2026, 8, 11),
      amount: "500.00",
      type: "credit",
      signedAmount: 500,
      description: "DEPOSIT",
      counterpartyName: null,
      reconciliationStatus: "unreconciled",
      suggestions: [],
    },
  ] as any[],
  transactions: [
    { id: 3, date: new Date(2026, 8, 1), amount: "450.25", type: "debit", counterpartyName: "Acme Mills", description: "ACH", reconciliationStatus: "reconciled", matchedPaymentId: 2 },
    { id: 7, date: new Date(2026, 8, 10), amount: "1200.00", type: "debit", counterpartyName: "Acme Mills", description: "ACH", reconciliationStatus: "unreconciled", matchedPaymentId: null },
  ] as any[],
}));

vi.mock("@/lib/trpc", () => {
  const query = (path: string, get: (input?: any) => any) => ({
    useQuery: (input?: any, opts?: any) => {
      mocks.queryInputs.push({ path, input, opts });
      return { data: opts?.enabled === false ? undefined : get(input), isLoading: false };
    },
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
        banking: {
          transactions: { invalidate: mocks.invalidateTransactions },
          reconciliation: {
            suggest: { invalidate: mocks.invalidateSuggest },
            summary: { invalidate: mocks.invalidateSummary },
          },
        },
      }),
      banking: {
        transactions: query("banking.transactions", () => mocks.transactions),
        reconciliation: {
          summary: query("banking.reconciliation.summary", () => mocks.summary),
          suggest: query("banking.reconciliation.suggest", () => mocks.lines),
          match: mutation(mocks.match),
          unmatch: mutation(mocks.unmatch),
          exclude: mutation(mocks.exclude),
          autoMatch: mutation(mocks.autoMatch),
        },
      },
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
import { ReconcileSection } from "./Banking";

const rowFor = (text: string) => within(screen.getByRole("table", { name: "Unreconciled bank lines" })).getByText(text).closest("tr")!;

describe("Banking → Reconcile section", () => {
  beforeEach(() => {
    mocks.role = "finance";
    mocks.queryInputs.length = 0;
    for (const fn of [mocks.match, mocks.unmatch, mocks.exclude, mocks.autoMatch, mocks.invalidateSuggest, mocks.invalidateSummary, mocks.invalidateTransactions]) fn.mockClear();
    (toast.success as any).mockClear();
    (toast.error as any).mockClear();
  });
  afterEach(cleanup);

  it("renders the summary strip and each open line with its top suggestion and confidence", () => {
    render(<ReconcileSection />);
    const strip = screen.getByLabelText("Reconciliation summary");
    expect(within(strip).getByText("Unreconciled")).toBeInTheDocument();
    expect(within(strip).getByText("$1,700.00")).toBeInTheDocument();
    expect(within(strip).getByText("$450.25")).toBeInTheDocument();
    expect(within(strip).getByText("Needs review")).toBeInTheDocument();

    const acme = rowFor("ACH ACME MILLS ACH-777");
    expect(within(acme).getByText("-$1,200.00")).toBeInTheDocument();
    expect(within(acme).getByText("100%")).toBeInTheDocument();
    expect(within(acme).getByText("Amount matches exactly ($1,200.00) · Same day")).toBeInTheDocument();
    expect(within(acme).getAllByRole("option")).toHaveLength(2);

    const deposit = rowFor("DEPOSIT");
    expect(within(deposit).getByText("+$500.00")).toBeInTheDocument();
    expect(within(deposit).getByText("No matching payment")).toBeInTheDocument();
    expect(within(deposit).getByRole("button", { name: /match/i })).toBeDisabled();

    expect(mocks.queryInputs.find((q) => q.path === "banking.reconciliation.suggest")).toMatchObject({ input: { limit: 100 }, opts: { enabled: true } });
  });

  it("Match sends the top suggestion's payment id and refreshes suggest, summary and transactions", async () => {
    render(<ReconcileSection />);
    fireEvent.click(within(rowFor("ACH ACME MILLS ACH-777")).getByRole("button", { name: /^match$/i }));
    await waitFor(() => expect(mocks.match).toHaveBeenCalledWith({ bankTransactionId: 7, paymentId: 50 }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Bank line reconciled"));
    expect(mocks.invalidateSuggest).toHaveBeenCalled();
    expect(mocks.invalidateSummary).toHaveBeenCalled();
    expect(mocks.invalidateTransactions).toHaveBeenCalled();
  });

  it("picking another suggestion changes the match payload", async () => {
    render(<ReconcileSection />);
    const row = rowFor("ACH ACME MILLS ACH-777");
    fireEvent.click(within(row).getByRole("option", { name: /PAY-051/ }));
    expect(within(row).getByText("70%")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: /^match$/i }));
    await waitFor(() => expect(mocks.match).toHaveBeenCalledWith({ bankTransactionId: 7, paymentId: 51 }));
  });

  it("Exclude asks for a reason and sends it trimmed", async () => {
    render(<ReconcileSection />);
    fireEvent.click(within(rowFor("DEPOSIT")).getByRole("button", { name: /exclude/i }));
    const dialog = screen.getByRole("dialog", { name: /exclude bank line/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /exclude line/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Give a reason for excluding this line"));
    expect(mocks.exclude).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "  Owner transfer  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: /exclude line/i }));
    await waitFor(() => expect(mocks.exclude).toHaveBeenCalledWith({ bankTransactionId: 8, reason: "Owner transfer" }));
  });

  it("Auto-match uses the 90% threshold and reports the counts", async () => {
    render(<ReconcileSection />);
    fireEvent.click(screen.getByRole("button", { name: /auto-match high-confidence/i }));
    await waitFor(() => expect(mocks.autoMatch).toHaveBeenCalledWith({ minConfidence: 90 }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Auto-matched 1 of 2 line(s); 1 need review"));
  });

  it("lists reconciled lines with an Unmatch action", async () => {
    render(<ReconcileSection />);
    const closed = screen.getByLabelText("Closed bank lines");
    expect(within(closed).getByText(/Payment #2/)).toBeInTheDocument();
    expect(within(closed).getAllByRole("button", { name: /unmatch/i })).toHaveLength(1);
    fireEvent.click(within(closed).getByRole("button", { name: /unmatch/i }));
    await waitFor(() => expect(mocks.unmatch).toHaveBeenCalledWith({ bankTransactionId: 3 }));
  });

  it("renders nothing and disables its queries for non-finance roles", () => {
    mocks.role = "sales";
    const { container } = render(<ReconcileSection />);
    expect(container).toBeEmptyDOMElement();
    expect(mocks.queryInputs.filter((q) => q.path.startsWith("banking.")).every((q) => q.opts?.enabled === false)).toBe(true);
  });
});
