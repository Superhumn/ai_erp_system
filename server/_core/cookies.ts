import type { CookieOptions, Request } from "express";

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  // req.secure is set by Express based on the trust proxy setting, so it
  // correctly reflects HTTPS even behind reverse proxies (Railway, Vercel).
  const secure = req.secure;

  return {
    httpOnly: true,
    path: "/",
    sameSite: secure ? "none" : "lax",
    secure,
  };
}
