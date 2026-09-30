// @ts-nocheck
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  listInputs: [] as any[],
  getInputs: [] as any[],
  rows: [{ id: 1, name: "Acme Foods", email: "a@acme.test" }, { id: 2, name: "Bolt Co", email: null }],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    customers: {
      listPaged: {
        useQuery: (input: any) => {
          mocks.listInputs.push(input);
          const rows = input.search ? mocks.rows.filter((r) => r.name.includes(input.search)) : mocks.rows;
          return { data: { rows, total: input.search ? rows.length : 120 } };
        },
      },
      get: {
        useQuery: (input: any, opts: any) => {
          mocks.getInputs.push({ input, enabled: opts?.enabled });
          return { data: opts?.enabled ? { id: input.id, name: "Zed Ltd", email: null } : undefined };
        },
      },
    },
  },
}));

// Radix Select needs pointer APIs jsdom lacks; render options flat.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, onValueChange }: any) => <div data-change={onValueChange ? "y" : "n"} onClickCapture={(e: any) => e.target.dataset.value && onValueChange(e.target.dataset.value)}>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <div role="listbox">{children}</div>,
  SelectItem: ({ value, children }: any) => <button type="button" role="option" data-value={value}>{children}</button>,
}));

import { CustomerPicker } from "./CustomerPicker";

afterEach(() => {
  cleanup();
  mocks.listInputs.length = 0;
  mocks.getInputs.length = 0;
});

describe("CustomerPicker", () => {
  it("lists the first page by name and says more exist", () => {
    render(<CustomerPicker value={0} onChange={() => {}} showEmail />);
    expect(mocks.listInputs[0]).toMatchObject({ limit: 50, sortBy: "name", sortDir: "asc", search: undefined });
    expect(screen.getByRole("option", { name: "Acme Foods (a@acme.test)" })).toBeTruthy();
    expect(screen.getByText(/Showing 2 of 120/)).toBeTruthy();
  });

  it("searches on the server after typing", async () => {
    render(<CustomerPicker value={0} onChange={() => {}} />);
    fireEvent.change(screen.getByLabelText("Search customers"), { target: { value: "Bolt" } });
    await waitFor(() => expect(mocks.listInputs.at(-1).search).toBe("Bolt"));
    expect(screen.queryByRole("option", { name: "Acme Foods" })).toBeNull();
  });

  it("keeps a selected customer that is not in the results", () => {
    render(<CustomerPicker value={99} onChange={() => {}} />);
    expect(mocks.getInputs.at(-1)).toEqual({ input: { id: 99 }, enabled: true });
    expect(screen.getByRole("option", { name: "Zed Ltd" })).toBeTruthy();
  });

  it("does not fetch the selected customer when it is already listed", () => {
    render(<CustomerPicker value={1} onChange={() => {}} />);
    expect(mocks.getInputs.at(-1).enabled).toBe(false);
  });

  it("reports the chosen id", () => {
    const onChange = vi.fn();
    render(<CustomerPicker value={0} onChange={onChange} />);
    fireEvent.click(screen.getByRole("option", { name: "Bolt Co" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });
});
