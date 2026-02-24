# AI ERP System - AI Agent Instructions

This is the single source of truth for AI coding agent behavior in this project.
Referenced by: CLAUDE.md, .github/copilot-instructions.md, .cursorrules, .windsurfrules

---

## Project Overview

AI-native ERP system for a CPG (Consumer Packaged Goods) company. Manages finance, sales, operations, procurement, manufacturing, logistics, HR, legal, and AI-driven automation.

## Tech Stack

- **Language**: TypeScript (strict mode) — all code must be TypeScript, no plain JS
- **Frontend**: React 19, Vite 7, Tailwind CSS v4, Radix UI, React Hook Form, Wouter (routing), TanStack React Query
- **Backend**: Express, tRPC v11
- **Database**: MySQL via Drizzle ORM
- **Testing**: Vitest (server-side tests in `server/**/*.test.ts`)
- **Package Manager**: pnpm (do NOT use npm or yarn)
- **Module System**: ESM (`"type": "module"` in package.json)
- **Formatting**: Prettier

## Project Structure

```
client/              # React frontend
  src/
    components/      # Reusable UI components (shadcn/ui pattern)
    pages/           # Page components
    hooks/           # Custom React hooks
    contexts/        # React contexts
    lib/             # Utility functions
    _core/           # Core client infrastructure
server/              # Express + tRPC backend
  _core/             # Core services (email, LLM, auth, etc.)
  *.ts               # tRPC routers (one per domain)
shared/              # Shared types and utilities (imported by both client and server)
  types.ts           # Re-exports from drizzle schema
  _core/             # Shared core utilities
drizzle/             # Database schema and migrations
  schema.ts          # Drizzle ORM schema (single file)
```

## Path Aliases

- `@/*` → `./client/src/*`
- `@shared/*` → `./shared/*`

## Commands

| Command | Purpose |
|---|---|
| `pnpm run dev` | Start dev server (tsx watch) |
| `pnpm run build` | Build for production (vite + esbuild) |
| `pnpm run check` | TypeScript type checking (`tsc --noEmit`) |
| `pnpm run format` | Prettier formatting |
| `pnpm run test` | Run Vitest tests |
| `pnpm run db:push` | Generate and run Drizzle migrations |

## Coding Conventions

### General

- Write TypeScript with proper type annotations; avoid `any`
- Use ESM imports (`import`/`export`), never CommonJS (`require`)
- Prefer `const` over `let`; never use `var`
- Use template literals over string concatenation
- Keep functions small and focused
- No unused imports or variables

### Frontend

- Use functional React components with hooks (no class components)
- Use shadcn/ui component patterns (components in `client/src/components/ui/`)
- Style with Tailwind CSS utility classes — no separate CSS files
- Use `wouter` for routing (not react-router-dom despite it being in deps)
- Use tRPC hooks (`trpc.*.useQuery`, `trpc.*.useMutation`) for API calls
- Use `sonner` for toast notifications
- Use `lucide-react` for icons

### Backend

- Define tRPC routers in `server/` (one file per domain, e.g. `server/invoices.ts`)
- Use Zod for input validation on all tRPC procedures
- Use `protectedProcedure` for authenticated endpoints
- Use Drizzle ORM query builder — no raw SQL
- All database schema changes go in `drizzle/schema.ts`
- Core services (email, LLM, auth) live in `server/_core/`

### Testing

- Tests live alongside source files: `server/**/*.test.ts`
- Use Vitest (`describe`, `it`, `expect`)
- Run `pnpm run test` before committing to ensure nothing breaks
- Test files use `.test.ts` or `.spec.ts` extension

### Database

- ORM: Drizzle with MySQL dialect
- Schema: Single file at `drizzle/schema.ts`
- Use `drizzle-kit` for migrations
- Always add proper indexes for foreign keys and frequently queried columns

## Git Conventions

- Write clear, descriptive commit messages
- One logical change per commit
- Run `pnpm run check` before committing
- Branch naming: `feature/description`, `fix/description`, `chore/description`

## Environment Variables

- Stored in `.env` (never commit this file)
- Required: `DATABASE_URL`
- Optional: `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, Google OAuth credentials, Shopify credentials

## Important Notes

- This is a monorepo — frontend and backend share types via `shared/`
- The tRPC client is configured with superjson for serialization
- Authentication uses JWT via `jose` library
- LLM integration exists in `server/_core/llm.ts` — use this for any AI features
- Email sending uses SendGrid via `server/_core/email.ts`
