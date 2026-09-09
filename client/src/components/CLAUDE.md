# client/src/components/ — shared UI

## Layout

| Path | Holds |
|---|---|
| `ui/` | 54 shadcn primitives (new-york style, `components.json`). Regenerate with the shadcn CLI; hand-edits get overwritten. |
| `opsToolkit/` | Stackby-style views: `DataViews`, `FormBuilder`, `FormRenderer`, `AutomationBuilder`, `PivotTable`. Types in `shared/opsToolkit.ts`. |
| `planner/` | `QuickAddBar` (NL quick-add). Types in `shared/planner.ts`. |
| root `*.tsx` | App chrome + cross-feature widgets: `DashboardLayout`, `AIChatBox`, `AICommandBar`, `FloatingAIAssistant`, `NotificationCenter`, `DetailSheet`, `SpreadsheetTable`, `InlineEdit`, `QuickCreateDialog`, error boundaries. |

A component lives here only if two or more pages use it. One-page components stay next to their page.

## DashboardLayout.tsx — frozen

`getMenuGroups()` is the sidebar contract. `DashboardLayout.test.ts` (26 tests) asserts section order, role visibility, and a banned-label list. **Any change fails CI.** Canonical structure and banned labels: root `CLAUDE.md` → "Sidebar Navigation (LOCKED)". Hiding a nav item is not access control — `App.tsx` `EXTERNAL_ROLE_HOME` and server procedures enforce it.

## Conventions

- Styling: Tailwind v4 utilities + `cn()` from `@/lib/utils`. No CSS modules, no inline `style=` except for computed values.
- Composition over props: wrap a `ui/` primitive, don't fork it.
- Dialogs/sheets: `ui/dialog`, `ui/sheet`, `ui/drawer`. Detail panes → `DetailSheet`.
- Tables with editing → `SpreadsheetTable` + `InlineEdit`.
- Toasts via `sonner` (`ui/sonner` mounts the `<Toaster>` once in `App.tsx`).
- Error isolation: pages sit inside `ModuleErrorBoundary`; app root inside `ErrorBoundary`. New top-level surfaces need one of these.
- Theme: `contexts/ThemeContext`. Use CSS variables from `index.css`, never hard-coded hex.

## Tests

`*.test.tsx` beside the component, jsdom + Testing Library (`ErrorBoundary.test.tsx`, `DetailSheet.test.tsx`). Add one when a component has branching logic (empty state, error state, role variants).
