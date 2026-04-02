/**
 * Messaging Webhook Handlers
 *
 * Express route handlers for inbound messages from:
 * - Twilio SMS
 * - Twilio WhatsApp
 * - Google Chat
 */

import type { Express, Request, Response } from "express";
import {
  handleInboundMessage,
  parseTwilioSmsWebhook,
  parseTwilioWhatsAppWebhook,
  parseGoogleChatWebhook,
  validateTwilioSignature,
  validateGoogleChatToken,
} from "./messagingGateway";
import { ENV } from "./_core/env";

/**
 * Register all messaging webhook routes on the Express app.
 */
export function registerMessagingWebhooks(app: Express) {
  // ============================================
  // TWILIO SMS INBOUND WEBHOOK
  // ============================================
  // Configure in Twilio Console → Phone Number → Messaging → A Message Comes In → Webhook
  // URL: https://yourdomain.com/webhooks/messaging/sms
  app.post("/webhooks/messaging/sms", async (req: Request, res: Response) => {
    try {
      // Validate Twilio signature if configured
      if (ENV.twilioWebhookSecret || ENV.twilioAuthToken) {
        const signature = req.headers["x-twilio-signature"] as string;
        if (signature) {
          const url = `${ENV.publicAppUrl}/webhooks/messaging/sms`;
          const isValid = validateTwilioSignature(url, req.body, signature);
          if (!isValid) {
            console.warn("[SMS Webhook] Invalid Twilio signature");
            return res.status(403).send("<Response></Response>");
          }
        }
      }

      const inbound = parseTwilioSmsWebhook(req.body);

      if (!inbound.rawMessage) {
        // Empty message, just acknowledge
        return res.type("text/xml").send("<Response></Response>");
      }

      console.log(`[SMS Webhook] Received from ${inbound.senderIdentifier}: "${inbound.rawMessage.substring(0, 100)}"`);

      // Process asynchronously — respond to Twilio immediately with empty TwiML
      // The response will be sent back via the messaging gateway as a new message
      handleInboundMessage(inbound).catch((err) => {
        console.error("[SMS Webhook] Processing error:", err);
      });

      // Respond with empty TwiML (we send the reply separately)
      res.type("text/xml").send("<Response></Response>");
    } catch (error) {
      console.error("[SMS Webhook] Error:", error);
      res.type("text/xml").send("<Response></Response>");
    }
  });

  // ============================================
  // TWILIO WHATSAPP INBOUND WEBHOOK
  // ============================================
  // Configure in Twilio Console → WhatsApp Sandbox/Number → A Message Comes In → Webhook
  // URL: https://yourdomain.com/webhooks/messaging/whatsapp
  app.post("/webhooks/messaging/whatsapp", async (req: Request, res: Response) => {
    try {
      // Validate Twilio signature
      if (ENV.twilioWebhookSecret || ENV.twilioAuthToken) {
        const signature = req.headers["x-twilio-signature"] as string;
        if (signature) {
          const url = `${ENV.publicAppUrl}/webhooks/messaging/whatsapp`;
          const isValid = validateTwilioSignature(url, req.body, signature);
          if (!isValid) {
            console.warn("[WhatsApp Webhook] Invalid Twilio signature");
            return res.status(403).send("<Response></Response>");
          }
        }
      }

      const inbound = parseTwilioWhatsAppWebhook(req.body);

      if (!inbound.rawMessage) {
        return res.type("text/xml").send("<Response></Response>");
      }

      console.log(`[WhatsApp Webhook] Received from ${inbound.senderIdentifier}: "${inbound.rawMessage.substring(0, 100)}"`);

      // Process asynchronously
      handleInboundMessage(inbound).catch((err) => {
        console.error("[WhatsApp Webhook] Processing error:", err);
      });

      res.type("text/xml").send("<Response></Response>");
    } catch (error) {
      console.error("[WhatsApp Webhook] Error:", error);
      res.type("text/xml").send("<Response></Response>");
    }
  });

  // ============================================
  // GOOGLE CHAT BOT WEBHOOK
  // ============================================
  // Configure in Google Cloud Console → Chat API → Bot URL
  // URL: https://yourdomain.com/webhooks/messaging/google-chat
  app.post("/webhooks/messaging/google-chat", async (req: Request, res: Response) => {
    try {
      // Validate Google Chat token if configured
      const token = req.headers["authorization"]?.replace("Bearer ", "") ||
                    req.query.token as string;
      if (ENV.googleChatWebhookToken && token) {
        if (!validateGoogleChatToken(token)) {
          console.warn("[Google Chat Webhook] Invalid token");
          return res.status(403).json({ error: "Invalid token" });
        }
      }

      const event = req.body;

      // Handle different event types
      switch (event.type) {
        case "ADDED_TO_SPACE": {
          // Bot was added to a space — send welcome message
          return res.json({
            text: "Hello! I'm the ERP Assistant. Send me natural language commands to interact with your ERP system.\n\nTry: \"What's our inventory for [product]?\" or \"Create a PO for 100kg flour from Vendor ABC\"",
          });
        }

        case "REMOVED_FROM_SPACE": {
          // Bot was removed — just acknowledge
          console.log("[Google Chat Webhook] Bot removed from space:", event.space?.displayName);
          return res.json({});
        }

        case "MESSAGE": {
          const inbound = parseGoogleChatWebhook(event);
          if (!inbound || !inbound.rawMessage) {
            return res.json({ text: "I received an empty message. How can I help?" });
          }

          console.log(`[Google Chat Webhook] Received from ${inbound.senderName || inbound.senderIdentifier}: "${inbound.rawMessage.substring(0, 100)}"`);

          // For Google Chat, we can respond synchronously since the API expects a response
          const result = await handleInboundMessageSync(inbound);
          return res.json({ text: result.response });
        }

        case "CARD_CLICKED": {
          // Handle interactive card clicks if needed
          return res.json({ text: "Button action received." });
        }

        default: {
          console.log("[Google Chat Webhook] Unknown event type:", event.type);
          return res.json({});
        }
      }
    } catch (error) {
      console.error("[Google Chat Webhook] Error:", error);
      res.status(500).json({ text: "Sorry, something went wrong processing your request." });
    }
  });

  console.log("[Messaging] Webhook endpoints registered: /webhooks/messaging/sms, /webhooks/messaging/whatsapp, /webhooks/messaging/google-chat");
}

/**
 * Synchronous version of handleInboundMessage for Google Chat (which expects a response body).
 * Does NOT send the reply via sendMessage — instead returns it for the HTTP response.
 */
async function handleInboundMessageSync(inbound: ReturnType<typeof parseGoogleChatWebhook>) {
  if (!inbound) {
    return { success: false, response: "Could not parse your message." };
  }

  const { processInboundMessage } = await import("./nlMessageInterpreter");
  const db = await import("./db");

  // Resolve identity
  const identities = await db.getMessagingIdentities({
    channel: "google_chat",
    identifier: inbound.senderIdentifier,
  });
  const userId = identities?.[0]?.userId?.toString();
  const companyId = identities?.[0]?.companyId ?? undefined;

  // Process
  const result = await processInboundMessage(inbound, userId, companyId);

  // Log
  try {
    await db.createMessagingLog({
      companyId: companyId ?? null,
      userId: identities?.[0]?.userId ?? null,
      channel: "google_chat",
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
      processedAt: new Date(),
    });
  } catch (err) {
    console.error("[Google Chat] Failed to log message:", err);
  }

  return {
    success: result.success,
    response: result.response || "Your request has been processed.",
  };
}
