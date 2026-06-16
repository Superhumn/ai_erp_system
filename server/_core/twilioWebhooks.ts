import type { Express, Request, Response, NextFunction } from "express";
import twilio from "twilio";
import { eq, or } from "drizzle-orm";
import { ENV } from "./env";
import { getDb, createDocument } from "../db";
import { storagePut } from "../storage";
import {
  agentCallLogs,
  agentSmsLogs,
  crmContacts,
  crmInteractions,
  whatsappMessages,
} from "../../drizzle/schema";
import { mapTwilioSmsStatus } from "../agent/tools/adapters/sms";

type TwilioParams = Record<string, string>;

function buildFullUrl(req: Request): string {
  if (ENV.publicAppUrl) {
    return `${ENV.publicAppUrl.replace(/\/$/, "")}${req.originalUrl}`;
  }
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string) || req.get("host") || "";
  return `${proto}://${host}${req.originalUrl}`;
}

function makeSignatureMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!ENV.twilioAuthToken) {
      if (ENV.isProduction) {
        return res.status(403).json({ error: "Twilio not configured" });
      }
      return next();
    }
    const signature = req.headers["x-twilio-signature"] as string | undefined;
    if (!signature) {
      return res.status(401).json({ error: "Missing X-Twilio-Signature header" });
    }
    const url = buildFullUrl(req);
    const params = (req.body ?? {}) as TwilioParams;
    const isValid = twilio.validateRequest(ENV.twilioAuthToken, signature, url, params);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid Twilio signature" });
    }
    next();
  };
}

function mapTwilioCallStatus(status: string | undefined):
  | "initiated" | "ringing" | "in_progress" | "completed" | "failed" | "no_answer" | null {
  if (!status) return null;
  switch (status) {
    case "queued":
    case "initiated":
      return "initiated";
    case "ringing":
      return "ringing";
    case "in-progress":
      return "in_progress";
    case "completed":
      return "completed";
    case "no-answer":
      return "no_answer";
    case "busy":
    case "canceled":
    case "failed":
      return "failed";
    default:
      return null;
  }
}

function mapTwilioWhatsappStatus(status: string | undefined):
  | "pending" | "sent" | "delivered" | "read" | "failed" | null {
  if (!status) return null;
  switch (status) {
    case "accepted":
    case "queued":
    case "sending":
      return "pending";
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "undelivered":
    case "failed":
      return "failed";
    default:
      return null;
  }
}

// Twilio WhatsApp From/To arrive channel-prefixed, e.g. "whatsapp:+15551234567".
function stripWhatsappPrefix(value: string): string {
  return value.replace(/^whatsapp:/i, "");
}

// Twilio always delivers `From`/`To` in E.164. CRM data may have been entered
// with formatting (parens, spaces, dashes). Match both representations.
function normalizeToE164(phone: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 0) return null;
  if (phone.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

async function findCrmContactByPhone(db: any, phone: string) {
  if (!phone) return undefined;
  const e164 = normalizeToE164(phone);
  const candidates = e164 && e164 !== phone
    ? or(eq(crmContacts.phone, phone), eq(crmContacts.phone, e164))
    : eq(crmContacts.phone, phone);
  const [existing] = await db.select().from(crmContacts).where(candidates).limit(1);
  return existing;
}

async function findOrCreateInboundCrmContact(db: any, phone: string): Promise<number | undefined> {
  if (!phone) return undefined;
  const existing = await findCrmContactByPhone(db, phone);
  if (existing) return existing.id;
  const [created] = await db.insert(crmContacts).values({
    firstName: "Unknown",
    lastName: phone,
    fullName: `Unknown (${phone})`,
    phone,
    contactType: "lead",
    source: "manual",
  }).$returningId();
  return created.id;
}

async function findOrCreateWhatsappContact(db: any, waNumber: string): Promise<number | undefined> {
  if (!waNumber) return undefined;
  const e164 = normalizeToE164(waNumber);
  const match = e164 && e164 !== waNumber
    ? or(eq(crmContacts.whatsappNumber, waNumber), eq(crmContacts.whatsappNumber, e164), eq(crmContacts.phone, waNumber), eq(crmContacts.phone, e164))
    : or(eq(crmContacts.whatsappNumber, waNumber), eq(crmContacts.phone, waNumber));
  const [existing] = await db.select().from(crmContacts).where(match).limit(1);
  if (existing) {
    // Backfill the WhatsApp number if we matched on phone only.
    if (!existing.whatsappNumber) {
      await db.update(crmContacts).set({ whatsappNumber: e164 ?? waNumber }).where(eq(crmContacts.id, existing.id));
    }
    return existing.id;
  }
  const [created] = await db.insert(crmContacts).values({
    firstName: "Unknown",
    lastName: waNumber,
    fullName: `Unknown (${waNumber})`,
    phone: e164 ?? waNumber,
    whatsappNumber: e164 ?? waNumber,
    contactType: "lead",
    source: "manual",
  }).$returningId();
  return created.id;
}

function extFromMime(mime: string | undefined): string {
  if (!mime) return "bin";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime.includes("sheet")) return "xlsx";
  const slash = mime.split("/")[1];
  return slash ? slash.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin" : "bin";
}

// Download a WhatsApp media attachment from Twilio (auth-protected) and file it
// in the ERP documents store so it outlives Twilio's short-lived media URLs.
// Returns the durable stored URL (or undefined on failure). Best-effort: never
// throws — a media failure must not break inbound message capture.
async function importWhatsappMedia(
  waMsgId: number,
  mediaUrl: string,
  mediaType: string | undefined,
  fromNumber: string,
): Promise<string | undefined> {
  try {
    if (!ENV.twilioAccountSid || !ENV.twilioAuthToken) return undefined;
    const auth = Buffer.from(`${ENV.twilioAccountSid}:${ENV.twilioAuthToken}`).toString("base64");
    const resp = await fetch(mediaUrl, { headers: { Authorization: `Basic ${auth}` } });
    if (!resp.ok) {
      console.warn(`[Twilio Webhook] media fetch failed (${resp.status}) for msg ${waMsgId}`);
      return undefined;
    }
    const mime = resp.headers.get("content-type") || mediaType || "application/octet-stream";
    const buffer = Buffer.from(await resp.arrayBuffer());
    const filename = `whatsapp-${waMsgId}.${extFromMime(mime)}`;
    const fileKey = `documents/whatsapp/${waMsgId}-${filename}`;

    let fileUrl: string;
    try {
      fileUrl = (await storagePut(fileKey, buffer, mime)).url;
    } catch {
      // Storage not configured — fall back to an inline data URL.
      fileUrl = `data:${mime};base64,${buffer.toString("base64")}`;
    }

    await createDocument({
      name: filename,
      type: "other",
      referenceType: "whatsapp",
      referenceId: waMsgId,
      fileUrl,
      fileKey,
      fileSize: buffer.length,
      mimeType: mime,
      description: `Document received via WhatsApp from ${fromNumber}`,
    } as any);

    return fileUrl;
  } catch (err) {
    console.warn(`[Twilio Webhook] media import failed for msg ${waMsgId}:`, err);
    return undefined;
  }
}

const EMPTY_TWIML = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>";

export function registerTwilioWebhooks(app: Express): void {
  const verify = makeSignatureMiddleware();

  // Outbound (and optionally inbound, if configured in Twilio console) call status callback.
  app.post("/api/twilio/call-status", verify, async (req: Request, res: Response) => {
    try {
      const params = (req.body ?? {}) as TwilioParams;
      const callSid = params.CallSid;
      const callStatus = mapTwilioCallStatus(params.CallStatus);
      const duration = params.CallDuration ? Number(params.CallDuration) : undefined;
      const recordingUrl = params.RecordingUrl;

      if (!callSid) {
        return res.status(400).json({ error: "Missing CallSid" });
      }

      const db = await getDb();
      const update: Record<string, unknown> = {};
      if (callStatus) update.status = callStatus;
      if (duration !== undefined) update.duration = duration;
      if (recordingUrl) update.recordingUrl = recordingUrl;

      if (Object.keys(update).length > 0) {
        await db.update(agentCallLogs)
          .set(update)
          .where(eq(agentCallLogs.twilioCallSid, callSid));
      }

      res.status(200).json({ received: true });
    } catch (err) {
      console.error("[Twilio Webhook] call-status error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Outbound SMS status callback.
  app.post("/api/twilio/sms-status", verify, async (req: Request, res: Response) => {
    try {
      const params = (req.body ?? {}) as TwilioParams;
      const messageSid = params.MessageSid || params.SmsSid;
      const status = mapTwilioSmsStatus(params.MessageStatus || params.SmsStatus);
      const errorCode = params.ErrorCode;

      if (!messageSid) {
        return res.status(400).json({ error: "Missing MessageSid" });
      }

      const db = await getDb();
      const update: Record<string, unknown> = {};
      if (status) update.status = status;
      if (errorCode) update.errorCode = errorCode;

      if (Object.keys(update).length > 0) {
        await db.update(agentSmsLogs)
          .set(update)
          .where(eq(agentSmsLogs.twilioMessageSid, messageSid));
      }

      res.status(200).json({ received: true });
    } catch (err) {
      console.error("[Twilio Webhook] sms-status error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Inbound SMS — idempotent on Twilio's MessageSid (Twilio retries on 5xx/timeout).
  app.post("/api/twilio/sms/inbound", verify, async (req: Request, res: Response) => {
    try {
      const params = (req.body ?? {}) as TwilioParams;
      const from = params.From ?? "";
      const to = params.To ?? "";
      const body = params.Body ?? "";
      const messageSid = params.MessageSid || params.SmsSid;
      const numSegments = params.NumSegments ? Number(params.NumSegments) : undefined;

      const db = await getDb();

      if (messageSid) {
        const [dup] = await db.select().from(agentSmsLogs)
          .where(eq(agentSmsLogs.twilioMessageSid, messageSid))
          .limit(1);
        if (dup) {
          res.set("Content-Type", "text/xml");
          return res.status(200).send(EMPTY_TWIML);
        }
      }

      const crmContactId = await findOrCreateInboundCrmContact(db, from);

      let contactName = "Unknown";
      if (crmContactId) {
        const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, crmContactId)).limit(1);
        if (contact) contactName = contact.fullName ?? contact.firstName ?? "Unknown";
      }

      const [smsLog] = await db.insert(agentSmsLogs).values({
        contactType: "crm_contact",
        contactId: crmContactId ?? 0,
        contactName,
        phoneNumber: from,
        direction: "inbound",
        status: "received",
        body,
        twilioMessageSid: messageSid,
        numSegments,
      }).$returningId();

      if (crmContactId) {
        const [interaction] = await db.insert(crmInteractions).values({
          contactId: crmContactId,
          channel: "sms",
          interactionType: "received",
          subject: `Inbound SMS to ${to}`,
          content: body,
        }).$returningId();

        await db.update(agentSmsLogs)
          .set({ crmInteractionId: interaction.id })
          .where(eq(agentSmsLogs.id, smsLog.id));

        await db.update(crmContacts)
          .set({ lastRepliedAt: new Date() })
          .where(eq(crmContacts.id, crmContactId));
      }

      res.set("Content-Type", "text/xml");
      res.status(200).send(EMPTY_TWIML);
    } catch (err) {
      console.error("[Twilio Webhook] sms/inbound error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Inbound WhatsApp — idempotent on Twilio's MessageSid. Mirrors the SMS handler
  // but writes to whatsapp_messages and links the supplier/contact by number.
  app.post("/api/twilio/whatsapp/inbound", verify, async (req: Request, res: Response) => {
    try {
      const params = (req.body ?? {}) as TwilioParams;
      const from = stripWhatsappPrefix(params.From ?? "");
      const body = params.Body ?? "";
      const messageSid = params.MessageSid || params.SmsSid;
      const numMedia = params.NumMedia ? Number(params.NumMedia) : 0;
      const mediaUrl = numMedia > 0 ? params.MediaUrl0 : undefined;
      const mediaType = numMedia > 0 ? params.MediaContentType0 : undefined;

      const db = await getDb();
      if (!db) {
        res.set("Content-Type", "text/xml");
        return res.status(200).send(EMPTY_TWIML);
      }

      if (messageSid) {
        const [dup] = await db.select().from(whatsappMessages)
          .where(eq(whatsappMessages.messageId, messageSid))
          .limit(1);
        if (dup) {
          res.set("Content-Type", "text/xml");
          return res.status(200).send(EMPTY_TWIML);
        }
      }

      const contactId = await findOrCreateWhatsappContact(db, from);
      let contactName: string | undefined;
      if (contactId) {
        const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, contactId)).limit(1);
        if (contact) contactName = contact.fullName ?? contact.firstName ?? undefined;
      }

      const [waMsg] = await db.insert(whatsappMessages).values({
        contactId,
        messageId: messageSid,
        conversationId: `wa_${from}`,
        whatsappNumber: from,
        contactName,
        direction: "inbound",
        messageType: mediaUrl ? "document" : "text",
        content: body,
        mediaUrl,
        mediaType,
        status: "delivered",
        sentAt: new Date(),
      }).$returningId();

      if (contactId) {
        await db.insert(crmInteractions).values({
          contactId,
          channel: "whatsapp",
          interactionType: "received",
          subject: "Inbound WhatsApp",
          content: body,
          whatsappMessageId: waMsg.id,
        });
        await db.update(crmContacts)
          .set({ lastRepliedAt: new Date() })
          .where(eq(crmContacts.id, contactId));
      }

      // File any attached document into the ERP store in the background so the
      // webhook responds quickly. Repoints the message at the durable URL.
      if (mediaUrl) {
        void importWhatsappMedia(waMsg.id, mediaUrl, mediaType, from)
          .then((durable) => {
            if (durable) {
              return db.update(whatsappMessages)
                .set({ mediaUrl: durable })
                .where(eq(whatsappMessages.id, waMsg.id));
            }
          })
          .catch((e) => console.warn("[Twilio Webhook] media post-process failed:", e));
      }

      res.set("Content-Type", "text/xml");
      res.status(200).send(EMPTY_TWIML);
    } catch (err) {
      console.error("[Twilio Webhook] whatsapp/inbound error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Outbound WhatsApp status callback — attaches delivery/read state by MessageSid.
  app.post("/api/twilio/whatsapp/status", verify, async (req: Request, res: Response) => {
    try {
      const params = (req.body ?? {}) as TwilioParams;
      const messageSid = params.MessageSid || params.SmsSid;
      const status = mapTwilioWhatsappStatus(params.MessageStatus || params.SmsStatus);
      const errorMessage = params.ErrorMessage;

      if (!messageSid) {
        return res.status(400).json({ error: "Missing MessageSid" });
      }

      const db = await getDb();
      if (db && status) {
        const update: Record<string, unknown> = { status };
        const now = new Date();
        if (status === "sent") update.sentAt = now;
        if (status === "delivered") update.deliveredAt = now;
        if (status === "read") update.readAt = now;
        if (status === "failed" && errorMessage) update.failedReason = errorMessage;
        await db.update(whatsappMessages)
          .set(update)
          .where(eq(whatsappMessages.messageId, messageSid));
      }

      res.status(200).json({ received: true });
    } catch (err) {
      console.error("[Twilio Webhook] whatsapp/status error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Inbound voice — idempotent on CallSid; voicemail Record verb posts to /voice/recording.
  app.post("/api/twilio/voice/inbound", verify, async (req: Request, res: Response) => {
    try {
      const params = (req.body ?? {}) as TwilioParams;
      const from = params.From ?? "";
      const callSid = params.CallSid;

      const db = await getDb();

      if (callSid) {
        const [dup] = await db.select().from(agentCallLogs)
          .where(eq(agentCallLogs.twilioCallSid, callSid))
          .limit(1);
        if (dup) {
          res.set("Content-Type", "text/xml");
          return res.status(200).send(buildInboundVoiceTwiml());
        }
      }

      const crmContactId = await findOrCreateInboundCrmContact(db, from);

      let contactName = "Unknown";
      if (crmContactId) {
        const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, crmContactId)).limit(1);
        if (contact) contactName = contact.fullName ?? contact.firstName ?? "Unknown";
      }

      const [callLog] = await db.insert(agentCallLogs).values({
        contactType: "crm_contact",
        contactId: crmContactId ?? 0,
        contactName,
        phoneNumber: from,
        direction: "inbound",
        status: "in_progress",
        twilioCallSid: callSid,
      }).$returningId();

      if (crmContactId) {
        const [interaction] = await db.insert(crmInteractions).values({
          contactId: crmContactId,
          channel: "phone",
          interactionType: "call_received",
          subject: "Inbound call",
          content: `Inbound call from ${from}`,
        }).$returningId();

        await db.update(agentCallLogs)
          .set({ crmInteractionId: interaction.id })
          .where(eq(agentCallLogs.id, callLog.id));
      }

      res.set("Content-Type", "text/xml");
      res.status(200).send(buildInboundVoiceTwiml());
    } catch (err) {
      console.error("[Twilio Webhook] voice/inbound error:", err);
      res.set("Content-Type", "text/xml");
      res.status(500).send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Say>An error occurred. Goodbye.</Say><Hangup/></Response>");
    }
  });

  // Voicemail callback — fires when <Record> finishes (caller hangs up or maxLength reached).
  // We use it both to attach the recording URL and to mark the inbound call as completed.
  app.post("/api/twilio/voice/recording", verify, async (req: Request, res: Response) => {
    try {
      const params = (req.body ?? {}) as TwilioParams;
      const callSid = params.CallSid;
      const recordingUrl = params.RecordingUrl;
      const recordingDuration = params.RecordingDuration ? Number(params.RecordingDuration) : undefined;

      if (!callSid) {
        res.set("Content-Type", "text/xml");
        return res.status(400).send(EMPTY_TWIML);
      }

      const db = await getDb();
      const update: Record<string, unknown> = { status: "completed" };
      if (recordingUrl) update.recordingUrl = recordingUrl;
      if (recordingDuration !== undefined) update.duration = recordingDuration;

      await db.update(agentCallLogs)
        .set(update)
        .where(eq(agentCallLogs.twilioCallSid, callSid));

      res.set("Content-Type", "text/xml");
      res.status(200).send(EMPTY_TWIML);
    } catch (err) {
      console.error("[Twilio Webhook] voice/recording error:", err);
      res.set("Content-Type", "text/xml");
      res.status(500).send(EMPTY_TWIML);
    }
  });
}

function buildInboundVoiceTwiml(): string {
  const recordingAction = `${ENV.publicAppUrl.replace(/\/$/, "")}/api/twilio/voice/recording`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Thank you for calling Superhumn. Please leave a message after the tone.</Say>
  <Record maxLength="120" playBeep="true" action="${recordingAction}" method="POST" />
  <Say voice="Polly.Amy">We did not receive a message. Goodbye.</Say>
  <Hangup/>
</Response>`;
}
