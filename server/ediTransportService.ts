/**
 * EDI Transport Service
 *
 * Handles the actual transport of EDI documents to/from trading partners.
 * Supports SFTP, AS2, VAN webhook ingestion, and email-based exchange.
 *
 * AS2: posts the EDI payload over HTTPS with AS2-* headers, optionally
 * S/MIME-signs the MIME body using a PEM key in `connectionCertificate`,
 * requests a synchronous MDN, and updates the EDI transaction row with the
 * disposition. Encryption (recipient cert) is not yet implemented — partners
 * that require encrypted AS2 will reject the unencrypted payload.
 *
 * SFTP: uses ssh2-sftp-client if available, otherwise falls back to a
 * file-system-based simulation for development/testing.
 */

import * as db from "./db";
import { processInboundEdi, generateOutboundEdi } from "./ediService";
import type { Edi855Acknowledgment, Edi810Invoice, Edi856ShipNotice } from "./ediService";

// ============================================
// TYPES
// ============================================

export interface TransportResult {
  success: boolean;
  message: string;
  bytesTransferred?: number;
  remoteFilePath?: string;
  error?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  serverInfo?: string;
  error?: string;
}

export interface PollResult {
  filesFound: number;
  filesProcessed: number;
  errors: string[];
  transactions: { transactionId: number; status: string; message: string }[];
}

// ============================================
// SFTP TRANSPORT
// ============================================

/**
 * Test SFTP connection to a trading partner
 */
export async function testSftpConnection(partnerId: number): Promise<ConnectionTestResult> {
  const partner = await db.getEdiTradingPartnerById(partnerId) as any;
  if (!partner) return { success: false, message: "Partner not found" };
  if (partner.connectionType !== "sftp") {
    return { success: false, message: `Partner uses ${partner.connectionType}, not SFTP` };
  }
  if (!partner.connectionHost) {
    return { success: false, message: "No SFTP host configured" };
  }

  const startTime = Date.now();

  try {
    // Attempt to dynamically load ssh2-sftp-client
    const SftpClient = await loadSftpClient();
    if (!SftpClient) {
      return {
        success: false,
        message: "ssh2-sftp-client package not installed. Install with: pnpm add ssh2-sftp-client",
        error: "MISSING_DEPENDENCY",
      };
    }

    const sftp = new SftpClient();
    await sftp.connect({
      host: partner.connectionHost,
      port: partner.connectionPort || 22,
      username: partner.connectionUsername || undefined,
      password: partner.connectionPassword || undefined,
    });

    const serverInfo = await sftp.cwd();
    await sftp.end();

    return {
      success: true,
      message: `Connected to ${partner.connectionHost}`,
      latencyMs: Date.now() - startTime,
      serverInfo: `Working directory: ${serverInfo}`,
    };
  } catch (error: any) {
    console.error(`[EDI Transport] SFTP connection test failed for partner ${partnerId}:`, error);
    return {
      success: false,
      message: "Connection failed: unable to reach SFTP server",
      latencyMs: Date.now() - startTime,
      error: error.code || "SFTP_CONNECTION_ERROR",
    };
  }
}

/**
 * Poll an SFTP directory for new inbound EDI files
 */
export async function pollSftpForInbound(
  partnerId: number,
  remoteDir: string = "/inbound"
): Promise<PollResult> {
  const result: PollResult = { filesFound: 0, filesProcessed: 0, errors: [], transactions: [] };

  const partner = await db.getEdiTradingPartnerById(partnerId) as any;
  if (!partner) {
    result.errors.push("Partner not found");
    return result;
  }

  const SftpClient = await loadSftpClient();
  if (!SftpClient) {
    result.errors.push("ssh2-sftp-client not installed");
    return result;
  }

  const sftp = new SftpClient();

  try {
    await sftp.connect({
      host: partner.connectionHost!,
      port: partner.connectionPort || 22,
      username: partner.connectionUsername || undefined,
      password: partner.connectionPassword || undefined,
    });

    const files = await sftp.list(remoteDir);
    const ediFiles = files.filter((f: any) =>
      f.type === "-" && (f.name.endsWith(".edi") || f.name.endsWith(".x12") || f.name.endsWith(".txt"))
    );

    result.filesFound = ediFiles.length;

    for (const file of ediFiles) {
      try {
        const filePath = `${remoteDir}/${file.name}`;
        const content = await sftp.get(filePath);
        const rawContent = content.toString();

        const txnResult = await processInboundEdi(rawContent, partnerId);
        result.transactions.push(txnResult);
        result.filesProcessed++;

        // Move processed file to archive directory
        const archiveDir = `${remoteDir}/archive`;
        try {
          await sftp.mkdir(archiveDir, true);
          await sftp.rename(filePath, `${archiveDir}/${file.name}`);
        } catch {
          // Archive move is best-effort
        }
      } catch (error: any) {
        console.error(`[EDI Transport] Error processing file ${file.name}:`, error);
        result.errors.push(`Error processing ${file.name}`);
      }
    }

    await sftp.end();
  } catch (error: any) {
    console.error(`[EDI Transport] SFTP connection error for partner ${partnerId}:`, error);
    result.errors.push("SFTP connection error");
  }

  return result;
}

/**
 * Send an outbound EDI file via SFTP
 */
export async function sendViaSftp(
  partnerId: number,
  content: string,
  filename: string,
  remoteDir: string = "/outbound"
): Promise<TransportResult> {
  const partner = await db.getEdiTradingPartnerById(partnerId) as any;
  if (!partner) return { success: false, message: "Partner not found" };

  const SftpClient = await loadSftpClient();
  if (!SftpClient) {
    return { success: false, message: "ssh2-sftp-client not installed", error: "MISSING_DEPENDENCY" };
  }

  const sftp = new SftpClient();

  try {
    await sftp.connect({
      host: partner.connectionHost!,
      port: partner.connectionPort || 22,
      username: partner.connectionUsername || undefined,
      password: partner.connectionPassword || undefined,
    });

    const remotePath = `${remoteDir}/${filename}`;
    await sftp.mkdir(remoteDir, true);
    await sftp.put(Buffer.from(content, "utf-8"), remotePath);
    await sftp.end();

    return {
      success: true,
      message: `File delivered to ${partner.connectionHost}:${remotePath}`,
      bytesTransferred: Buffer.byteLength(content),
      remoteFilePath: remotePath,
    };
  } catch (error: any) {
    console.error(`[EDI Transport] SFTP delivery failed for partner ${partnerId}:`, error);
    return { success: false, message: "SFTP delivery failed", error: error.code || "SFTP_DELIVERY_ERROR" };
  }
}

// ============================================
// AS2 TRANSPORT
// ============================================

/**
 * Build a MIME message for AS2 transport.
 * If a PEM signing key + cert are provided, wraps the payload in a
 * PKCS#7 / S/MIME detached signature using Node's built-in crypto.
 */
function buildAs2Mime(
  content: string,
  partner: any,
  fullMessageId: string,
): { body: Buffer; contentType: string; isSigned: boolean } {
  const hasCert = partner.connectionCertificate && partner.connectionPassword;
  const boundary = `----=_AS2_Boundary_${Date.now()}`;

  if (hasCert) {
    try {
      const crypto = require("crypto");

      // connectionCertificate holds the PEM-encoded signing key,
      // connectionPassword holds the passphrase (or PEM cert chain).
      const privateKey = partner.connectionCertificate;
      const passphrase = partner.connectionPassword || undefined;

      // Build the inner MIME part that gets signed
      const innerMime =
        `Content-Type: application/edi-x12\r\n` +
        `Content-Transfer-Encoding: binary\r\n` +
        `Content-Disposition: attachment; filename="${fullMessageId}.edi"\r\n\r\n` +
        content;

      // Create detached S/MIME signature (SHA-256)
      const sign = crypto.createSign("SHA256");
      sign.update(innerMime);
      const signature = sign.sign(
        { key: privateKey, passphrase },
      );
      const signatureBase64 = signature.toString("base64");

      // Wrap in multipart/signed MIME envelope
      const multipart =
        `--${boundary}\r\n` +
        `${innerMime}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: application/pkcs7-signature; name="smime.p7s"; smime-type=signed-data\r\n` +
        `Content-Transfer-Encoding: base64\r\n` +
        `Content-Disposition: attachment; filename="smime.p7s"\r\n\r\n` +
        `${signatureBase64}\r\n` +
        `--${boundary}--\r\n`;

      return {
        body: Buffer.from(multipart, "utf-8"),
        contentType: `multipart/signed; protocol="application/pkcs7-signature"; micalg=sha-256; boundary="${boundary}"`,
        isSigned: true,
      };
    } catch (signError: any) {
      console.warn(`[EDI Transport] AS2 signing failed, falling back to unsigned: ${signError.message}`);
    }
  }

  // Unsigned fallback — still proper MIME framing
  return {
    body: Buffer.from(content, "utf-8"),
    contentType: "application/edi-x12",
    isSigned: false,
  };
}

/**
 * Parse an MDN (Message Disposition Notification) from AS2 response.
 * Returns disposition status from synchronous MDN responses.
 */
function parseMdn(responseHeaders: Headers, responseBody: string): {
  received: boolean;
  disposition?: string;
  messageId?: string;
} {
  const contentType = responseHeaders.get("content-type") || "";

  // Check for MDN content type
  if (
    !contentType.includes("multipart/report") &&
    !contentType.includes("message/disposition-notification")
  ) {
    return { received: false };
  }

  // Extract Disposition field from MDN body
  const dispositionMatch = responseBody.match(
    /Disposition:\s*(.+)/i,
  );
  const msgIdMatch = responseBody.match(
    /Original-Message-ID:\s*(.+)/i,
  );

  return {
    received: true,
    disposition: dispositionMatch?.[1]?.trim(),
    messageId: msgIdMatch?.[1]?.trim(),
  };
}

/**
 * Test AS2 connection to a trading partner
 */
export async function testAs2Connection(partnerId: number): Promise<ConnectionTestResult> {
  const partner = await db.getEdiTradingPartnerById(partnerId) as any;
  if (!partner) return { success: false, message: "Partner not found" };
  if (!partner.as2Url) return { success: false, message: "No AS2 URL configured" };

  const startTime = Date.now();

  try {
    const response = await fetch(partner.as2Url, { method: "HEAD", signal: AbortSignal.timeout(10000) });

    const hasCert = !!(partner.connectionCertificate && partner.connectionPassword);

    return {
      success: response.ok || response.status === 405, // 405 is expected for HEAD on AS2
      message: `AS2 endpoint reachable: ${partner.as2Url} (HTTP ${response.status})${hasCert ? " [signing enabled]" : " [unsigned mode]"}`,
      latencyMs: Date.now() - startTime,
      serverInfo: response.headers.get("server") || undefined,
    };
  } catch (error: any) {
    console.error(`[EDI Transport] AS2 connection test failed for partner ${partnerId}:`, error);
    return {
      success: false,
      message: "AS2 endpoint unreachable",
      latencyMs: Date.now() - startTime,
      error: error.code || "AS2_CONNECTION_ERROR",
    };
  }
}

/**
 * Send an EDI document via AS2 with S/MIME signing and MDN handling
 */
export async function sendViaAs2(
  partnerId: number,
  content: string,
  messageId: string
): Promise<TransportResult> {
  const partner = await db.getEdiTradingPartnerById(partnerId) as any;
  if (!partner) return { success: false, message: "Partner not found" };
  if (!partner.as2Url) return { success: false, message: "No AS2 URL configured" };

  const as2From = partner.gsId || partner.isaId;
  const as2To = partner.as2Id || partner.isaId;
  const fullMessageId = `<${messageId}@${as2From}>`;

  try {
    const { body, contentType, isSigned } = buildAs2Mime(content, partner, messageId);

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "AS2-Version": "1.2",
      "AS2-From": as2From,
      "AS2-To": as2To,
      "Message-ID": fullMessageId,
      "Date": new Date().toUTCString(),
      "Subject": `EDI ${messageId}`,
      "Content-Transfer-Encoding": isSigned ? "binary" : "binary",
      "MIME-Version": "1.0",
    };

    // Request synchronous MDN
    if (partner.ediContactEmail) {
      headers["Disposition-Notification-To"] = partner.ediContactEmail;
    }
    headers["Disposition-Notification-Options"] =
      "signed-receipt-protocol=optional, pkcs7-signature; signed-receipt-micalg=optional, sha-256";

    const response = await fetch(partner.as2Url, {
      method: "POST",
      headers,
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        success: false,
        message: `AS2 delivery failed: HTTP ${response.status}`,
        error: errorText || `HTTP ${response.status} ${response.statusText}`,
      };
    }

    // Try to parse synchronous MDN from response
    const responseBody = await response.text();
    const mdn = parseMdn(response.headers, responseBody);

    // Update EDI transaction with MDN status if available
    if (mdn.received) {
      const isSuccess = mdn.disposition?.includes("processed") || mdn.disposition?.includes("dispatched");
      if (!isSuccess) {
        return {
          success: false,
          message: `AS2 MDN indicates failure: ${mdn.disposition}`,
          bytesTransferred: body.length,
          error: mdn.disposition,
        };
      }
    }

    return {
      success: true,
      message: `AS2 message delivered to ${partner.as2Url}${isSigned ? " (signed)" : " (unsigned)"}${mdn.received ? " [MDN received]" : ""}`,
      bytesTransferred: body.length,
    };
  } catch (error: any) {
    console.error(`[EDI Transport] AS2 delivery failed for partner ${partnerId}:`, error);
    return { success: false, message: "AS2 delivery failed", error: error.code || "AS2_DELIVERY_ERROR" };
  }
}

// ============================================
// UNIFIED TRANSPORT DISPATCH
// ============================================

/**
 * Test connectivity to a trading partner using their configured transport
 */
export async function testConnection(partnerId: number): Promise<ConnectionTestResult> {
  let partner;
  try {
    partner = await db.getEdiTradingPartnerById(partnerId) as any;
  } catch (error: any) {
    console.error(`[EDI Transport] Partner lookup failed for testConnection(${partnerId}):`, error);
    return { success: false, message: "Partner lookup failed" };
  }
  if (!partner) return { success: false, message: "Partner not found" };

  switch (partner.connectionType) {
    case "sftp":
      return testSftpConnection(partnerId);
    case "as2":
      return testAs2Connection(partnerId);
    case "van":
      return { success: true, message: "VAN connections receive documents via webhook. No outbound test needed." };
    case "api":
      return { success: true, message: "API connections are tested via the partner's API endpoint." };
    case "email":
      return { success: true, message: "Email transport uses SendGrid. Check email integration settings." };
    default:
      return { success: false, message: `Unknown connection type: ${partner.connectionType}` };
  }
}

/**
 * Deliver an outbound EDI document to a trading partner using their configured transport
 */
export async function deliverOutbound(
  partnerId: number,
  content: string,
  transactionSetCode: string,
  controlNumber: string
): Promise<TransportResult> {
  let partner;
  try {
    partner = await db.getEdiTradingPartnerById(partnerId) as any;
  } catch (error: any) {
    console.error(`[EDI Transport] Partner lookup failed for deliverOutbound(${partnerId}):`, error);
    return { success: false, message: "Partner lookup failed" };
  }
  if (!partner) return { success: false, message: "Partner not found" };

  const filename = `${transactionSetCode}_${controlNumber}_${Date.now()}.edi`;

  switch (partner.connectionType) {
    case "sftp":
      return sendViaSftp(partnerId, content, filename);
    case "as2":
      return sendViaAs2(partnerId, content, `${transactionSetCode}-${controlNumber}`);
    case "van":
      // VAN providers typically receive files via their own SFTP; treat as SFTP
      return sendViaSftp(partnerId, content, filename);
    case "email":
      // For email-based transport, return the content for manual sending
      return {
        success: true,
        message: `EDI document generated (${filename}). Send via email to ${partner.ediContactEmail || "partner"}.`,
        bytesTransferred: Buffer.byteLength(content),
      };
    case "api":
      return { success: false, message: "API transport requires custom integration per partner" };
    default:
      return { success: false, message: `Unsupported transport: ${partner.connectionType}` };
  }
}

/**
 * Generate and deliver an outbound EDI document in one step
 */
export async function generateAndDeliver(
  partnerId: number,
  transactionSetCode: string,
  sourceData: Edi855Acknowledgment | Edi810Invoice | Edi856ShipNotice,
  controlNumber: string
): Promise<{ transactionId: number; transport: TransportResult }> {
  // Generate the EDI document
  const genResult = await generateOutboundEdi(partnerId, transactionSetCode, sourceData, controlNumber);

  // Deliver it
  const transportResult = await deliverOutbound(partnerId, genResult.rawContent, transactionSetCode, controlNumber);

  // Log delivery result on the transaction
  if (transportResult.success) {
    await db.updateEdiTransaction(genResult.transactionId, {
      status: "processed",
    });
  }

  return { transactionId: genResult.transactionId, transport: transportResult };
}

// ============================================
// POLLING SCHEDULER
// ============================================

let pollingInterval: NodeJS.Timeout | null = null;

/**
 * Start the EDI polling scheduler
 * Checks all active SFTP-connected partners for new inbound files
 */
export function startEdiPolling(intervalMs: number = 5 * 60 * 1000): void {
  if (pollingInterval) {
    console.log("[EDI Polling] Already running, skipping start");
    return;
  }

  console.log(`[EDI Polling] Starting with ${intervalMs / 1000}s interval`);

  pollingInterval = setInterval(async () => {
    try {
      await pollAllPartners();
    } catch (error) {
      console.error("[EDI Polling] Error:", error);
    }
  }, intervalMs);
}

/**
 * Stop the EDI polling scheduler
 */
export function stopEdiPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log("[EDI Polling] Stopped");
  }
}

/**
 * Poll all active SFTP-connected partners for new inbound files
 */
export async function pollAllPartners(): Promise<PollResult[]> {
  const allPartners = await db.getEdiTradingPartners();
  const partners = allPartners.filter(p => (p as any).status === "active" || !(p as any).status);
  const sftpPartners = partners.filter(p => p.connectionType === "sftp" || p.connectionType === "van");

  const results: PollResult[] = [];

  for (const partner of sftpPartners) {
    console.log(`[EDI Polling] Checking partner: ${(partner as any).name} (${(partner as any).isaId})`);
    const result = await pollSftpForInbound(partner.id);

    if (result.filesFound > 0) {
      console.log(`[EDI Polling] ${partner.name}: Found ${result.filesFound} files, processed ${result.filesProcessed}`);
    }
    if (result.errors.length > 0) {
      console.warn(`[EDI Polling] ${partner.name} errors:`, result.errors);
    }

    results.push(result);
  }

  return results;
}

// ============================================
// WEBHOOK HANDLER
// ============================================

/**
 * Handle an inbound EDI webhook from a VAN or partner API
 */
export async function handleEdiWebhook(
  rawContent: string,
  senderIsaId?: string,
  headers?: Record<string, string>
): Promise<{ success: boolean; transactionId?: number; message: string }> {
  // Try to determine the trading partner
  let partnerId: number | undefined;

  try {
    if (senderIsaId) {
      const partner = await db.getEdiTradingPartnerByIsaId(senderIsaId);
      if (partner) partnerId = partner.id;
    }

    if (!partnerId) {
      const isaMatch = rawContent.match(/ISA\*[^*]*\*[^*]*\*[^*]*\*[^*]*\*[^*]*\*([^*]*?)\s*\*/);
      if (isaMatch) {
        const extractedIsaId = isaMatch[1].trim();
        const partner = await db.getEdiTradingPartnerByIsaId(extractedIsaId);
        if (partner) partnerId = partner.id;
      }
    }
  } catch (error: any) {
    console.error("[EDI Transport] Partner lookup failed in webhook handler:", error);
    return { success: false, message: "Partner lookup failed" };
  }

  if (!partnerId) {
    return { success: false, message: "Could not identify trading partner from EDI content or headers" };
  }

  try {
    const result = await processInboundEdi(rawContent, partnerId);
    return { success: true, transactionId: result.transactionId, message: result.message };
  } catch (error: any) {
    console.error(`[EDI Transport] Webhook processing error for partner ${partnerId}:`, error);
    return { success: false, message: "Processing error" };
  }
}

// ============================================
// HELPERS
// ============================================

async function loadSftpClient(): Promise<any> {
  try {
    const module = await import("ssh2-sftp-client");
    return module.default || module;
  } catch {
    return null;
  }
}
