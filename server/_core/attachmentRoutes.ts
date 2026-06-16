/**
 * Email attachment file serving.
 *
 * Serves the raw bytes of a stored email attachment so the inbox UI can view
 * (inline) or download it. Content lives in object storage (Cloudflare R2) when
 * configured, otherwise it falls back to a base64 data URL stashed on the
 * attachment's metadata (small files only). Access is gated by the same session
 * cookie used by tRPC's protectedProcedure.
 */

import type { Express, Request, Response } from "express";
import * as db from "../db";
import { sdk } from "./sdk";
import { storageGet } from "../storage";

function setDispositionHeaders(res: Response, filename: string, mimeType: string, download: boolean) {
  const safeName = encodeURIComponent(filename || "attachment");
  res.setHeader("Content-Type", mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${safeName}"`);
  res.setHeader("Cache-Control", "private, max-age=60");
}

export function registerAttachmentRoutes(app: Express) {
  // GET /api/attachments/:id        → view inline
  // GET /api/attachments/:id?download=1 → download
  app.get("/api/attachments/:id", async (req: Request, res: Response) => {
    // Authenticate the same way protectedProcedure does.
    try {
      await sdk.authenticateRequest(req);
    } catch {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid attachment id" });

    const attachment = await db.getEmailAttachmentById(id);
    if (!attachment) return res.status(404).json({ error: "Attachment not found" });

    const download = req.query.download != null && req.query.download !== "0" && req.query.download !== "false";
    const mimeType = attachment.mimeType || "application/octet-stream";
    const filename = attachment.filename || "attachment";

    try {
      // Preferred: object storage (R2).
      if (attachment.storageKey) {
        const { url } = await storageGet(attachment.storageKey);
        const upstream = await fetch(url);
        if (!upstream.ok || !upstream.body) {
          return res.status(502).json({ error: "Failed to fetch stored attachment" });
        }
        setDispositionHeaders(res, filename, mimeType, download);
        const len = upstream.headers.get("content-length");
        if (len) res.setHeader("Content-Length", len);
        const { Readable } = await import("node:stream");
        Readable.fromWeb(upstream.body as any).pipe(res);
        return;
      }

      // Fallback: base64 data URL stored on metadata (small files, no R2).
      const meta = (attachment.metadata as any) || {};
      const dataUrl: string | undefined = meta.contentDataUrl;
      if (dataUrl && dataUrl.startsWith("data:")) {
        const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
        const buffer = Buffer.from(base64, "base64");
        setDispositionHeaders(res, filename, mimeType, download);
        res.setHeader("Content-Length", buffer.length);
        return res.end(buffer);
      }

      return res.status(404).json({ error: "Attachment content is not available" });
    } catch (err: any) {
      console.error("[attachments] serve failed:", err?.message);
      return res.status(500).json({ error: "Failed to serve attachment" });
    }
  });
}
