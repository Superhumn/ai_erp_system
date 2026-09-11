# client/src/pages/ — routes

219 files, ~114k lines. Three folders hold half of it: `operations/` (40), `superhumn/` (34), `freight/` (29).

## Where things go

| Folder | Holds |
|---|---|
| `<feature>/` (`finance/`, `hr/`, `operations/`, …) | Route-level pages for one sidebar section. |
| `*.tsx` at root | App-wide pages: `Home`, `Login`, `Settings`, `Projects`, `Messaging`, `Meetings`, `SOPs`, `Import`, `Code`, `DataRooms`, `InvestorPortal`. |
| `superhumn/` | Design-handoff gallery at `/superhumn`. Pixel-accurate frames with their own `theme.css` + `tokens.ts`. Standalone — renders outside `DashboardLayout`. Never import from it into product pages. |
| `portal/` | External-role landing pages (copacker, vendor, contractor). |
| `pm/` | Planner module with its own `_shared.tsx`. |

A page = one route. Reusable UI across pages → `client/src/components/`. Pure formatting/parsing → `client/src/lib/`.

## Adding a page

1. Create `pages/<feature>/Thing.tsx`, default export.
2. In `App.tsx`: `const Thing = lazy(() => import("./pages/<feature>/Thing"));` under the feature's comment block, then `<Route path="/thing" component={Thing} />` inside the `<Switch>`. Only `Home`, `Login`, `ResetPassword`, `RecoverAccount`, `NotFound` load eagerly.
3. Sidebar entry: **don't.** `getMenuGroups()` is frozen (root CLAUDE.md). Ask product first.

## Data

- `import { trpc } from "@/lib/trpc"` — typed against `AppRouter` from `server/routers/index.ts`.
- Reads: `trpc.<router>.<proc>.useQuery(input)`.
- Writes: `trpc.<router>.<proc>.useMutation({ onSuccess: () => utils.<router>.list.invalidate() })` with `const utils = trpc.useUtils()`.
- Offline-tolerant writes (orders, inventory): `useOfflineMutation` from `@/hooks/useOfflineMutation` with a dotted `path` like `"orders.update"`.
- Current user: `useAuth()` from `@/_core/hooks/useAuth`. Role gating belongs in `App.tsx` (`EXTERNAL_ROLE_HOME`) and server procedures, not `if (user.role === …)` sprinkled in pages (7 pages do this today — don't add more).

## UI

- Toasts: `import { toast } from "sonner"`.
- Icons: `lucide-react`.
- Primitives: `@/components/ui/*` (shadcn new-york). Shared patterns: `DetailSheet` (20 pages), `SpreadsheetTable` (11), `InlineEdit`.
- Money: use `@/lib/format` helpers; show currency code on multi-entity views.
- Links from user-typed URLs (`vendors.website`): pass through `safeHref` in `@/lib/utils` first.

## Tests

Client tests run in `jsdom` with `client/src/test/setup.ts` (jest-dom + fake-indexeddb). Page-level tests are rare; test logic by moving it to `lib/` and testing there (`lib/format.test.ts`, `lib/materialSupply.test.ts`).
