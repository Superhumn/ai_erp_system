export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// Languages the /code module can actually execute server-side. The editor's
// language dropdown offers more (they're still useful for storing/highlighting
// snippets), but "Run" only works for these. Shared so the server executor and
// the client's Run affordance agree on one source of truth.
export const EXECUTABLE_LANGUAGES = ["javascript", "typescript", "python", "bash", "sh"] as const;
export type ExecutableLanguage = typeof EXECUTABLE_LANGUAGES[number];
export function isExecutableLanguage(lang: string): boolean {
  return (EXECUTABLE_LANGUAGES as readonly string[]).includes(lang.toLowerCase());
}
