/**
 * Verifies the two routing assumptions the Operations shell depends on:
 *
 *  1. `/operations/:rest*` in App.tsx catches every sub-page, and the bare
 *     `/operations` route behind it still gets the overview.
 *  2. An inner <Switch> using absolute paths resolves correctly when mounted
 *     underneath that catch-all — i.e. we are not nesting, so the inner routes
 *     match against the full location.
 *
 * These are cheap to get wrong and expensive to notice, because getting them
 * wrong renders a blank page rather than throwing.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { Route, Router, Switch, useParams } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, describe, expect, it } from "vitest";

// This suite has no `globals: true`, so Testing Library's automatic cleanup is
// not installed. Without this each render stacks in the same document and the
// "is X absent?" assertions below match a leftover from an earlier test.
afterEach(cleanup);

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav>tabs</nav>
      {children}
    </div>
  );
}

function ProductDetailStub() {
  const params = useParams<{ id: string }>();
  return <div>product-detail:{params.id}</div>;
}

/** Mirrors the real structure: App.tsx catch-all → shell → inner Switch. */
function OperationsSectionUnderTest() {
  return (
    <Shell>
      <Switch>
        <Route path="/operations/products/:id" component={ProductDetailStub} />
        <Route path="/operations/products">products-list</Route>
        <Route path="/operations/inventory-hub">inventory-hub</Route>
        <Route path="/operations">overview</Route>
      </Switch>
    </Shell>
  );
}

function AppUnderTest({ path }: { path: string }) {
  const { hook } = memoryLocation({ path, static: true });
  return (
    <Router hook={hook}>
      <Switch>
        <Route path="/operations/email-inbox">email-inbox</Route>
        <Route path="/operations/logistics-hub">logistics-hub</Route>
        <Route path="/operations/*" component={OperationsSectionUnderTest} />
        <Route path="/operations" component={OperationsSectionUnderTest} />
        <Route>no-match</Route>
      </Switch>
    </Router>
  );
}

describe("Operations routing", () => {
  it("renders the overview at /operations, inside the shell", () => {
    render(<AppUnderTest path="/operations" />);
    expect(screen.getByText("overview")).toBeTruthy();
    expect(screen.getByText("tabs")).toBeTruthy();
  });

  it("resolves an inner absolute path under the catch-all", () => {
    render(<AppUnderTest path="/operations/inventory-hub" />);
    expect(screen.getByText("inventory-hub")).toBeTruthy();
    expect(screen.getByText("tabs")).toBeTruthy();
  });

  it("prefers a detail route over the list route that would shadow it", () => {
    render(<AppUnderTest path="/operations/products/7" />);
    expect(screen.getByText("product-detail:7")).toBeTruthy();
  });

  it("does not let the overview swallow a sub-page", () => {
    render(<AppUnderTest path="/operations/products" />);
    expect(screen.getByText("products-list")).toBeTruthy();
    expect(screen.queryByText("overview")).toBeNull();
  });

  it("keeps sidebar-level pages outside the shell", () => {
    render(<AppUnderTest path="/operations/email-inbox" />);
    expect(screen.getByText("email-inbox")).toBeTruthy();
    // No Operations tab bar above a page that is its own sidebar destination.
    expect(screen.queryByText("tabs")).toBeNull();
  });

  it("keeps Logistics outside the shell", () => {
    render(<AppUnderTest path="/operations/logistics-hub" />);
    expect(screen.getByText("logistics-hub")).toBeTruthy();
    expect(screen.queryByText("tabs")).toBeNull();
  });
});
