import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ErrorBoundary from "./ErrorBoundary";

function ProblemChild() {
  throw new Error("Test error");
}

function GoodChild() {
  return <div>All good</div>;
}

describe("ErrorBoundary", () => {
  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>
    );
    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("renders fallback UI when a child throws", () => {
    // Suppress console.error from React for the intentional throw
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    );

    expect(
      screen.getByText("An unexpected error occurred.")
    ).toBeInTheDocument();
    expect(screen.getByText("Reload Page")).toBeInTheDocument();

    spy.mockRestore();
  });

  it("displays the error stack in the fallback", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    );

    // The error stack should contain our test error message
    expect(screen.getByText(/Test error/)).toBeInTheDocument();

    spy.mockRestore();
  });
});
