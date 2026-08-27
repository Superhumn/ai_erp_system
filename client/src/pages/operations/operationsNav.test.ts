/**
 * Operations IA guard.
 *
 * Operations has one frozen sidebar entry for ~30 pages, so `operationsNav.ts`
 * is the only thing making those pages reachable. Before it existed, 11 of the
 * 33 Operations routes were not linked from anywhere in the app — you could
 * only reach them by typing the URL. These tests exist so that cannot happen
 * again: every routed page must appear in the nav, and every nav entry must
 * resolve to a real route.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  OPERATIONS_ROOT,
  OPERATIONS_SECTIONS,
  OPERATIONS_SHELL_EXCLUDED,
  allOperationsItems,
  sectionForPath,
  visibleOperationsSections,
} from "./operationsNav";

const here = join(process.cwd(), "client/src/pages/operations");

function routedPaths(file: string): string[] {
  const source = readFileSync(join(here, file), "utf8");
  return [
    ...source.matchAll(/<Route\s+path="(\/operations[^"]*)"/g),
  ].map((match) => match[1]);
}

/** Routes that intentionally have no nav entry of their own. */
const NOT_IN_NAV = new Set([
  OPERATIONS_ROOT, // the overview — it *is* the nav
  "/operations/procurement", // legacy alias, redirects to the procurement hub
  "/operations/profitability", // legacy alias, redirects into Finance
]);

const isDetailRoute = (path: string) => path.includes("/:");

describe("Operations information architecture", () => {
  const items = allOperationsItems();
  const navPaths = items.map((item) => item.path);

  it("lands each section tab on one of its own pages", () => {
    for (const section of OPERATIONS_SECTIONS) {
      const paths = section.items.map((item) => item.path);
      expect(paths, `section "${section.label}"`).toContain(section.path);
    }
  });

  it("lists every page exactly once", () => {
    const duplicates = navPaths.filter(
      (path, index) => navPaths.indexOf(path) !== index,
    );
    expect(duplicates).toEqual([]);
  });

  it("keeps every page under /operations/", () => {
    for (const path of navPaths) {
      expect(path.startsWith("/operations/")).toBe(true);
    }
  });

  it("gives every page a label and a description", () => {
    for (const item of items) {
      expect(item.label.length, item.path).toBeGreaterThan(0);
      expect(item.desc.length, item.path).toBeGreaterThan(0);
    }
  });
});

describe("Operations routing", () => {
  const routed = routedPaths("OperationsSection.tsx");
  const navPaths = new Set(allOperationsItems().map((item) => item.path));

  it("routes every page the nav offers", () => {
    const routedSet = new Set(routed);
    const missing = [...navPaths].filter((path) => !routedSet.has(path));
    expect(missing, "nav entries with no route").toEqual([]);
  });

  it("leaves no routed page unreachable from the nav", () => {
    const orphans = routed.filter(
      (path) =>
        !navPaths.has(path) && !NOT_IN_NAV.has(path) && !isDetailRoute(path),
    );
    expect(orphans, "routes not linked from the nav").toEqual([]);
  });

  it("declares detail routes before the list route they would shadow", () => {
    for (const [index, path] of routed.entries()) {
      if (!isDetailRoute(path)) continue;
      const parent = path.slice(0, path.indexOf("/:"));
      const parentIndex = routed.indexOf(parent);
      if (parentIndex === -1) continue;
      expect(
        index,
        `${path} must be declared before ${parent} or wouter will never match it`,
      ).toBeLessThan(parentIndex);
    }
  });

  it("matches the overview last so it cannot swallow a sub-page", () => {
    expect(routed[routed.length - 1]).toBe(OPERATIONS_ROOT);
  });
});

describe("Pages excluded from the Operations shell", () => {
  it("keeps sidebar-level destinations out of the Operations nav", () => {
    // Email Inbox and Logistics are their own top-level sidebar entries. An
    // Operations tab bar above them would misrepresent where the user is.
    const navPaths = new Set(allOperationsItems().map((item) => item.path));
    for (const path of OPERATIONS_SHELL_EXCLUDED) {
      expect(navPaths.has(path), `${path} must not be an Operations page`).toBe(
        false,
      );
    }
  });

  it("does not route them inside the shell", () => {
    const routed = new Set(routedPaths("OperationsSection.tsx"));
    for (const path of OPERATIONS_SHELL_EXCLUDED) {
      expect(routed.has(path), `${path} must be routed outside the shell`).toBe(
        false,
      );
    }
  });

  it("still routes them in App.tsx, ahead of the Operations catch-all", () => {
    const source = readFileSync(
      join(process.cwd(), "client/src/App.tsx"),
      "utf8",
    );
    const catchAll = source.indexOf('path="/operations/*"');
    expect(catchAll).toBeGreaterThan(-1);
    for (const path of OPERATIONS_SHELL_EXCLUDED) {
      const at = source.indexOf(`path="${path}"`);
      expect(at, `${path} must still be routed`).toBeGreaterThan(-1);
      expect(at, `${path} must be matched before the catch-all`).toBeLessThan(
        catchAll,
      );
    }
  });
});

describe("sectionForPath", () => {
  it("resolves each page to the section that owns it", () => {
    for (const section of OPERATIONS_SECTIONS) {
      for (const item of section.items) {
        expect(sectionForPath(item.path)?.id, item.path).toBe(section.id);
      }
    }
  });

  it("keeps a detail page in its parent's section", () => {
    expect(sectionForPath("/operations/work-orders/42")?.id).toBe(
      "manufacturing",
    );
    expect(sectionForPath("/operations/products/7")?.id).toBe("inventory");
  });

  it("claims no section for the overview", () => {
    expect(sectionForPath(OPERATIONS_ROOT)).toBeUndefined();
  });
});

describe("role gating", () => {
  it("hides Recipes from roles other than admin and ops", () => {
    // Trade secrets — this mirrors the sidebar's own gate, which excludes exec.
    const recipesVisibleTo = (role: string | undefined) =>
      visibleOperationsSections(role)
        .flatMap((section) => section.items)
        .some((item) => item.path === "/operations/recipes");

    expect(recipesVisibleTo("admin")).toBe(true);
    expect(recipesVisibleTo("ops")).toBe(true);
    expect(recipesVisibleTo("exec")).toBe(false);
    expect(recipesVisibleTo(undefined)).toBe(false);
  });

  it("leaves ungated pages visible to every role", () => {
    const forExec = visibleOperationsSections("exec").flatMap((s) => s.items);
    const ungated = allOperationsItems().filter((item) => !item.roles);
    expect(forExec.length).toBe(ungated.length);
  });
});
