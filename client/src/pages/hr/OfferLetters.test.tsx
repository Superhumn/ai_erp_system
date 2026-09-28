// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  send: vi.fn(async (input: any) => ({
    success: true, id: input.id, status: "sent", sentAt: new Date(), to: input.to, cc: input.cc ?? [], ccFailed: [], messageId: "m1",
  })),
  previewInputs: [] as any[],
  invalidateList: vi.fn(),
  invalidateGet: vi.fn(),
  offers: [
    { id: 1, candidateName: "Dana Employee", candidateEmail: "dana@example.com", position: "Analyst", department: "Ops", status: "draft", salary: "85000.00", salaryPeriod: "annual" },
    { id: 2, candidateName: "Alex Accepted", candidateEmail: "alex@example.com", position: "Engineer", department: null, status: "accepted", salary: null, salaryPeriod: null },
  ] as any[],
}));

vi.mock("@/lib/trpc", () => {
  const mutation = (fn: any) => ({
    useMutation: (opts: any = {}) => ({
      isPending: false,
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
        offerLetters: {
          list: { invalidate: mocks.invalidateList },
          get: { invalidate: mocks.invalidateGet },
        },
      }),
      offerLetters: {
        list: { useQuery: () => ({ data: mocks.offers, isLoading: false }) },
        preview: {
          useQuery: (input: any, opts: any) => {
            mocks.previewInputs.push({ input, enabled: opts?.enabled });
            return {
              isLoading: false,
              error: null,
              data: opts?.enabled
                ? { subject: "Offer of employment: Analyst", html: "<p>Dear Dana</p>", text: "Dear Dana", to: "dana@example.com", status: "draft" }
                : undefined,
            };
          },
        },
        send: mutation(mocks.send),
        create: mutation(async () => ({})),
        update: mutation(async () => ({})),
        delete: mutation(async () => ({})),
        generate: mutation(async () => ({ content: "" })),
      },
    },
  };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import OfferLetters from "./OfferLetters";

describe("OfferLetters send offer", () => {
  beforeEach(() => {
    mocks.previewInputs.length = 0;
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("disables sending for an accepted offer", () => {
    render(<OfferLetters />);
    expect(screen.getByRole("button", { name: "Send offer to Alex Accepted" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send offer to Dana Employee" })).toBeEnabled();
  });

  it("opens with the recipient prefilled, shows the preview, and sends", async () => {
    render(<OfferLetters />);
    fireEvent.click(screen.getByRole("button", { name: "Send offer to Dana Employee" }));

    expect(screen.getByLabelText("To *")).toHaveValue("dana@example.com");
    expect(screen.getByTestId("offer-preview-subject")).toHaveTextContent("Offer of employment: Analyst");
    expect(screen.getByTitle("Offer email preview")).toHaveAttribute("sandbox", "");
    expect(mocks.previewInputs.at(-1)).toMatchObject({ input: { id: 1 }, enabled: true });

    fireEvent.change(screen.getByLabelText("Cc"), { target: { value: "boss@example.com; hr@example.com" } });
    fireEvent.change(screen.getByLabelText("Personal note (optional)"), { target: { value: "  Welcome!  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send offer" }));

    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1));
    expect(mocks.send).toHaveBeenCalledWith({ id: 1, to: "dana@example.com", cc: ["boss@example.com", "hr@example.com"], message: "Welcome!" });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Offer emailed to dana@example.com"));
    expect(mocks.invalidateList).toHaveBeenCalled();
    expect(mocks.invalidateGet).toHaveBeenCalledWith({ id: 1 });
  });

  it("requires a recipient", async () => {
    render(<OfferLetters />);
    fireEvent.click(screen.getByRole("button", { name: "Send offer to Dana Employee" }));
    fireEvent.change(screen.getByLabelText("To *"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send offer" }));
    expect(toast.error).toHaveBeenCalledWith("Recipient email is required");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("surfaces a send failure as an error toast", async () => {
    mocks.send.mockRejectedValueOnce(new Error("Offer letter email was not sent: bounced"));
    render(<OfferLetters />);
    fireEvent.click(screen.getByRole("button", { name: "Send offer to Dana Employee" }));
    fireEvent.click(screen.getByRole("button", { name: "Send offer" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Offer letter email was not sent: bounced"));
    expect(mocks.invalidateList).not.toHaveBeenCalled();
  });
});
