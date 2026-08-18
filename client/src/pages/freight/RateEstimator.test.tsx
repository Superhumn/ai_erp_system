import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, within, fireEvent, cleanup } from "@testing-library/react";
import RateEstimator from "./RateEstimator";

// This suite has no globals, so RTL's auto-cleanup never registers.
afterEach(cleanup);

/**
 * The form defaults the sail date to today, which would make every assertion
 * depend on whether the suite runs inside the Aug-Oct peak window. Pin it.
 */
function renderAt(sailDate = "2026-03-01") {
  const view = render(<RateEstimator />);
  fireEvent.change(screen.getByLabelText("Sail date"), { target: { value: sailDate } });
  return view;
}

/** Currency renders inside its own cell, so the same figure can appear more than once. */
function shows(text: string) {
  return screen.getAllByText(text).length > 0;
}

/** Second table on the page: the same-origin destination comparison. */
function comparisonTable() {
  return screen.getAllByRole("table")[1];
}

describe("RateEstimator", () => {
  it("previews the default India to US West Coast 40ft lane", () => {
    renderAt();

    expect(screen.getByText("Nhava Sheva → Los Angeles")).toBeInTheDocument();
    expect(screen.getByText("35 days transit")).toBeInTheDocument();
    // Sheet reference: 40ft mid $3,500 base, $4,970 all-in.
    expect(shows("$3,500")).toBe(true);
    expect(shows("$4,970")).toBe(true);
    expect(screen.getByText(/\$0\.125\/lb/)).toBeInTheDocument();
  });

  it("re-prices when the user enters shipment weight and cargo value", () => {
    renderAt();

    fireEvent.change(screen.getByLabelText("Gross weight (kg)"), { target: { value: "20000" } });
    fireEvent.change(screen.getByLabelText("Cargo value (USD)"), { target: { value: "100000" } });

    // 0.4% of $100k = $400 insurance on top of the $4,970 all-in.
    expect(screen.getByText("Marine insurance")).toBeInTheDocument();
    expect(shows("$5,370")).toBe(true);
    // Heavier payload spreads the same freight over more pounds.
    expect(screen.getByText(/\$0\.122\/lb/)).toBeInTheDocument();
  });

  it("drops drayage from the breakdown when the toggle is turned off", () => {
    renderAt();

    expect(screen.getByText("Destination drayage")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Include destination drayage"));
    expect(screen.queryByText("Destination drayage")).not.toBeInTheDocument();
    expect(shows("$4,170")).toBe(true);
  });

  it("adds the peak-season surcharge for an Aug-Oct sail date", () => {
    renderAt("2026-03-01");
    expect(screen.queryByText("Peak season surcharge")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Sail date"), { target: { value: "2026-09-01" } });
    expect(screen.getByText("Peak season surcharge")).toBeInTheDocument();
    // 50% of the $3,500 base, so $4,970 + $1,750.
    expect(shows("$6,720")).toBe(true);
  });

  it("switches lane when a comparison row is clicked", () => {
    renderAt();

    fireEvent.click(within(comparisonTable()).getByText("GCC"));

    expect(screen.getByText("Nhava Sheva → Jebel Ali")).toBeInTheDocument();
    expect(screen.getByText("8 days transit")).toBeInTheDocument();
    expect(shows("$2,120")).toBe(true);
  });

  it("exposes each comparison destination as a keyboard-reachable button", () => {
    renderAt();

    const buttons = within(comparisonTable()).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      "US West Coast", "US East Coast", "Japan", "North Europe", "GCC", "Australia", "South Africa",
    ]);

    const japan = within(comparisonTable()).getByRole("button", { name: "Japan" });
    japan.focus();
    expect(japan).toHaveFocus();
    fireEvent.click(japan);

    expect(screen.getByText("Chennai → Tokyo")).toBeInTheDocument();
    expect(
      within(comparisonTable()).getByRole("button", { name: "Japan" }),
    ).toHaveAttribute("aria-current", "true");
  });

});
