// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  createInvestor: vi.fn(async (input: any) => ({ id: 77 })),
  addInvestment: vi.fn(async (input: any) => ({ id: 5 })),
  refetchInvestors: vi.fn(),
  investors: [] as any[],
  links: [] as any[],
}));

vi.mock("@/lib/trpc", () => {
  const query = (get: () => any, refetch?: any) => ({
    useQuery: () => ({ data: get(), isLoading: false, refetch: refetch || (() => {}) }),
  });
  const mutation = (fn: any) => ({
    useMutation: (opts: any = {}) => ({
      isPending: false,
      mutateAsync: fn,
      mutate: (input: any) => Promise.resolve(fn(input)).then((r: any) => opts.onSuccess?.(r)),
    }),
  });
  return {
    trpc: {
      crm: {
        listCampaigns: query(() => [
          { id: 1, name: "India", status: "active", roundType: "seed", targetAmount: "1000000", raisedAmount: "0" },
        ]),
        listInvestors: query(() => mocks.investors, mocks.refetchInvestors),
        listCampaignInvestors: query(() => mocks.links),
        createCampaign: mutation(async () => ({})),
        updateCampaign: mutation(async () => ({})),
        createInvestor: mutation(mocks.createInvestor),
        addCampaignInvestment: mutation(mocks.addInvestment),
        removeCampaignInvestment: mutation(async () => ({})),
      },
      companies: { list: query(() => []) },
    },
  };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import FundraisingCampaigns from "./FundraisingCampaigns";

const openNewInvestorForm = () => {
  render(<FundraisingCampaigns />);
  fireEvent.click(screen.getByLabelText("Investors"));
  fireEvent.click(screen.getByRole("button", { name: /new investor/i }));
};

describe("FundraisingCampaigns — round investors dialog", () => {
  beforeEach(() => {
    mocks.createInvestor.mockClear();
    mocks.addInvestment.mockClear();
    (toast.error as any).mockClear();
    (toast.success as any).mockClear();
    mocks.refetchInvestors.mockClear();
    mocks.investors = [];
    mocks.links = [];
  });
  afterEach(cleanup);

  it("points at the inline form when the CRM has no investors", () => {
    render(<FundraisingCampaigns />);
    fireEvent.click(screen.getByLabelText("Investors"));
    expect(screen.getByText(/No investors in your CRM yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new investor/i })).toBeInTheDocument();
  });

  it("creates the investor in the CRM and links it to the round when an amount is given", async () => {
    openNewInvestorForm();

    fireEvent.change(screen.getByLabelText("Investor name"), { target: { value: "  Kalaari Capital  " } });
    fireEvent.change(screen.getByLabelText("Investor email"), { target: { value: "vinod@kalaari.com" } });
    fireEvent.change(screen.getByLabelText("Investor firm"), { target: { value: "Kalaari" } });
    fireEvent.change(screen.getByLabelText("Committed amount"), { target: { value: "250000" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to CRM" }));

    await waitFor(() => expect(mocks.createInvestor).toHaveBeenCalledTimes(1));
    expect(mocks.createInvestor).toHaveBeenCalledWith({
      name: "Kalaari Capital",
      email: "vinod@kalaari.com",
      company: "Kalaari",
      title: undefined,
      type: "angel",
      status: "lead",
    });
    await waitFor(() =>
      expect(mocks.addInvestment).toHaveBeenCalledWith({ campaignId: 1, investorId: 77, amount: "250000" }),
    );
    // The select needs to see the newly created investor.
    await waitFor(() => expect(mocks.refetchInvestors).toHaveBeenCalled());
  });

  it("creates a CRM-only investor when no amount is given", async () => {
    openNewInvestorForm();

    fireEvent.change(screen.getByLabelText("Investor name"), { target: { value: "Blume Ventures" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to CRM" }));

    await waitFor(() => expect(mocks.createInvestor).toHaveBeenCalledTimes(1));
    expect(mocks.addInvestment).not.toHaveBeenCalled();
  });

  it("keeps the submit button disabled until a name is entered", () => {
    openNewInvestorForm();
    const submit = screen.getByRole("button", { name: "Add to CRM" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Investor name"), { target: { value: "Accel" } });
    expect(submit).not.toBeDisabled();
  });

  it("rejects a malformed amount before creating anything in the CRM", async () => {
    openNewInvestorForm();

    fireEvent.change(screen.getByLabelText("Investor name"), { target: { value: "Accel" } });
    fireEvent.change(screen.getByLabelText("Committed amount"), { target: { value: "1.234" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to CRM" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(mocks.createInvestor).not.toHaveBeenCalled();
    expect(mocks.addInvestment).not.toHaveBeenCalled();
  });

  it("links the already-created investor instead of duplicating it when a retry follows a failed link", async () => {
    mocks.addInvestment.mockRejectedValueOnce(new Error("network down"));
    openNewInvestorForm();

    fireEvent.change(screen.getByLabelText("Investor name"), { target: { value: "Accel" } });
    fireEvent.change(screen.getByLabelText("Committed amount"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to CRM" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("network down"));
    expect(mocks.createInvestor).toHaveBeenCalledTimes(1);

    // Retry with the same form: the CRM row already exists, so only the link runs.
    fireEvent.click(screen.getByRole("button", { name: "Add to CRM" }));
    await waitFor(() => expect(mocks.addInvestment).toHaveBeenCalledTimes(2));
    expect(mocks.createInvestor).toHaveBeenCalledTimes(1);
    expect(mocks.addInvestment).toHaveBeenLastCalledWith({ campaignId: 1, investorId: 77, amount: "100" });
  });

  it("returns to the CRM picker after a successful create", async () => {
    openNewInvestorForm();
    fireEvent.change(screen.getByLabelText("Investor name"), { target: { value: "Accel" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to CRM" }));
    await waitFor(() => expect(screen.getByText("Add investor from CRM")).toBeInTheDocument());
  });
});
