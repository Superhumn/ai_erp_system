// @ts-nocheck
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { DetailSheet, useRowSelection } from "./DetailSheet";

describe("DetailSheet", () => {
  afterEach(cleanup);

  it("does not render body content when closed", () => {
    render(
      <DetailSheet open={false} onOpenChange={() => {}} title="Shipment #1">
        <div>secret body</div>
      </DetailSheet>,
    );
    expect(screen.queryByText("secret body")).not.toBeInTheDocument();
  });

  it("renders title, subtitle, body when open", () => {
    render(
      <DetailSheet
        open={true}
        onOpenChange={() => {}}
        title="Shipment #42"
        subtitle="Oakland → Tokyo"
      >
        <div>body content</div>
      </DetailSheet>,
    );
    expect(screen.getByText("Shipment #42")).toBeInTheDocument();
    expect(screen.getByText("Oakland → Tokyo")).toBeInTheDocument();
    expect(screen.getByText("body content")).toBeInTheDocument();
  });

  it("renders actions and footer slots", () => {
    render(
      <DetailSheet
        open={true}
        onOpenChange={() => {}}
        title="t"
        actions={<button>Mark shipped</button>}
        footer={<button>Save</button>}
      >
        body
      </DetailSheet>,
    );
    expect(screen.getByText("Mark shipped")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when built-in close button is clicked", () => {
    const onOpenChange = vi.fn();
    render(
      <DetailSheet open={true} onOpenChange={onOpenChange} title="t">
        body
      </DetailSheet>,
    );
    // SheetContent renders a Close button with sr-only "Close" label
    fireEvent.click(screen.getByText("Close"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onOpenChange(false) on Escape", () => {
    const onOpenChange = vi.fn();
    render(
      <DetailSheet open={true} onOpenChange={onOpenChange} title="t">
        body
      </DetailSheet>,
    );
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("useRowSelection", () => {
  afterEach(cleanup);

  function Harness() {
    const [selected, setSelected] = useState<{ id: number; name: string } | null>(null);
    const rowProps = useRowSelection(selected?.id ?? null, setSelected);
    const items = [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ];
    return (
      <div>
        <div data-testid="selected">{selected?.name ?? "none"}</div>
        {items.map((i) => (
          <button key={i.id} data-testid={`row-${i.id}`} {...rowProps(i)}>
            {i.name}
          </button>
        ))}
      </div>
    );
  }

  it("selects a row on click and marks it data-selected", () => {
    render(<Harness />);
    expect(screen.getByTestId("selected").textContent).toBe("none");

    fireEvent.click(screen.getByTestId("row-1"));
    expect(screen.getByTestId("selected").textContent).toBe("Alice");
    expect(screen.getByTestId("row-1").getAttribute("data-selected")).toBe("true");
    expect(screen.getByTestId("row-2").getAttribute("data-selected")).toBeNull();
  });

  it("clicking the selected row toggles selection off", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("row-1"));
    fireEvent.click(screen.getByTestId("row-1"));
    expect(screen.getByTestId("selected").textContent).toBe("none");
  });

  it("switching selection swaps highlights", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("row-1"));
    fireEvent.click(screen.getByTestId("row-2"));
    expect(screen.getByTestId("selected").textContent).toBe("Bob");
    expect(screen.getByTestId("row-2").getAttribute("data-selected")).toBe("true");
    expect(screen.getByTestId("row-1").getAttribute("data-selected")).toBeNull();
  });
});
