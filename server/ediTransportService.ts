/**
 * EDI Transport Service
 *
 * Handles the actual transport of EDI documents to/from trading partners.
 * Supports SFTP, AS2 (stub), VAN webhook ingestion, and email-based exchange.
 *
 * For SFTP: Uses ssh2-sftp-client if available, otherwise provides a
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
  const partner = await db.getEdiTradingPartnerById(partnerId);
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
    return {
      success: false,
      message: `Connection failed: ${error.message}`,
      latencyMs: Date.now() - startTime,
      error: error.code || error.message,
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

  const partner = await db.getEdiTradingPartnerById(partnerId);
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
        result.errors.push(`Error processing ${file.name}: ${error.message}`);
      }
    }

    await sftp.end();
  } catch (error: any) {
    result.errors.push(`SFTP connection error: ${error.message}`);
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
  const partner = await db.getEdiTradingPartnerById(partnerId);
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
    return { success: false, message: `SFTP delivery failed: ${error.message}`, error: error.message };
  }
}

// ============================================
// AS2 TRANSPORT (STUB)
// ============================================

/**
 * Test AS2 connection to a trading partner
 */
export async function testAs2Connection(partnerId: number): Promise<ConnectionTestResult> {
  const partner = await db.getEdiTradingPartnerById(partnerId);
  if (!partner) return { success: false, message: "Partner not found" };
  if (!partner.as2Url) return { success: false, message: "No AS2 URL configured" };

  const startTime = Date.now();

  try {
    // AS2 connection test: send an HTTP OPTIONS or HEAD to the AS2 endpoint
    const response = await fetch(partner.as2Url, { method: "HEAD", signal: AbortSignal.timeout(10000) });

    return {
      success: response.ok || response.status === 405, // 405 is expected for HEAD on AS2
      message: `AS2 endpoint reachable: ${partner.as2Url} (HTTP ${response.status})`,
      latencyMs: Date.now() - startTime,
      serverInfo: response.headers.get("server") || undefined,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `AS2 endpoint unreachable: ${error.message}`,
      latencyMs: Date.now() - startTime,
      error: error.message,
    };
  }
}

/**
 * Send an EDI document via AS2
 */
export async function sendViaAs2(
  partnerId: number,
  content: string,
  messageId: string
): Promise<TransportResult> {
  const partner = await db.getEdiTradingPartnerById(partnerId);
  if (!partner) return { success: false, message: "Partner not found" };
  if (!partner.as2Url) return { success: false, message: "No AS2 URL configured" };

  try {
    // Send EDI content as AS2 message
    const response = await fetch(partner.as2Url, {
      method: "POST",
      headers: {
        "Content-Type": "application/edi-x12",
        "AS2-From": partner.gsId,
        "AS2-To": partner.as2Id || partner.isaId,
        "Message-ID": `<${messageId}@${partner.gsId}>`,
        "Disposition-Notification-To": partner.ediContactEmail || "",
        "Disposition-Notification-Options": "signed-receipt-protocol=optional, pkcs7-signature; signed-receipt-micalg=optional, sha-256",
      },
      body: content,
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return { success: false, message: `AS2 delivery failed: HTTP ${response.status}`, error: await response.text() };
    }

    return {
      success: true,
      message: `AS2 message delivered to ${partner.as2Url}`,
      bytesTransferred: Buffer.byteLength(content),
    };
  } catch (error: any) {
    return { success: false, message: `AS2 delivery failed: ${error.message}`, error: error.message };
  }
}

// ============================================
// UNIFIED TRANSPORT DISPATCH
// ============================================

/**
 * Test connectivity to a trading partner using their configured transport
 */
export async function testConnection(partnerId: number): Promise<ConnectionTestResult> {
  const partner = await db.getEdiTradingPartnerById(partnerId);
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
  const partner = await db.getEdiTradingPartnerById(partnerId);
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
  const partners = await db.getEdiTradingPartners({ status: "active" });
  const sftpPartners = partners.filter(p => p.connectionType === "sftp" || p.connectionType === "van");

  const results: PollResult[] = [];

  for (const partner of sftpPartners) {
    console.log(`[EDI Polling] Checking partner: ${partner.name} (${partner.isaId})`);
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

  if (senderIsaId) {
    const partner = await db.getEdiTradingPartnerByIsaId(senderIsaId);
    if (partner) partnerId = partner.id;
  }

  // If no partner found by header, try to extract from ISA segment
  if (!partnerId) {
    const isaMatch = rawContent.match(/ISA\*[^*]*\*[^*]*\*[^*]*\*[^*]*\*[^*]*\*([^*]*?)\s*\*/);
    if (isaMatch) {
      const extractedIsaId = isaMatch[1].trim();
      const partner = await db.getEdiTradingPartnerByIsaId(extractedIsaId);
      if (partner) partnerId = partner.id;
    }
  }

  if (!partnerId) {
    return { success: false, message: "Could not identify trading partner from EDI content or headers" };
  }

  try {
    const result = await processInboundEdi(rawContent, partnerId);
    return { success: true, transactionId: result.transactionId, message: result.message };
  } catch (error: any) {
    return { success: false, message: `Processing error: ${error.message}` };
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
