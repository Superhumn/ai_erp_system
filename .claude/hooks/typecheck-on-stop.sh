#!/usr/bin/env bash
# Stop: one `pnpm check` per turn, only when TypeScript files are dirty.
# Exit 2 feeds the tsc output back to Claude so the turn ends with a fix, not a red PR.
set -u
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$root" || exit 0
changed="$(git status --porcelain -- '*.ts' '*.tsx' 2>/dev/null)"
[ -z "$changed" ] && exit 0
[ -d node_modules ] || exit 0
out="$(pnpm -s check 2>&1)"
status=$?
[ $status -eq 0 ] && exit 0
printf '%s\n' "pnpm check failed on the files you edited this turn:" "$out" | tail -n 60 >&2
exit 2
