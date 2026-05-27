/**
 * Export helpers for emails, WhatsApp messages, and unified messaging
 * history. Produces CSV, XLSX (Excel), or PDF bytes (returned as base64
 * to travel cleanly over tRPC).
 *
 * PDF rendering reuses the same Puppeteer setup as invoicePdf.ts.
 */
import * as XLSX from "xlsx";
// @types/sanitize-html resolves locally but the CI strict ratchet sees the import as untyped; @ts-ignore tolerates both states.
// @ts-ignore
import sanitizeHtml from "sanitize-html";

export type ExportFormat = "csv" | "xlsx" | "pdf";

export interface ExportResult {
  data: string; // base64-encoded bytes (for xlsx/pdf) or raw text (for csv)
  filename: string;
  mimeType: string;
  encoding: "base64" | "utf-8";
}

// ─── shared utilities ────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(html: string): string {
  if (!html) return "";
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  try {
    const date = typeof d === "string" ? new Date(d) : d;
    if (isNaN(date.getTime())) return "";
    return date.toISOString();
  } catch {
    return "";
  }
}

function fmtDateHuman(d: Date | string | null | undefined): string {
  if (!d) return "";
  try {
    const date = typeof d === "string" ? new Date(d) : d;
    if (isNaN(date.getTime())) return "";
    return date.toLocaleString();
  } catch {
    return "";
  }
}

function rowsToCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) lines.push(row.map(escape).join(","));
  return lines.join("\n");
}

function rowsToXlsxBase64(
  headers: string[],
  rows: (string | number | null | undefined)[][],
  sheetName: string,
): string {
  const aoa = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Reasonable column widths
  ws["!cols"] = headers.map((h) => ({ wch: Math.min(60, Math.max(12, h.length + 4)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return Buffer.from(buf).toString("base64");
}

async function htmlToPdfBase64(html: string): Promise<string> {
  try {
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" },
      });
      return Buffer.from(pdfBuffer).toString("base64");
    } finally {
      await browser.close();
    }
  } catch (err) {
    // Fallback: return HTML so the caller can still hand the user *something*
    // instead of an opaque 500. Filename will still claim .pdf — same
    // behaviour as the existing invoicePdf fallback.
    console.error("[messageExport] PDF generation failed, returning HTML:", err);
    return Buffer.from(html, "utf-8").toString("base64");
  }
}

const PDF_STYLE = `
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #1f2937; font-size: 11px; line-height: 1.45; }
    h1 { font-size: 18px; margin: 0 0 4px 0; }
    h2 { font-size: 13px; margin: 18px 0 6px 0; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    .meta { color: #6b7280; font-size: 10px; margin-bottom: 16px; }
    .email { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; margin-bottom: 10px; page-break-inside: avoid; }
    .email-head { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
    .email-subject { font-weight: 600; font-size: 12px; }
    .email-from { color: #6b7280; font-size: 10px; margin-top: 2px; }
    .email-date { color: #6b7280; font-size: 10px; white-space: nowrap; }
    .email-body { white-space: pre-wrap; word-wrap: break-word; font-size: 11px; color: #374151; max-height: none; }
    .msg { margin: 8px 0; max-width: 75%; padding: 8px 10px; border-radius: 8px; page-break-inside: avoid; }
    .msg.in { background: #f3f4f6; margin-right: auto; }
    .msg.out { background: #dbeafe; margin-left: auto; }
    .msg-meta { color: #6b7280; font-size: 9px; margin-top: 4px; }
    .msg-content { white-space: pre-wrap; word-wrap: break-word; }
    .channel-badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 9px; background: #e5e7eb; color: #374151; margin-right: 4px; text-transform: uppercase; }
    .footer { color: #9ca3af; font-size: 9px; text-align: center; margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 8px; }
  </style>
`;

// ─── emails ──────────────────────────────────────────────────────────────────

export interface EmailExportRow {
  id?: number | string;
  fromName?: string | null;
  fromEmail?: string | null;
  toEmail?: string | null;
  subject?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  receivedAt?: Date | string | null;
  category?: string | null;
  priority?: string | null;
  parsingStatus?: string | null;
}

const EMAIL_HEADERS = [
  "ID",
  "Received At",
  "From Name",
  "From Email",
  "To",
  "Subject",
  "Category",
  "Priority",
  "Status",
  "Body",
];

function emailRow(e: EmailExportRow): (string | number | null | undefined)[] {
  const body = e.bodyText ? e.bodyText : stripHtml(e.bodyHtml || "");
  return [
    e.id ?? "",
    fmtDate(e.receivedAt),
    e.fromName ?? "",
    e.fromEmail ?? "",
    e.toEmail ?? "",
    e.subject ?? "",
    e.category ?? "",
    e.priority ?? "",
    e.parsingStatus ?? "",
    body,
  ];
}

export function emailsToCsv(emails: EmailExportRow[]): string {
  return rowsToCsv(EMAIL_HEADERS, emails.map(emailRow));
}

export function emailsToXlsx(emails: EmailExportRow[]): string {
  return rowsToXlsxBase64(EMAIL_HEADERS, emails.map(emailRow), "Emails");
}

export function emailsToHtml(emails: EmailExportRow[], title: string): string {
  const items = emails
    .map((e) => {
      const bodyHtmlRaw = e.bodyHtml || "";
      const safeBodyHtml = bodyHtmlRaw
        ? sanitizeHtml(bodyHtmlRaw, {
            allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
            allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, img: ["src", "alt"] },
            allowedSchemes: ["http", "https", "data", "mailto"],
          })
        : escapeHtml(e.bodyText || "");
      return `
        <div class="email">
          <div class="email-head">
            <div>
              <div class="email-subject">${escapeHtml(e.subject || "(No subject)")}</div>
              <div class="email-from">From: ${escapeHtml(e.fromName ? `${e.fromName} <${e.fromEmail || ""}>` : e.fromEmail || "")}</div>
              ${e.toEmail ? `<div class="email-from">To: ${escapeHtml(e.toEmail)}</div>` : ""}
            </div>
            <div class="email-date">${escapeHtml(fmtDateHuman(e.receivedAt))}</div>
          </div>
          <div class="email-body">${safeBodyHtml}</div>
        </div>
      `;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>${PDF_STYLE}</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">${emails.length} email${emails.length === 1 ? "" : "s"} — exported ${escapeHtml(new Date().toLocaleString())}</div>
  ${items || '<p class="meta">No emails.</p>'}
  <div class="footer">Exported from SuperHumn ERP</div>
</body></html>`;
}

export async function exportEmails(
  emails: EmailExportRow[],
  format: ExportFormat,
  baseFilename: string,
): Promise<ExportResult> {
  const ts = new Date().toISOString().slice(0, 10);
  const safe = baseFilename.replace(/[^a-z0-9_-]+/gi, "_").substring(0, 60) || "emails";
  if (format === "csv") {
    return {
      data: emailsToCsv(emails),
      filename: `${safe}_${ts}.csv`,
      mimeType: "text/csv",
      encoding: "utf-8",
    };
  }
  if (format === "xlsx") {
    return {
      data: emailsToXlsx(emails),
      filename: `${safe}_${ts}.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      encoding: "base64",
    };
  }
  // pdf
  const html = emailsToHtml(emails, baseFilename);
  return {
    data: await htmlToPdfBase64(html),
    filename: `${safe}_${ts}.pdf`,
    mimeType: "application/pdf",
    encoding: "base64",
  };
}

// ─── messages (whatsapp / unified chat history) ──────────────────────────────

export interface MessageExportRow {
  id?: number | string;
  channel?: string | null; // whatsapp | email | sms | phone | gchat
  direction?: string | null; // inbound | outbound | sent | received
  content?: string | null;
  subject?: string | null;
  status?: string | null;
  whatsappNumber?: string | null;
  fromName?: string | null;
  toName?: string | null;
  messageType?: string | null;
  sentAt?: Date | string | null;
  receivedAt?: Date | string | null;
  createdAt?: Date | string | null;
  timestamp?: Date | string | null;
  conversationId?: string | null;
}

const MESSAGE_HEADERS = [
  "ID",
  "Date",
  "Channel",
  "Direction",
  "Type",
  "From / To",
  "Subject",
  "Content",
  "Status",
  "Conversation",
];

function pickMessageDate(m: MessageExportRow): Date | string | null | undefined {
  return m.sentAt ?? m.receivedAt ?? m.createdAt ?? m.timestamp ?? null;
}

function messageRow(m: MessageExportRow): (string | number | null | undefined)[] {
  const isOutbound = m.direction === "outbound" || m.direction === "sent";
  const counterparty = isOutbound ? m.toName ?? m.whatsappNumber ?? "" : m.fromName ?? m.whatsappNumber ?? "";
  const content = m.content ?? "";
  return [
    m.id ?? "",
    fmtDate(pickMessageDate(m)),
    m.channel ?? "whatsapp",
    m.direction ?? "",
    m.messageType ?? "text",
    counterparty,
    m.subject ?? "",
    content,
    m.status ?? "",
    m.conversationId ?? "",
  ];
}

export function messagesToCsv(messages: MessageExportRow[]): string {
  return rowsToCsv(MESSAGE_HEADERS, messages.map(messageRow));
}

export function messagesToXlsx(messages: MessageExportRow[]): string {
  return rowsToXlsxBase64(MESSAGE_HEADERS, messages.map(messageRow), "Messages");
}

export function messagesToHtml(messages: MessageExportRow[], title: string, subtitle?: string): string {
  // Show oldest first in the PDF so conversations read naturally top to bottom.
  const sorted = [...messages].sort((a, b) => {
    const da = pickMessageDate(a);
    const db = pickMessageDate(b);
    const ta = da ? new Date(da).getTime() : 0;
    const tb = db ? new Date(db).getTime() : 0;
    return ta - tb;
  });

  const items = sorted
    .map((m) => {
      const isOutbound = m.direction === "outbound" || m.direction === "sent";
      const cls = isOutbound ? "msg out" : "msg in";
      const channel = m.channel || "whatsapp";
      const dateStr = fmtDateHuman(pickMessageDate(m));
      const counterparty = isOutbound ? m.toName ?? m.whatsappNumber ?? "" : m.fromName ?? m.whatsappNumber ?? "";
      return `
        <div class="${cls}">
          ${m.subject ? `<div style="font-weight:600;font-size:11px;margin-bottom:3px;">${escapeHtml(m.subject)}</div>` : ""}
          <div class="msg-content">${escapeHtml(m.content || "")}</div>
          <div class="msg-meta">
            <span class="channel-badge">${escapeHtml(channel)}</span>
            ${escapeHtml(isOutbound ? "→" : "←")} ${escapeHtml(counterparty || "")}
            · ${escapeHtml(dateStr)}
            ${m.status ? `· ${escapeHtml(m.status)}` : ""}
          </div>
        </div>
      `;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>${PDF_STYLE}</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">${subtitle ? escapeHtml(subtitle) + " — " : ""}${messages.length} message${messages.length === 1 ? "" : "s"} — exported ${escapeHtml(new Date().toLocaleString())}</div>
  ${items || '<p class="meta">No messages.</p>'}
  <div class="footer">Exported from SuperHumn ERP</div>
</body></html>`;
}

export async function exportMessages(
  messages: MessageExportRow[],
  format: ExportFormat,
  baseFilename: string,
  subtitle?: string,
): Promise<ExportResult> {
  const ts = new Date().toISOString().slice(0, 10);
  const safe = baseFilename.replace(/[^a-z0-9_-]+/gi, "_").substring(0, 60) || "messages";
  if (format === "csv") {
    return {
      data: messagesToCsv(messages),
      filename: `${safe}_${ts}.csv`,
      mimeType: "text/csv",
      encoding: "utf-8",
    };
  }
  if (format === "xlsx") {
    return {
      data: messagesToXlsx(messages),
      filename: `${safe}_${ts}.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      encoding: "base64",
    };
  }
  // pdf
  const html = messagesToHtml(messages, baseFilename, subtitle);
  return {
    data: await htmlToPdfBase64(html),
    filename: `${safe}_${ts}.pdf`,
    mimeType: "application/pdf",
    encoding: "base64",
  };
}
