# shared/ — client + server contracts

Imported by both `client/` (as `@shared/*`) and `server/`. Everything here must run in a browser: no Node builtins, no Drizzle, no `process.env`, no server imports.

## What qualifies

- A type that describes a tRPC response the client renders (`materialSupply.ts`, `aiChat.ts`).
- A JSON-column shape stored in MySQL and edited in the UI (`opsToolkit.ts`, `planner.ts`, `notes.ts`).
- A catalogue both sides validate against (`importFields.ts` — keys must match Drizzle column names).
- Constants both sides need (`const.ts`: cookie name, error strings).
- Reference data the UI displays and the server prices from (`oceanFreightRates.ts`).

Server-only types stay in `server/`. Client-only types stay in `client/src/types.d.ts`.

## Rules

- Strict-clean: all of `shared/` is in `tsconfig.strict.json`. `pnpm check:strict` must pass with zero errors.
- Re-export new cross-boundary types from `types.ts` so imports stay `@shared/types`.
- One file per domain. Header comment states which server module and which client surface consume it (see `aiChat.ts`, `materialSupply.ts`).
- Changing a shape here changes a stored JSON column or a wire contract. Search both trees before renaming a field.
