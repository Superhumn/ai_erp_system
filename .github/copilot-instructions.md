# Copilot Instructions for AI ERP System

## Project Overview

This is a full-stack, AI-powered Enterprise Resource Planning (ERP) system for CPG (Consumer Packaged Goods) companies, manufacturers, and brands managing complex supply chains. It is built with React (frontend), Express + tRPC (backend), MySQL + Drizzle ORM (database), and Anthropic Claude (AI).

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, Radix UI, TanStack Query v5, Wouter |
| Backend | Node.js, Express, tRPC v11, TypeScript |
| Database | MySQL 8.0, Drizzle ORM, Drizzle Kit for migrations |
| AI/LLM | Anthropic Claude (default), OpenAI compatible |
| Package Manager | pnpm 10.x (required) |
| Testing | Vitest |

## Repository Structure

```
client/          # React frontend (pages, components, hooks)
server/          # Express backend
  _core/         # Core utilities: auth, LLM, email, OAuth, integrations
  agent/         # AI agent system (loop, tools, prompts, memory)
  routers.ts     # Main tRPC router (~14k lines, all API endpoints)
  db.ts          # Database query builder (~9k lines)
  aiAgentService.ts
  autonomousWorkflowEngine.ts
shared/          # Shared TypeScript types
drizzle/         # Drizzle schema (schema.ts) and SQL migration files
```

## Key Conventions

### TypeScript
- All code is TypeScript with strict mode enabled.
- Use proper type annotations; avoid `any`.
- Run `pnpm run check` (tsc --noEmit) to verify types before committing.

### API Layer (tRPC)
- All API endpoints are defined in `server/routers.ts` using tRPC v11 procedures.
- Use `protectedProcedure` for authenticated routes, `publicProcedure` for unauthenticated.
- Input validation uses Zod schemas inline in each procedure.
- The tRPC context (user, companyId, db connection) is created in `server/_core/context.ts`.

### Database (Drizzle ORM)
- Schema is defined in `drizzle/schema.ts`. After schema changes, run `pnpm run db:push` to generate and apply migrations.
- Database queries are written in `server/db.ts` using Drizzle query builders.
- `audit_logs.action` is a MySQL enum limited to: `create`, `update`, `delete`, `view`, `export`, `approve`, `reject`. Do not use other action strings.
- Never use raw SQL strings unless absolutely necessary; prefer Drizzle's type-safe query builder.

### LLM / AI
- All LLM access goes through `server/_core/llm.ts` — use `invokeLLM()` or `invokeAnthropic()`.
- LLM configuration comes from environment variables: `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL` (see `server/_core/env.ts`).
- Do **not** access `ANTHROPIC_API_KEY` directly or instantiate the Anthropic SDK outside of `llm.ts`.

### Environment Variables
- All env vars are validated and typed in `server/_core/env.ts`. Add new env vars there before using them.
- Copy `.env.example` to `.env` for local development; never commit real secrets.

### Frontend
- Pages live in `client/src/pages/` organized by feature module (sales, operations, finance, crm, freight, etc.).
- UI components use Radix UI primitives styled with Tailwind CSS.
- API calls use the tRPC client via TanStack Query hooks (`useQuery`, `useMutation`).
- Toast notifications use Sonner via the `useToast` hook: `const { toast } = useToast()` → `toast.success(...)` / `toast.error(...)`.
- Routing uses Wouter (not React Router).

### Code Formatting
- Use Prettier for formatting: `pnpm run format`.
- Follow existing file and naming conventions in each directory.

## Development Workflow

```bash
pnpm install          # Install dependencies
pnpm run dev          # Start dev server (tsx watch)
pnpm run check        # TypeScript type checking
pnpm run test         # Run Vitest test suite
pnpm run format       # Format code with Prettier
pnpm run build        # Build for production (Vite + esbuild)
pnpm run db:push      # Generate and apply DB migrations
```

## Testing

- Tests use Vitest and are located in `server/**/*.test.ts` and `server/**/*.spec.ts`.
- Tests cover server-side logic (AI agent, workflows, parsers, integrations, etc.).
- When adding new server features, add corresponding tests in `server/` following existing patterns.
- Run `pnpm run test` to execute all tests; run a specific file with `pnpm run test -- server/myFeature.test.ts`.

## Adding New Features

1. **Database changes**: Update `drizzle/schema.ts`, then run `pnpm run db:push`.
2. **New API endpoint**: Add a tRPC procedure in `server/routers.ts` using the appropriate procedure type and Zod validation.
3. **New DB query helper**: Add to `server/db.ts` following existing patterns.
4. **New page**: Create under the relevant `client/src/pages/<module>/` directory and register the route.
5. **New integration**: Create a new file in `server/_core/` and expose it via `routers.ts`.

## User Roles

There are 9 roles in the system: `user`, `admin`, `finance`, `ops`, `legal`, `exec`, `copacker`, `vendor`, `contractor`. Role-based access control is enforced in tRPC procedures using the context user's role.

## Important Files

| File | Purpose |
|---|---|
| `server/routers.ts` | All tRPC API endpoints (~14k lines) |
| `server/db.ts` | All database query functions (~9k lines) |
| `drizzle/schema.ts` | Drizzle ORM schema for all 158 tables |
| `server/_core/llm.ts` | Centralized LLM invocation |
| `server/_core/env.ts` | Environment variable validation |
| `server/_core/context.ts` | tRPC request context |
| `client/src/hooks/use-toast.ts` | Toast notification hook |
| `.env.example` | Template for all required environment variables |
