// Dumps every wired tRPC procedure path from the live appRouter.
import { appRouter } from "../server/routers";

function walk(router, prefix = "") {
  const out = [];
  const def = router._def;
  if (!def) return out;
  const procs = def.procedures || def.record || {};
  for (const [key, val] of Object.entries(procs)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val && val._def && (val._def.procedures || val._def.record)) {
      out.push(...walk(val, path));
    } else if (val && val._def) {
      const t = val._def.type || (val._def.mutation ? "mutation" : val._def.query ? "query" : val._def.subscription ? "subscription" : "unknown");
      out.push(`${path}\t${t}`);
    }
  }
  return out;
}

const paths = walk(appRouter);
paths.sort();
for (const p of paths) console.log(p);
console.error(`\n[dump] ${paths.length} procedures`);
