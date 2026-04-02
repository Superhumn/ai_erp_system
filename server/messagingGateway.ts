/**
 * Messaging Gateway Service
 *
 * Handles sending and receiving messages across SMS (Twilio),
 * WhatsApp (Twilio), and Google Chat channels.
 */

import twilio from "twilio";
import { ENV } from "./_core/env";
import * as db from "./db";
import {
  processInboundMessage,
  isConfirmationResponse,
  type InboundMessage,
  type MessageProcessingResult,
} from "./nlMessageInterpreter";

// ============================================
// TYPES
// ============================================

export interface OutboundMessage {
  channel: "sms" | "whatsapp" | "google_chat";
  to: string;
  body: string;
  mediaUrl?: string;
}

export interface SendResult {
  success: boolean;
  externalMessageId?: string;
  error?: string;
}

export interface WebhookPayload {
  channel: "sms" | "whatsapp" | "google_chat";
  rawBody: any;
  headers: Record<string, string>;
}

// ============================================
// TWILIO CLIENT
// ============================================

function getTwilioClient(): twilio.Twilio | null {
  if (!ENV.twilioAccountSid || !ENV.twilioAuthToken) return null;
  return twilio(ENV.twilioAccountSid, ENV.twilioAuthToken);
}

// ============================================
// SEND MESSAGES
// ============================================

/**
 * Send a message via any supported channel.
 */
export async function sendMessage(msg: OutboundMessage): Promise<SendResult> {
  switch (msg.channel) {
    case "sms":
      return sendSms(msg.to, msg.body);
    case "whatsapp":
      return sendWhatsApp(msg.to, msg.body);
    case "google_chat":
      return sendGoogleChat(msg.to, msg.body);
    default:
      return { success: false, error: `Unsupported channel: ${msg.channel}` };
  }
}

async function sendSms(to: string, body: string): Promise<SendResult> {
  const client = getTwilioClient();
  if (!client) return { success: false, error: "Twilio not configured" };
  if (!ENV.twilioPhoneNumber) return { success: false, error: "TWILIO_PHONE_NUMBER not set" };

  try {
    const message = await client.messages.create({
      to,
      from: ENV.twilioPhoneNumber,
      body: truncateForSms(body),
    });
    return { success: true, externalMessageId: message.sid };
  } catch (err) {
    return { success: false, error: `SMS send failed: ${(err as Error).message}` };
  }
}

async function sendWhatsApp(to: string, body: string): Promise<SendResult> {
  const client = getTwilioClient();
  if (!client) return { success: false, error: "Twilio not configured" };

  const fromNumber = ENV.twilioWhatsappNumber || `whatsapp:${ENV.twilioPhoneNumber}`;
  if (!fromNumber || fromNumber === "whatsapp:") {
    return { success: false, error: "WhatsApp number not configured" };
  }

  // Ensure "whatsapp:" prefix
  const toWhatsApp = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

  try {
    const message = await client.messages.create({
      to: toWhatsApp,
      from: fromNumber,
      body,
    });
    return { success: true, externalMessageId: message.sid };
  } catch (err) {
    return { success: false, error: `WhatsApp send failed: ${(err as Error).message}` };
  }
}

async function sendGoogleChat(spaceOrWebhookUrl: string, body: string): Promise<SendResult> {
  // Google Chat supports webhook URLs for sending messages to spaces
  try {
    const isWebhookUrl = spaceOrWebhookUrl.startsWith("https://chat.googleapis.com/");

    if (isWebhookUrl) {
      const response = await fetch(spaceOrWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: body }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `Google Chat webhook failed: ${response.status} ${errText}` };
      }

      const data = await response.json();
      return { success: true, externalMessageId: data.name };
    }

    // For Google Chat API (service account), we'd use the Chat API
    // This requires google-auth-library and googleapis packages
    // For now, webhook URLs are the primary method
    return { success: false, error: "Google Chat API (non-webhook) not yet configured. Use a webhook URL." };
  } catch (err) {
    return { success: false, error: `Google Chat send failed: ${(err as Error).message}` };
  }
}

// ============================================
// RECEIVE & PROCESS MESSAGES
// ============================================

/**
 * Process an inbound message from any channel.
 * Resolves the sender identity, interprets via AI, executes, and responds.
 */
export async function handleInboundMessage(
  inbound: InboundMessage,
): Promise<MessageProcessingResult> {
  const startTime = Date.now();

  // 1. Resolve sender to a user
  const identity = await resolveIdentity(inbound.channel, inbound.senderIdentifier);
  const userId = identity?.userId?.toString();
  const companyId = identity?.companyId ?? undefined;

  // 2. Check if this is a confirmation of a previous pending action
  const confirmationType = isConfirmationResponse(inbound.rawMessage);
  if (confirmationType && identity) {
    const pendingAction = await getLastPendingAction(inbound.channel, inbound.senderIdentifier);
    if (pendingAction) {
      if (confirmationType === "confirm") {
        // Re-process the original message with confirmation flag
        const confirmedMessage: InboundMessage = {
          ...inbound,
          rawMessage: pendingAction.rawMessage,
          metadata: { ...(inbound.metadata || {}), confirmed: true },
        };
        const result = await processInboundMessage(confirmedMessage, userId, companyId);
        await logMessage(inbound, result, identity, Date.now() - startTime);
        return result;
      } else {
        const result: MessageProcessingResult = {
          success: true,
          interpretation: null,
          response: "Action cancelled.",
        };
        await logMessage(inbound, result, identity, Date.now() - startTime);
        return result;
      }
    }
  }

  // 3. Process normally through the NL interpreter
  const result = await processInboundMessage(inbound, userId, companyId);

  // 4. Log the message
  await logMessage(inbound, result, identity, Date.now() - startTime);

  // 5. Send the response back
  if (result.response) {
    await sendMessage({
      channel: inbound.channel,
      to: inbound.senderIdentifier,
      body: result.response,
    });
  }

  return result;
}

// ============================================
// WEBHOOK PARSERS
// ============================================

/**
 * Parse an inbound Twilio SMS webhook into our InboundMessage format.
 */
export function parseTwilioSmsWebhook(body: Record<string, string>): InboundMessage {
  return {
    channel: "sms",
    senderIdentifier: body.From || "",
    rawMessage: body.Body || "",
    senderName: body.FromCity ? `${body.FromCity}, ${body.FromState}` : undefined,
    externalMessageId: body.MessageSid || body.SmsSid,
    conversationId: body.From,
    metadata: {
      accountSid: body.AccountSid,
      numMedia: body.NumMedia,
      toNumber: body.To,
    },
  };
}

/**
 * Parse an inbound Twilio WhatsApp webhook into our InboundMessage format.
 */
export function parseTwilioWhatsAppWebhook(body: Record<string, string>): InboundMessage {
  return {
    channel: "whatsapp",
    senderIdentifier: body.From?.replace("whatsapp:", "") || "",
    rawMessage: body.Body || "",
    senderName: body.ProfileName || undefined,
    externalMessageId: body.MessageSid,
    conversationId: body.From?.replace("whatsapp:", ""),
    metadata: {
      accountSid: body.AccountSid,
      numMedia: body.NumMedia,
      whatsappFrom: body.From,
      profileName: body.ProfileName,
    },
  };
}

/**
 * Parse a Google Chat webhook event into our InboundMessage format.
 * Google Chat sends JSON events for MESSAGE, ADDED_TO_SPACE, etc.
 */
export function parseGoogleChatWebhook(event: any): InboundMessage | null {
  if (event.type !== "MESSAGE") return null;

  const message = event.message;
  const sender = event.user || message?.sender;
  const space = event.space;

  return {
    channel: "google_chat",
    senderIdentifier: sender?.name || sender?.email || "unknown",
    rawMessage: message?.argumentText || message?.text || "",
    senderName: sender?.displayName,
    externalMessageId: message?.name,
    conversationId: space?.name,
    metadata: {
      spaceType: space?.type,
      spaceName: space?.displayName,
      senderEmail: sender?.email,
      threadName: message?.thread?.name,
    },
  };
}

// ============================================
// IDENTITY RESOLUTION
// ============================================

interface ResolvedIdentity {
  userId: number;
  companyId?: number;
  displayName?: string;
}

async function resolveIdentity(
  channel: string,
  identifier: string,
): Promise<ResolvedIdentity | null> {
  try {
    const identities = await db.getMessagingIdentities({ channel, identifier });
    if (identities && identities.length > 0) {
      const identity = identities[0];
      return {
        userId: identity.userId,
        companyId: identity.companyId ?? undefined,
        displayName: identity.displayName ?? undefined,
      };
    }

    // Fallback: try to find a user by phone number for SMS/WhatsApp
    if (channel === "sms" || channel === "whatsapp") {
      const user = await db.getUserByPhone(identifier);
      if (user) {
        return {
          userId: user.id,
          companyId: (user as any).companyId ?? undefined,
          displayName: user.name ?? undefined,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ============================================
// MESSAGE LOGGING
// ============================================

async function logMessage(
  inbound: InboundMessage,
  result: MessageProcessingResult,
  identity: ResolvedIdentity | null,
  processingTimeMs: number,
): Promise<void> {
  try {
    await db.createMessagingLog({
      companyId: identity?.companyId ?? null,
      userId: identity?.userId ?? null,
      channel: inbound.channel,
      direction: "inbound",
      senderIdentifier: inbound.senderIdentifier,
      rawMessage: inbound.rawMessage,
      interpretedIntent: result.interpretation?.intent ?? null,
      interpretedEntities: result.interpretation?.entities
        ? JSON.stringify(result.interpretation.entities)
        : null,
      aiResponse: result.response,
      confidence: result.interpretation?.confidence?.toString() ?? null,
      agentRunId: result.agentRunId ?? null,
      actionTaken: result.actionTaken ?? null,
      actionSuccess: result.success,
      errorMessage: result.error ?? null,
      externalMessageId: inbound.externalMessageId ?? null,
      conversationId: inbound.conversationId ?? null,
      metadata: JSON.stringify({
        ...(inbound.metadata || {}),
        processingTimeMs,
        senderName: inbound.senderName,
      }),
      processedAt: new Date(),
    });
  } catch (err) {
    console.error("[MessagingGateway] Failed to log message:", err);
  }
}

async function getLastPendingAction(
  channel: string,
  senderIdentifier: string,
): Promise<{ rawMessage: string } | null> {
  try {
    const logs = await db.getMessagingLogs({
      channel,
      senderIdentifier,
      actionTaken: "awaiting_confirmation",
      limit: 1,
    });
    if (logs && logs.length > 0) {
      return { rawMessage: logs[0].rawMessage };
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================
// UTILITIES
// ============================================

function truncateForSms(text: string, maxLength = 1600): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}

/**
 * Validate a Twilio webhook signature.
 */
export function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
): boolean {
  if (!ENV.twilioAuthToken) return false;
  try {
    return twilio.validateRequest(ENV.twilioAuthToken, signature, url, params);
  } catch {
    return false;
  }
}

/**
 * Validate Google Chat webhook token.
 */
export function validateGoogleChatToken(token: string): boolean {
  if (!ENV.googleChatWebhookToken) return false;
  return token === ENV.googleChatWebhookToken;
}
