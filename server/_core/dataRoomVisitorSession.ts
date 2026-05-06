import { parse as parseCookieHeader } from "cookie";
import type { Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";

export const VISITOR_COOKIE_NAME = "dr_visitor";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export type VisitorSessionPayload = {
  visitorId: number;
  linkId: number;
  linkCode: string;
  dataRoomId: number;
};

function getSecret() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function signVisitorSession(
  payload: VisitorSessionPayload,
  expiresInMs: number = DEFAULT_TTL_MS,
): Promise<string> {
  const expSec = Math.floor((Date.now() + expiresInMs) / 1000);
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expSec)
    .sign(getSecret());
}

export async function verifyVisitorSession(
  token: string | undefined | null,
): Promise<VisitorSessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    const { visitorId, linkId, linkCode, dataRoomId } = payload as Record<string, unknown>;
    if (
      typeof visitorId !== "number" ||
      typeof linkId !== "number" ||
      typeof linkCode !== "string" ||
      typeof dataRoomId !== "number"
    ) {
      return null;
    }
    return { visitorId, linkId, linkCode, dataRoomId };
  } catch {
    return null;
  }
}

export function readVisitorSessionCookie(req: Request): string | undefined {
  const cookies = parseCookieHeader(req.headers.cookie || "");
  return cookies[VISITOR_COOKIE_NAME];
}

export async function setVisitorSessionCookie(
  req: Request,
  res: Response,
  payload: VisitorSessionPayload,
  expiresInMs: number = DEFAULT_TTL_MS,
): Promise<void> {
  const token = await signVisitorSession(payload, expiresInMs);
  const opts = getSessionCookieOptions(req);
  res.cookie(VISITOR_COOKIE_NAME, token, { ...opts, maxAge: expiresInMs });
}

export function clearVisitorSessionCookie(req: Request, res: Response): void {
  const opts = getSessionCookieOptions(req);
  res.clearCookie(VISITOR_COOKIE_NAME, opts);
}
