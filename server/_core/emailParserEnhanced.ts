/**
 * Enhanced Email Parser
 *
 * Extends the base email parser with:
 * - Advanced MIME multipart parsing
 * - Email signature detection and removal
 * - Email thread/conversation reconstruction
 * - Quoted text removal
 * - Charset/encoding detection
 * - Embedded image (CID) extraction
 */

// ============================================
// EMAIL SIGNATURE REMOVAL
// ============================================

/**
 * Common email signature delimiters and patterns
 */
const SIGNATURE_PATTERNS: RegExp[] = [
  // Explicit signature markers
  /^--\s*$/m,                                    // Standard sig delimiter "-- "
  /^_{3,}\s*$/m,                                 // Underscore line "___"
  /^-{3,}\s*$/m,                                 // Dash line "---"
  /^={3,}\s*$/m,                                 // Equals line "==="
  // Common signature openings
  /^(best|kind)?\s*regards?,?\s*$/im,
  /^sincerely,?\s*$/im,
  /^thanks?,?\s*$/im,
  /^thank you,?\s*$/im,
  /^cheers,?\s*$/im,
  /^warm(est)?\s+regards?,?\s*$/im,
  /^yours\s+(truly|faithfully|sincerely),?\s*$/im,
  /^sent from my (iphone|ipad|android|galaxy|pixel|samsung)/im,
  /^get outlook for/im,
  /^sent from mail for windows/im,
];

/**
 * Remove email signature from body text
 */
export function removeSignature(text: string): { body: string; signature: string | null } {
  if (!text) return { body: text, signature: null };

  const lines = text.split("\n");
  let signatureStartIndex = -1;

  // Scan from bottom up to find signature start (more reliable)
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 20); i--) {
    const line = lines[i].trim();
    if (!line) continue;

    for (const pattern of SIGNATURE_PATTERNS) {
      if (pattern.test(line)) {
        signatureStartIndex = i;
        break;
      }
    }
    if (signatureStartIndex >= 0) break;
  }

  if (signatureStartIndex < 0) {
    return { body: text, signature: null };
  }

  const body = lines.slice(0, signatureStartIndex).join("\n").trimEnd();
  const signature = lines.slice(signatureStartIndex).join("\n").trim();

  return { body, signature };
}

// ============================================
// QUOTED TEXT / REPLY CHAIN REMOVAL
// ============================================

/**
 * Patterns that indicate the start of quoted/forwarded text
 */
const QUOTED_TEXT_PATTERNS: RegExp[] = [
  /^on .+wrote:\s*$/im,                         // "On Jan 1, 2025, John wrote:"
  /^on .+ at .+,\s*.+wrote:\s*$/im,             // "On Jan 1, 2025, at 10:00, John wrote:"
  /^>+ .*/m,                                     // "> quoted text"
  /^from:\s+.+$/im,                              // "From: sender@example.com"  (forwarded header block)
  /^-{3,}\s*original message\s*-{3,}/im,         // "--- Original Message ---"
  /^-{3,}\s*forwarded message\s*-{3,}/im,        // "--- Forwarded Message ---"
  /^begin forwarded message/im,                   // "Begin forwarded message:"
  /^_{3,}\s*$/m,                                  // "___" separator before quote
];

/**
 * Remove quoted/forwarded text from an email body, returning the latest reply.
 */
export function removeQuotedText(text: string): { latestReply: string; quotedText: string | null } {
  if (!text) return { latestReply: text, quotedText: null };

  const lines = text.split("\n");
  let quoteStartIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of QUOTED_TEXT_PATTERNS) {
      if (pattern.test(line)) {
        // Verify this isn't a false positive by checking context
        // "From:" is only a quote header if followed by more headers
        if (/^from:\s+.+$/im.test(line)) {
          const nextLines = lines.slice(i + 1, i + 4).join("\n");
          if (!/^(to|date|subject|sent):\s+/im.test(nextLines)) continue;
        }
        quoteStartIndex = i;
        break;
      }
    }
    if (quoteStartIndex >= 0) break;
  }

  if (quoteStartIndex < 0) {
    return { latestReply: text, quotedText: null };
  }

  const latestReply = lines.slice(0, quoteStartIndex).join("\n").trimEnd();
  const quotedText = lines.slice(quoteStartIndex).join("\n").trim();

  return { latestReply, quotedText };
}

// ============================================
// EMAIL THREAD RECONSTRUCTION
// ============================================

export interface EmailThreadMessage {
  from?: string;
  date?: string;
  subject?: string;
  body: string;
  level: number; // 0 = newest, 1 = previous, etc.
}

/**
 * Parse an email chain into individual messages (thread reconstruction).
 * Returns messages ordered newest-first.
 */
export function parseEmailThread(text: string): EmailThreadMessage[] {
  if (!text) return [{ body: text, level: 0 }];

  const messages: EmailThreadMessage[] = [];
  const threadSplitPattern = /^(?:on .+wrote:|from:\s+.+\n(?:to|sent|date|subject):.+|-{3,}\s*(?:original|forwarded)\s*message\s*-{3,})/im;

  const parts = text.split(threadSplitPattern);

  if (parts.length <= 1) {
    // No thread detected
    return [{ body: text.trim(), level: 0 }];
  }

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;

    // Try to extract header info from quoted block
    const headerMatch = part.match(
      /^(?:from:\s*(.+?)\n)?(?:(?:sent|date):\s*(.+?)\n)?(?:to:\s*.+?\n)?(?:subject:\s*(.+?)\n)?(.+)/is
    );

    if (headerMatch) {
      messages.push({
        from: headerMatch[1]?.trim(),
        date: headerMatch[2]?.trim(),
        subject: headerMatch[3]?.trim(),
        body: (headerMatch[4] || part).trim(),
        level: i,
      });
    } else {
      messages.push({
        body: part.trim(),
        level: i,
      });
    }
  }

  return messages;
}

// ============================================
// MIME MULTIPART PARSING
// ============================================

export interface MimePart {
  contentType: string;
  charset?: string;
  contentDisposition?: string;
  contentTransferEncoding?: string;
  contentId?: string;
  filename?: string;
  body: string;
  isInline: boolean;
  isAttachment: boolean;
}

/**
 * Parse a raw MIME email into structured parts.
 * Handles multipart/mixed, multipart/alternative, multipart/related.
 */
export function parseMimeMessage(rawEmail: string): {
  headers: Record<string, string>;
  textBody: string | null;
  htmlBody: string | null;
  parts: MimePart[];
  attachments: MimePart[];
  inlineImages: MimePart[];
} {
  if (!rawEmail) {
    return { headers: {}, textBody: null, htmlBody: null, parts: [], attachments: [], inlineImages: [] };
  }

  // Split headers and body
  const headerBodySplit = rawEmail.indexOf("\r\n\r\n") !== -1
    ? rawEmail.indexOf("\r\n\r\n")
    : rawEmail.indexOf("\n\n");

  const headerSection = rawEmail.substring(0, headerBodySplit);
  const bodySection = rawEmail.substring(headerBodySplit).replace(/^[\r\n]+/, "");

  // Parse headers
  const headers = parseHeaders(headerSection);
  const contentType = headers["content-type"] || "text/plain";

  // Check if multipart
  const boundaryMatch = contentType.match(/boundary=["']?([^"';\s]+)["']?/i);

  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = parseMultipartBody(bodySection, boundary);

    const textParts = parts.filter(p => p.contentType.startsWith("text/plain"));
    const htmlParts = parts.filter(p => p.contentType.startsWith("text/html"));
    const attachments = parts.filter(p => p.isAttachment);
    const inlineImages = parts.filter(p => p.isInline && p.contentType.startsWith("image/"));

    return {
      headers,
      textBody: textParts.length > 0 ? textParts[0].body : null,
      htmlBody: htmlParts.length > 0 ? htmlParts[0].body : null,
      parts,
      attachments,
      inlineImages,
    };
  }

  // Single part message
  const encoding = headers["content-transfer-encoding"] || "7bit";
  const body = decodeBody(bodySection, encoding);

  return {
    headers,
    textBody: contentType.includes("text/plain") ? body : null,
    htmlBody: contentType.includes("text/html") ? body : null,
    parts: [{
      contentType,
      body,
      isInline: false,
      isAttachment: false,
    }],
    attachments: [],
    inlineImages: [],
  };
}

/**
 * Parse MIME headers from a header block
 */
function parseHeaders(headerBlock: string): Record<string, string> {
  const headers: Record<string, string> = {};
  // Unfold continuation lines
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  const lines = unfolded.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (match) {
      headers[match[1].toLowerCase().trim()] = match[2].trim();
    }
  }
  return headers;
}

/**
 * Parse multipart body into MIME parts
 */
function parseMultipartBody(body: string, boundary: string): MimePart[] {
  const parts: MimePart[] = [];
  const delimiter = `--${boundary}`;
  const endDelimiter = `--${boundary}--`;

  const sections = body.split(delimiter);

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed || trimmed === "--" || trimmed.startsWith("--")) continue;

    // Split part headers from body
    const partSplit = trimmed.indexOf("\r\n\r\n") !== -1
      ? trimmed.indexOf("\r\n\r\n")
      : trimmed.indexOf("\n\n");

    if (partSplit === -1) continue;

    const partHeaders = parseHeaders(trimmed.substring(0, partSplit));
    let partBody = trimmed.substring(partSplit).replace(/^[\r\n]+/, "");

    // Remove end delimiter if present
    if (partBody.endsWith(endDelimiter)) {
      partBody = partBody.slice(0, -endDelimiter.length).trim();
    }

    const contentType = partHeaders["content-type"] || "text/plain";
    const contentDisposition = partHeaders["content-disposition"] || "";
    const encoding = partHeaders["content-transfer-encoding"] || "7bit";
    const contentId = partHeaders["content-id"]?.replace(/[<>]/g, "");

    // Check for nested multipart
    const nestedBoundaryMatch = contentType.match(/boundary=["']?([^"';\s]+)["']?/i);
    if (nestedBoundaryMatch) {
      const nestedParts = parseMultipartBody(partBody, nestedBoundaryMatch[1]);
      parts.push(...nestedParts);
      continue;
    }

    // Decode body
    const decodedBody = decodeBody(partBody, encoding);

    // Extract charset
    const charsetMatch = contentType.match(/charset=["']?([^"';\s]+)["']?/i);
    const charset = charsetMatch ? charsetMatch[1] : undefined;

    // Extract filename
    const filenameMatch =
      contentDisposition.match(/filename=["']?([^"';\s]+)["']?/i) ||
      contentType.match(/name=["']?([^"';\s]+)["']?/i);
    const filename = filenameMatch ? filenameMatch[1] : undefined;

    const isAttachment = contentDisposition.includes("attachment") || !!filename;
    const isInline = contentDisposition.includes("inline") || !!contentId;

    parts.push({
      contentType: contentType.split(";")[0].trim(),
      charset,
      contentDisposition,
      contentTransferEncoding: encoding,
      contentId,
      filename,
      body: decodedBody,
      isInline: isInline && !isAttachment,
      isAttachment,
    });
  }

  return parts;
}

/**
 * Decode body content based on transfer encoding
 */
function decodeBody(body: string, encoding: string): string {
  const enc = encoding.toLowerCase().trim();

  if (enc === "base64") {
    try {
      return Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf-8");
    } catch {
      return body;
    }
  }

  if (enc === "quoted-printable") {
    return decodeQuotedPrintable(body);
  }

  // 7bit, 8bit, binary - return as-is
  return body;
}

/**
 * Decode quoted-printable encoded text
 */
function decodeQuotedPrintable(text: string): string {
  return text
    .replace(/=\r?\n/g, "")  // Soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// ============================================
// HTML TO PLAIN TEXT CONVERSION
// ============================================

/**
 * Convert HTML email body to clean plain text
 */
export function htmlToPlainText(html: string): string {
  if (!html) return "";

  let text = html;

  // Remove style and script tags and their content
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");

  // Convert common block elements to newlines
  text = text.replace(/<\/?(p|div|br|hr|h[1-6]|li|tr|table|blockquote)[^>]*>/gi, "\n");

  // Convert list items
  text = text.replace(/<li[^>]*>/gi, "\n- ");

  // Convert links to text [link text](url)
  text = text.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)");

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text.replace(/&nbsp;/gi, " ");
  text = text.replace(/&amp;/gi, "&");
  text = text.replace(/&lt;/gi, "<");
  text = text.replace(/&gt;/gi, ">");
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, "'");
  text = text.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)));

  // Clean up whitespace
  text = text.replace(/[ \t]+/g, " ");       // Collapse horizontal whitespace
  text = text.replace(/\n{3,}/g, "\n\n");    // Collapse multiple newlines
  text = text.trim();

  return text;
}

// ============================================
// FULL ENHANCED PARSING PIPELINE
// ============================================

export interface EnhancedParseResult {
  /** Clean body with signature and quotes removed */
  cleanBody: string;
  /** Original full body text */
  fullBody: string;
  /** Extracted signature */
  signature: string | null;
  /** Quoted/forwarded text */
  quotedText: string | null;
  /** Reconstructed thread messages */
  thread: EmailThreadMessage[];
  /** MIME parts if raw email provided */
  mimeParts?: MimePart[];
  /** Inline/embedded images */
  inlineImages?: MimePart[];
  /** Detected charset */
  charset?: string;
}

/**
 * Full enhanced parsing pipeline.
 * Takes email body text and returns cleaned, structured data.
 */
export function enhancedParse(
  bodyText: string,
  bodyHtml?: string | null,
  rawEmail?: string | null
): EnhancedParseResult {
  let fullBody = bodyText || "";
  let mimeParts: MimePart[] | undefined;
  let inlineImages: MimePart[] | undefined;
  let charset: string | undefined;

  // If we have raw MIME, parse it for better extraction
  if (rawEmail) {
    const mimeResult = parseMimeMessage(rawEmail);
    fullBody = mimeResult.textBody || (mimeResult.htmlBody ? htmlToPlainText(mimeResult.htmlBody) : fullBody);
    mimeParts = mimeResult.parts;
    inlineImages = mimeResult.inlineImages;
    // Get charset from first text part
    const textPart = mimeResult.parts.find(p => p.contentType.startsWith("text/"));
    charset = textPart?.charset;
  } else if (!bodyText && bodyHtml) {
    // Convert HTML to text if only HTML is available
    fullBody = htmlToPlainText(bodyHtml);
  }

  // Step 1: Remove quoted/forwarded text
  const { latestReply, quotedText } = removeQuotedText(fullBody);

  // Step 2: Remove signature from latest reply
  const { body: cleanBody, signature } = removeSignature(latestReply);

  // Step 3: Reconstruct thread
  const thread = parseEmailThread(fullBody);

  return {
    cleanBody,
    fullBody,
    signature,
    quotedText,
    thread,
    mimeParts,
    inlineImages,
    charset,
  };
}
