/**
 * Quote Audit Service
 * Immutable audit trail for RFQ lifecycle events.
 * - Quote snapshots with content hashes (SHA-256 chain)
 * - Email thread linkage
 * - Rule/weight version tracking
 * - Approval decision records
 */

import * as crypto from "crypto";
import type { CanonicalQuote } from "./quoteNormalizer";
import type { ScoringResult, ScoringWeights } from "./quoteScoringEngine";

// ============================================
// AUDIT EVENT TYPES
// ============================================

export type AuditEventType =
  | "rfq_created"
  | "rfq_sent"
  | "rfq_reminder_sent"
  | "quote_received"
  | "quote_parsed"
  | "quote_normalized"
  | "quote_validation_failed"
  | "clarification_requested"
  | "clarification_received"
  | "scoring_completed"
  | "approval_auto"
  | "approval_requested"
  | "approval_granted"
  | "approval_rejected"
  | "po_generated"
  | "po_sent"
  | "vendor_confirmed"
  | "booking_completed"
  | "exception_raised"
  | "manual_override";

export interface AuditEvent {
  id: string;
  timestamp: string;
  eventType: AuditEventType;
  rfqId: string;
  quoteId?: number;
  vendorId?: string;
  actorType: "system" | "agent" | "human";
  actorId: string;
  data: Record<string, any>;
  contentHash: string;
  previousHash: string;
  snapshotId?: string;
}

export interface QuoteSnapshot {
  id: string;
  timestamp: string;
  rfqId: string;
  quoteId: number;
  vendorId: string;
  canonicalQuote: CanonicalQuote;
  rawSource: {
    type: "email" | "portal" | "phone" | "manual";
    emailThreadId?: string;
    rawContent?: string;
    attachmentHashes?: string[];
  };
  contentHash: string;
}

export interface ScoringSnapshot {
  id: string;
  timestamp: string;
  rfqId: string;
  scoringResult: ScoringResult;
  weightsVersion: string;
  weights: ScoringWeights;
  contentHash: string;
}

export interface ApprovalRecord {
  id: string;
  timestamp: string;
  rfqId: string;
  quoteId: number;
  vendorId: string;
  approvalType: "auto" | "manual";
  decision: "approved" | "rejected";
  decidedBy: string;
  reason: string;
  amount: number;
  currency: string;
  scoringSnapshotId: string;
  quoteSnapshotId: string;
  contentHash: string;
}

// ============================================
// HASH CHAIN
// ============================================

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function generateId(): string {
  return `aud_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
}

// ============================================
// IN-MEMORY AUDIT STORE
// (In production, backed by append-only DB table or event store)
// ============================================

export class AuditStore {
  private events: AuditEvent[] = [];
  private snapshots: Map<string, QuoteSnapshot> = new Map();
  private scoringSnapshots: Map<string, ScoringSnapshot> = new Map();
  private approvalRecords: Map<string, ApprovalRecord> = new Map();
  private lastHash: string = "0000000000000000000000000000000000000000000000000000000000000000";
  private weightsVersion: string = "1.0.0";

  getLastHash(): string {
    return this.lastHash;
  }

  setWeightsVersion(version: string): void {
    this.weightsVersion = version;
  }

  // ---- Events ----

  recordEvent(params: {
    eventType: AuditEventType;
    rfqId: string;
    quoteId?: number;
    vendorId?: string;
    actorType: "system" | "agent" | "human";
    actorId: string;
    data: Record<string, any>;
    snapshotId?: string;
  }): AuditEvent {
    const id = generateId();
    const timestamp = new Date().toISOString();
    const previousHash = this.lastHash;

    const payload = JSON.stringify({
      id,
      timestamp,
      ...params,
      previousHash,
    });
    const contentHash = sha256(payload);

    const event: AuditEvent = {
      id,
      timestamp,
      eventType: params.eventType,
      rfqId: params.rfqId,
      quoteId: params.quoteId,
      vendorId: params.vendorId,
      actorType: params.actorType,
      actorId: params.actorId,
      data: params.data,
      contentHash,
      previousHash,
      snapshotId: params.snapshotId,
    };

    this.events.push(event);
    this.lastHash = contentHash;
    return event;
  }

  // ---- Quote Snapshots ----

  createQuoteSnapshot(params: {
    rfqId: string;
    quoteId: number;
    vendorId: string;
    canonicalQuote: CanonicalQuote;
    rawSource: QuoteSnapshot["rawSource"];
  }): QuoteSnapshot {
    const id = generateId();
    const timestamp = new Date().toISOString();
    const contentHash = sha256(JSON.stringify({
      id, timestamp, ...params,
    }));

    // Hash attachments if present
    const attachmentHashes = params.rawSource.attachmentHashes || [];

    const snapshot: QuoteSnapshot = {
      id,
      timestamp,
      rfqId: params.rfqId,
      quoteId: params.quoteId,
      vendorId: params.vendorId,
      canonicalQuote: params.canonicalQuote,
      rawSource: {
        ...params.rawSource,
        attachmentHashes,
      },
      contentHash,
    };

    this.snapshots.set(id, snapshot);

    // Also record as event
    this.recordEvent({
      eventType: "quote_normalized",
      rfqId: params.rfqId,
      quoteId: params.quoteId,
      vendorId: params.vendorId,
      actorType: "system",
      actorId: "quote_normalizer",
      data: {
        confidence: params.canonicalQuote.confidence,
        gaps: params.canonicalQuote.extractionGaps,
        currency: params.canonicalQuote.currency,
        unitPrice: params.canonicalQuote.unitPrice,
      },
      snapshotId: id,
    });

    return snapshot;
  }

  // ---- Scoring Snapshots ----

  createScoringSnapshot(params: {
    rfqId: string;
    scoringResult: ScoringResult;
    weights: ScoringWeights;
  }): ScoringSnapshot {
    const id = generateId();
    const timestamp = new Date().toISOString();
    const contentHash = sha256(JSON.stringify({
      id, timestamp, ...params, weightsVersion: this.weightsVersion,
    }));

    const snapshot: ScoringSnapshot = {
      id,
      timestamp,
      rfqId: params.rfqId,
      scoringResult: params.scoringResult,
      weightsVersion: this.weightsVersion,
      weights: params.weights,
      contentHash,
    };

    this.scoringSnapshots.set(id, snapshot);

    this.recordEvent({
      eventType: "scoring_completed",
      rfqId: params.rfqId,
      actorType: "system",
      actorId: "scoring_engine",
      data: {
        weightsVersion: this.weightsVersion,
        bestQuoteId: params.scoringResult.bestQuoteId,
        quoteCount: params.scoringResult.quotes.length,
        autoApprovalEligible: params.scoringResult.autoApprovalEligible,
      },
      snapshotId: id,
    });

    return snapshot;
  }

  // ---- Approval Records ----

  recordApproval(params: {
    rfqId: string;
    quoteId: number;
    vendorId: string;
    approvalType: "auto" | "manual";
    decision: "approved" | "rejected";
    decidedBy: string;
    reason: string;
    amount: number;
    currency: string;
    scoringSnapshotId: string;
    quoteSnapshotId: string;
  }): ApprovalRecord {
    const id = generateId();
    const timestamp = new Date().toISOString();
    const contentHash = sha256(JSON.stringify({ id, timestamp, ...params }));

    const record: ApprovalRecord = {
      id,
      timestamp,
      ...params,
      contentHash,
    };

    this.approvalRecords.set(id, record);

    this.recordEvent({
      eventType: params.approvalType === "auto" ? "approval_auto" : (params.decision === "approved" ? "approval_granted" : "approval_rejected"),
      rfqId: params.rfqId,
      quoteId: params.quoteId,
      vendorId: params.vendorId,
      actorType: params.approvalType === "auto" ? "system" : "human",
      actorId: params.decidedBy,
      data: {
        decision: params.decision,
        reason: params.reason,
        amount: params.amount,
        currency: params.currency,
      },
    });

    return record;
  }

  // ---- Queries ----

  getEventsForRfq(rfqId: string): AuditEvent[] {
    return this.events.filter(e => e.rfqId === rfqId);
  }

  getEventsForQuote(quoteId: number): AuditEvent[] {
    return this.events.filter(e => e.quoteId === quoteId);
  }

  getSnapshot(snapshotId: string): QuoteSnapshot | undefined {
    return this.snapshots.get(snapshotId);
  }

  getScoringSnapshot(snapshotId: string): ScoringSnapshot | undefined {
    return this.scoringSnapshots.get(snapshotId);
  }

  getApprovalRecord(recordId: string): ApprovalRecord | undefined {
    return this.approvalRecords.get(recordId);
  }

  getApprovalsByRfq(rfqId: string): ApprovalRecord[] {
    return Array.from(this.approvalRecords.values()).filter(r => r.rfqId === rfqId);
  }

  getAllEvents(): AuditEvent[] {
    return [...this.events];
  }

  // ---- Chain Verification ----

  verifyChainIntegrity(): { valid: boolean; brokenAt?: number; error?: string } {
    let expectedPreviousHash = "0000000000000000000000000000000000000000000000000000000000000000";

    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i];

      if (event.previousHash !== expectedPreviousHash) {
        return {
          valid: false,
          brokenAt: i,
          error: `Chain broken at event ${i} (${event.id}): expected previousHash ${expectedPreviousHash}, got ${event.previousHash}`,
        };
      }

      expectedPreviousHash = event.contentHash;
    }

    return { valid: true };
  }

  // ---- Export for persistence ----

  exportAll(): {
    events: AuditEvent[];
    snapshots: QuoteSnapshot[];
    scoringSnapshots: ScoringSnapshot[];
    approvalRecords: ApprovalRecord[];
  } {
    return {
      events: [...this.events],
      snapshots: Array.from(this.snapshots.values()),
      scoringSnapshots: Array.from(this.scoringSnapshots.values()),
      approvalRecords: Array.from(this.approvalRecords.values()),
    };
  }
}

// Singleton instance
export const auditStore = new AuditStore();

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

export function auditRfqCreated(rfqId: string, actorId: string, data: Record<string, any>): AuditEvent {
  return auditStore.recordEvent({
    eventType: "rfq_created",
    rfqId,
    actorType: "agent",
    actorId,
    data,
  });
}

export function auditRfqSent(rfqId: string, vendorId: string, emailData: Record<string, any>): AuditEvent {
  return auditStore.recordEvent({
    eventType: "rfq_sent",
    rfqId,
    vendorId,
    actorType: "system",
    actorId: "email_sender",
    data: emailData,
  });
}

export function auditQuoteReceived(rfqId: string, quoteId: number, vendorId: string, source: string): AuditEvent {
  return auditStore.recordEvent({
    eventType: "quote_received",
    rfqId,
    quoteId,
    vendorId,
    actorType: "system",
    actorId: "inbox_scanner",
    data: { source },
  });
}

export function auditPoGenerated(rfqId: string, quoteId: number, vendorId: string, poData: Record<string, any>): AuditEvent {
  return auditStore.recordEvent({
    eventType: "po_generated",
    rfqId,
    quoteId,
    vendorId,
    actorType: "system",
    actorId: "booking_agent",
    data: poData,
  });
}

export function auditException(rfqId: string, quoteId: number | undefined, message: string, details: Record<string, any>): AuditEvent {
  return auditStore.recordEvent({
    eventType: "exception_raised",
    rfqId,
    quoteId,
    actorType: "system",
    actorId: "exception_handler",
    data: { message, ...details },
  });
}
