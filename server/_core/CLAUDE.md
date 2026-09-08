# server/_core/ — infrastructure

Cross-cutting plumbing only. Feature logic belongs in `server/<feature>Service.ts`, never here.

## Config

All env access goes through `env.ts` → `ENV.<camelCase>`. Never read `process.env` elsewhere. Add a new key to `ENV` with a `?? ""` default and a one-line comment; production-required secrets go in `validateRequiredSecrets()`.

| Integration | File(s) | ENV keys |
|---|---|---|
| LLM (Anthropic) | `llm.ts` (`invokeLLM`, `invokeLLMStream`) | `LLM_PROVIDER`, `LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL` |
| Auth / session | `trpc.ts`, `context.ts`, `cookies.ts`, `crypto.ts`, `localAuth.ts`, `oauth.ts`, `sdk.ts` | `JWT_SECRET` (≥32 chars, fatal in prod), `OAUTH_SERVER_URL`, `OWNER_OPEN_ID` |
| Email out | `sendgridProvider.ts`, `emailService.ts`, `email.ts` | `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SENDGRID_REPLY_TO`, `SENDGRID_WEBHOOK_SECRET`, `PUBLIC_APP_URL` |
| Email in | `emailInboxScanner.ts`, `emailParser.ts`, `gmail.ts` | `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASSWORD` |
| Google | `googleToken.ts`, `googleDrive.ts`, `googleWorkspace.ts`, `googleChat.ts`, `googleServiceAccount.ts` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_CHAT_OPS_WEBHOOK`, `GOOGLE_SERVICE_ACCOUNT_JSON` (or `_EMAIL` + `_PRIVATE_KEY`) |
| QuickBooks | `quickbooks.ts` | `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_REDIRECT_URI`, `QUICKBOOKS_ENVIRONMENT` |
| Shopify | `shopify.ts` | `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_REDIRECT_URI` |
| Twilio / WhatsApp | `twilioWebhooks.ts` | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_WHATSAPP_NUMBER` |
| Storage (R2) | `../storage.ts`, `attachmentRoutes.ts`, `attachmentOcr.ts` | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` |
| API proxy (image, voice, maps, notifications, data API) | `imageGeneration.ts`, `voiceTranscription.ts`, `map.ts`, `notification.ts`, `dataApi.ts` | `API_PROXY_URL`, `API_PROXY_KEY` |
| Misc | `airtable.ts`, `b2brocket.ts`, `fireflies.ts`, `socialPublisher.ts`, `youtube.ts` | `AIRTABLE_PERSONAL_ACCESS_TOKEN`, `B2BROCKET_WEBHOOK_SECRET`, `AYRSHARE_API_KEY` |
| Code module | `../codeService.ts` | `CODE_EXEC_ENABLED` — off outside dev/test unless forced; it is host-level RCE. |

Setup docs per integration: `docs/QUICKBOOKS_SETUP.md`, `docs/SHOPIFY_SETUP.md`, `docs/SENDGRID_SETUP.md`, `docs/WHATSAPP_SETUP.md`, `docs/GOOGLE_DRIVE_SYNC.md`, `docs/B2BROCKET_SETUP.md`. Known-broken list: `docs/BROKEN_INTEGRATIONS.md`.

## Rules

- Secrets never leave this directory in plain form. Return tokens, not keys, to callers.
- OAuth token refresh goes through `routers/middleware.ts#getValidGoogleToken` — don't reimplement.
- `llm.ts`: pass `cache_control` for stable system prompts; use `invokeLLMStream` for chat surfaces. `response_format` is a prompt hint only — parse with `server/llmJson.ts`.
- Logging: `createLogger("Name")` from `logger.ts`. No bare `console.log` in new code.
- Errors worth alerting: `captureException` from `errorTracking.ts`.
- `vite.ts` is dev-only; `index.ts` inlines `serveStatic` so prod never imports it. Keep it that way.
- `index.ts:10` imports `appRouter` from `"../routers"` (the monolith). Flipping to `"../routers/index"` is a deliberate migration, never a side effect.
