/**
 * Shared harness for end-to-end process ("flow") tests.
 *
 * A flow test walks one business process through the real tRPC routers
 * (appRouter.createCaller) step by step. The database module is replaced with
 * a stateful in-memory store built per test file, so the orchestration,
 * permission checks, status transitions and cross-module handoffs run for
 * real while SQL never does. Each test file declares its own vi.mock("../db")
 * factory using `createStore()` from here.
 */
import { vi } from "vitest";
import type { TrpcContext } from "../_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;
export type Role = AuthenticatedUser["role"];

/** Build a tRPC context for a user of the given role. */
export function ctxFor(role: Role, overrides: Partial<AuthenticatedUser> = {}): TrpcContext {
  return {
    user: {
      id: 1,
      openId: `user-${role}`,
      email: `${role}@example.com`,
      name: `${role} user`,
      loginMethod: "manus",
      role,
      companyId: 1,
      regionScope: "global",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      lastSignedIn: new Date("2026-01-01"),
      ...overrides,
    } as AuthenticatedUser,
    req: { protocol: "https", headers: {}, ip: "127.0.0.1" } as unknown as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

export interface Table<T extends { id: number }> {
  rows: T[];
  insert(row: Omit<T, "id"> & Partial<Pick<T, "id">>): T;
  get(id: number): T | undefined;
  all(): T[];
  find(pred: (row: T) => boolean): T | undefined;
  filter(pred: (row: T) => boolean): T[];
  update(id: number, patch: Partial<T>): T | undefined;
  remove(id: number): boolean;
  clear(): void;
}

/** Auto-increment in-memory table. */
export function table<T extends { id: number }>(seed: Array<Omit<T, "id"> & Partial<Pick<T, "id">>> = []): Table<T> {
  let nextId = 1;
  const rows: T[] = [];
  const t: Table<T> = {
    rows,
    insert(row) {
      const id = row.id ?? nextId;
      nextId = Math.max(nextId, id + 1);
      const now = new Date();
      const full = { createdAt: now, updatedAt: now, ...row, id } as unknown as T;
      rows.push(full);
      return full;
    },
    get: (id) => rows.find((r) => r.id === id),
    all: () => rows.slice(),
    find: (pred) => rows.find(pred),
    filter: (pred) => rows.filter(pred),
    update(id, patch) {
      const row = rows.find((r) => r.id === id);
      if (!row) return undefined;
      Object.assign(row, patch, { updatedAt: new Date() });
      return row;
    },
    remove(id) {
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) return false;
      rows.splice(i, 1);
      return true;
    },
    clear() {
      rows.length = 0;
      nextId = 1;
    },
  };
  for (const s of seed) t.insert(s);
  return t;
}

/** Drizzle-style insert result the db helpers return: `[{ insertId }]`. */
export function insertResult(id: number) {
  return [{ insertId: id, affectedRows: 1 }] as const;
}

/** Numeric decimal columns come back from MySQL as strings; mirror that. */
export const money = (n: number | string) => Number(n).toFixed(2);
export const qty = (n: number | string) => Number(n).toFixed(4);
