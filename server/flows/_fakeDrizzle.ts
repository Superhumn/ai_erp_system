/**
 * A small Drizzle-shaped query engine over in-memory tables, for flow tests
 * that drive code talking to Drizzle directly (the AI agent scheduler, the
 * db.ts helpers themselves). Every `where` clause is evaluated against the
 * rows (eq / and / or / inArray / like / isNull / raw CAST comparisons,
 * joins), so the checks stay honest instead of canned.
 *
 * Usage (inside vi.hoisted so a vi.mock factory can reach it):
 *   const { store, fakeDb } = await vi.hoisted(async () => (await import("./_fakeDrizzle")).createFakeDrizzle());
 *   vi.mock("../db", () => ({ getDb: vi.fn(async () => fakeDb), ... }));
 */
import { SQL, StringChunk, Param, Column, Table, getTableName, getTableColumns } from "drizzle-orm";
import { table } from "./_harness";

export type Row = { id: number } & Record<string, any>;
type Ctx = Record<string, Row | null>;

export function createFakeDrizzle() {
  type Tok = { k: "s"; v: string } | { k: "c"; col: any } | { k: "p"; v: unknown } | { k: "q"; sql: any } | { k: "a"; items: unknown[] };

  const tables = new Map<string, ReturnType<typeof table<Row>>>();
  const T = (name: string) => { let t = tables.get(name); if (!t) { t = table<Row>(); tables.set(name, t); } return t; };
  const store = {
    rows: (tbl: object) => T(getTableName(tbl as any)),
  };

  const keyCache = new Map<object, Map<unknown, string>>();
  function colKey(col: any): { tableName: string; key: string } {
    const t = col.table;
    let m = keyCache.get(t);
    if (!m) { m = new Map(); for (const [k, c] of Object.entries(getTableColumns(t))) m.set(c, k); keyCache.set(t, m); }
    return { tableName: getTableName(t), key: m.get(col)! };
  }
  const colVal = (col: any, ctx: Ctx) => { const { tableName, key } = colKey(col); const row = ctx[tableName]; return row ? row[key] : null; };

  function toks(node: any): Tok[] {
    const out: Tok[] = [];
    for (const ch of node.queryChunks) {
      if (ch instanceof StringChunk) { const v = ch.value.join("").trim().toLowerCase(); if (v) out.push({ k: "s", v }); }
      else if (ch instanceof Column) out.push({ k: "c", col: ch });
      else if (ch instanceof Param) out.push({ k: "p", v: ch.value });
      // A value interpolated into a sql`` template is stored bare (only eq() & co wrap in Param).
      else if (typeof ch === "string" || typeof ch === "number" || typeof ch === "boolean" || ch instanceof Date) out.push({ k: "p", v: ch });
      else if (ch instanceof SQL) out.push({ k: "q", sql: ch });
      else if (Array.isArray(ch)) out.push({ k: "a", items: ch });
      else throw new Error(`fake drizzle: unsupported chunk ${ch?.constructor?.name}`);
    }
    return out;
  }
  const unwrap = (v: unknown) => (v instanceof Param ? v.value : v);
  const looseEq = (a: unknown, b: unknown) => (a == null || b == null ? a == null && b == null : String(a) === String(b));
  const likeMatch = (v: unknown, pattern: unknown) =>
    new RegExp("^" + String(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, "[\\s\\S]*").replace(/_/g, ".") + "$", "i").test(String(v ?? ""));

  function evalNode(node: any, ctx: Ctx): boolean {
    if (node == null) return true;
    const t = toks(node);
    const shape = t.map((x) => (x.k === "s" ? x.v : x.k.toUpperCase())).join(" ");
    const val = (tok: Tok): unknown => (tok.k === "c" ? colVal(tok.col, ctx) : tok.k === "p" ? tok.v : undefined);
    if (t.length === 1 && t[0].k === "q") return evalNode(t[0].sql, ctx);
    if (t.length === 3 && t[0].k === "s" && t[0].v === "(" && t[1].k === "q" && t[2].k === "s" && t[2].v === ")") return evalNode(t[1].sql, ctx);
    if (t.length === 2 && t[0].k === "s" && t[0].v === "not" && t[1].k === "q") return !evalNode(t[1].sql, ctx);
    if (t.length >= 3 && t.every((x, i) => (i % 2 === 0 ? x.k === "q" : x.k === "s" && (x.v === "and" || x.v === "or")))) {
      const op = (t[1] as { v: string }).v;
      const vals = t.filter((_, i) => i % 2 === 0).map((x) => evalNode((x as { sql: any }).sql, ctx));
      return op === "and" ? vals.every(Boolean) : vals.some(Boolean);
    }
    if (t.length === 3 && t[1].k === "s") {
      const l = val(t[0]); const r = t[2];
      switch (t[1].v) {
        case "=": return looseEq(l, val(r));
        case "<>": case "!=": return !looseEq(l, val(r));
        case ">": return Number(l) > Number(val(r));
        case ">=": return Number(l) >= Number(val(r));
        case "<": return Number(l) < Number(val(r));
        case "<=": return Number(l) <= Number(val(r));
        case "like": return likeMatch(l, val(r));
        case "in": {
          const items = r.k === "a" ? r.items : r.k === "q" ? r.sql.queryChunks.flat(Infinity).filter((c: unknown) => c instanceof Param) : [val(r)];
          return items.some((v: unknown) => looseEq(l, unwrap(v)));
        }
      }
    }
    if (t.length === 2 && t[0].k === "c" && t[1].k === "s") {
      if (t[1].v === "is null") return colVal(t[0].col, ctx) == null;
      if (t[1].v === "is not null") return colVal(t[0].col, ctx) != null;
    }
    const cast = shape.match(/^cast\( C as decimal\) (<|<=|>|>=) (\d+(?:\.\d+)?)$/);
    if (cast && t[1].k === "c") {
      const l = Number(colVal(t[1].col, ctx) ?? 0); const n = Number(cast[2]);
      return cast[1] === "<" ? l < n : cast[1] === "<=" ? l <= n : cast[1] === ">" ? l > n : l >= n;
    }
    throw new Error(`fake drizzle: unsupported where shape "${shape}"`);
  }

  function orderTerm(term: any): { col: any; desc: boolean } {
    if (term instanceof Column) return { col: term, desc: false };
    const t = toks(term);
    if (t.length === 2 && t[0].k === "c" && t[1].k === "s") return { col: t[0].col, desc: t[1].v === "desc" };
    throw new Error("fake drizzle: unsupported orderBy term");
  }
  const cmp = (a: unknown, b: unknown) => {
    if (a == null && b == null) return 0; if (a == null) return 1; if (b == null) return -1;
    if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b));
  };
  const thenable = <V,>(run: () => V) => ({ then: (res: any, rej: any) => Promise.resolve().then(run).then(res, rej) });

  const fakeDb: any = {
    select(fields?: Record<string, any>) {
      const st = { from: "", joins: [] as Array<{ name: string; on: any; inner: boolean }>, where: undefined as any, order: [] as any[], limit: undefined as number | undefined, offset: 0 };
      const run = () => {
        let rows: Ctx[] = T(st.from).all().map((r) => ({ [st.from]: r }));
        for (const j of st.joins) {
          const next: Ctx[] = [];
          for (const r of rows) {
            const matches = T(j.name).all().filter((jr) => evalNode(j.on, { ...r, [j.name]: jr }));
            if (matches.length) for (const m of matches) next.push({ ...r, [j.name]: m });
            else if (!j.inner) next.push({ ...r, [j.name]: null });
          }
          rows = next;
        }
        rows = rows.filter((r) => evalNode(st.where, r));
        if (st.order.length) {
          const terms = st.order.map(orderTerm);
          rows.sort((a, b) => {
            for (const { col, desc } of terms) { const c = cmp(colVal(col, a), colVal(col, b)); if (c !== 0) return desc ? -c : c; }
            const c = (a[st.from]?.id ?? 0) - (b[st.from]?.id ?? 0);
            return terms[0].desc ? -c : c;
          });
        }
        rows = rows.slice(st.offset, st.limit != null ? st.offset + st.limit : undefined);
        if (!fields) return rows.map((r) => r[st.from]);
        const entries = Object.entries(fields);
        if (entries.some(([, v]) => v instanceof SQL && toks(v).some((x) => x.k === "s" && x.v.startsWith("count(")))) {
          return [Object.fromEntries(entries.map(([k]) => [k, rows.length]))];
        }
        return rows.map((r) => Object.fromEntries(entries.map(([k, v]) => {
          if (v instanceof Column) return [k, colVal(v, r)];
          if (v instanceof Table) return [k, r[getTableName(v)]];
          throw new Error(`fake drizzle: unsupported select field ${k}`);
        })));
      };
      const chain: any = {
        from(tbl: any) { st.from = getTableName(tbl); return chain; },
        innerJoin(tbl: any, on: any) { st.joins.push({ name: getTableName(tbl), on, inner: true }); return chain; },
        leftJoin(tbl: any, on: any) { st.joins.push({ name: getTableName(tbl), on, inner: false }); return chain; },
        where(c: any) { st.where = c; return chain; },
        orderBy(...o: any[]) { st.order = o; return chain; },
        limit(n: number) { st.limit = n; return chain; },
        offset(n: number) { st.offset = n; return chain; },
        groupBy() { return chain; },
        for() { return chain; },
        ...thenable(run),
      };
      return chain;
    },
    insert(tbl: any) {
      const name = getTableName(tbl);
      return {
        values(v: Row | Row[]) {
          const ids = (Array.isArray(v) ? v : [v]).map((row) => T(name).insert(row).id);
          const r: any = {
            $returningId: async () => ids.map((id) => ({ id })),
            onDuplicateKeyUpdate: () => r,
            ...thenable(() => [{ insertId: ids[0], affectedRows: ids.length }]),
          };
          return r;
        },
      };
    },
    update(tbl: any) {
      const name = getTableName(tbl);
      return {
        set(patch: Record<string, unknown>) {
          const apply = (cond: any) => {
            for (const row of T(name).all()) {
              if (!evalNode(cond, { [name]: row })) continue;
              const next: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(patch)) {
                if (v instanceof SQL) {
                  // `col + N` (sql`${col} + 1`) and the receivedQuantity increment
                  // `CAST(COALESCE(col, '0') + ? AS CHAR)`; anything else is unsupported.
                  const t = toks(v);
                  const col = t.find((x) => x.k === "c");
                  const param = t.find((x) => x.k === "p");
                  const lit = t.map((x) => (x.k === "s" ? x.v.match(/\+ (\d+(?:\.\d+)?)$/)?.[1] : undefined)).find(Boolean);
                  const plus = t.some((x) => x.k === "s" && x.v.includes("+"));
                  const addend = param && param.k === "p" ? Number(param.v) : lit !== undefined ? Number(lit) : NaN;
                  if (!col || !plus || Number.isNaN(addend)) throw new Error("fake drizzle: unsupported SQL in set()");
                  const sum = Number(row[colKey(col.col).key] ?? 0) + addend;
                  next[k] = t[0].k === "s" && t[0].v.startsWith("cast(") ? String(sum) : sum;
                } else next[k] = v;
              }
              T(name).update(row.id, next);
            }
          };
          return { where: (c: any) => thenable(() => { apply(c); return [{ affectedRows: 1 }]; }), ...thenable(() => { apply(undefined); return [{ affectedRows: 1 }]; }) };
        },
      };
    },
    delete(tbl: any) {
      const name = getTableName(tbl);
      return {
        where: (c: any) => thenable(() => {
          const victims = T(name).all().filter((row) => evalNode(c, { [name]: row }));
          for (const v of victims) T(name).remove(v.id);
          return [{ affectedRows: victims.length }];
        }),
      };
    },
    transaction: async (fn: (tx: any) => Promise<unknown>) => fn(fakeDb),
  };

  return { store, fakeDb };
}
