#!/usr/bin/env bash
# PostToolUse (Edit|Write): regenerate DB_INDEX.md when server/db.ts or an
# extracted server/db/*.ts file changed. CI fails on a stale index
# (`pnpm index:legacy:check`), so do it at edit time instead.
set -u
input="$(cat)"
file="$(printf '%s' "$input" | node -e '
  let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
    try { const j=JSON.parse(s); process.stdout.write(j.tool_input?.file_path ?? j.tool_response?.filePath ?? ""); }
    catch { process.stdout.write(""); }
  });')"
[ -z "$file" ] && exit 0
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
rel="${file#"$root"/}"
case "$rel" in
  server/db.ts|server/db/*.ts) ;;
  *) exit 0 ;;
esac
[ -d "$root/node_modules" ] || { echo "[hook] node_modules missing — run pnpm install, then pnpm index:legacy" >&2; exit 0; }
cd "$root" && pnpm -s index:legacy >/dev/null 2>&1 \
  && echo "[hook] DB_INDEX.md regenerated" \
  || { echo "[hook] pnpm index:legacy failed — run it manually before committing" >&2; exit 2; }
