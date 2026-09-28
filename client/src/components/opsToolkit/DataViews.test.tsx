// @ts-nocheck
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CalendarView } from "./DataViews";

describe("CalendarView", () => {
  afterEach(cleanup);

  const rows = [
    { id: 1, name: "Ship to Tokyo", due: "2026-09-10T12:00:00Z" },
    { id: 2, name: "Ship to Oslo", due: "2026-09-10T15:00:00Z" },
  ];

  it("asks for a date field when none is configured", () => {
    render(<CalendarView rows={rows} config={{}} titleField="name" />);
    expect(screen.getByText(/Pick a .Date. field/)).toBeInTheDocument();
  });

  it("does not crash with a hook-order error when a date field is chosen after mounting without one", () => {
    // Before the fix, useMemo ran after an early `return`, so the second render
    // had more hooks than the first and React threw "Rendered more hooks...".
    const { rerender } = render(
      <CalendarView rows={rows} config={{}} titleField="name" />,
    );
    expect(() =>
      rerender(<CalendarView rows={rows} config={{ dateField: "due" }} titleField="name" />),
    ).not.toThrow();
    expect(screen.queryByText(/Pick a .Date. field/)).not.toBeInTheDocument();
    // Weekday header proves the month grid rendered.
    expect(screen.getByText("Sun")).toBeInTheDocument();
  });
});
