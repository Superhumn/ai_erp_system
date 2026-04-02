/**
 * Natural Language Message Interpreter
 *
 * Interprets inbound natural-language messages (SMS, WhatsApp, Google Chat)
 * and maps them to ERP actions via the AI agent system.
 */

import { invokeLLM } from "./_core/llm";
import { triggerAgent } from "./agent/trigger";
import * as db from "./db";

// ============================================
// TYPES
// ============================================

export interface MessageInterpretation {
  intent: string;
  confidence: number;
  entities: Record<string, unknown>;
  summary: string;
  requiresConfirmation: boolean;
  suggestedResponse: string;
}

export interface MessageProcessingResult {
  success: boolean;
  interpretation: MessageInterpretation | null;
  agentRunId?: number;
  response: string;
  actionTaken?: string;
  error?: string;
}

export interface InboundMessage {
  channel: "sms" | "whatsapp" | "google_chat";
  senderIdentifier: string;
  rawMessage: string;
  senderName?: string;
  externalMessageId?: string;
  conversationId?: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// INTENT CLASSIFICATION
// ============================================

const SYSTEM_PROMPT = `You are an AI assistant for an Enterprise Resource Planning (ERP) system. Users send you natural-language messages via SMS, WhatsApp, or Google Chat. Your job is to interpret their intent and extract structured data.

You serve a CPG / manufacturing / supply chain company. The ERP manages:
- Sales orders, customers, invoices, payments
- Purchase orders, vendors, procurement
- Inventory across multiple warehouses
- Manufacturing (work orders, BOMs, production)
- Shipments, freight, logistics
- CRM contacts, deals, pipelines
- Finance: accounts, transactions, reconciliation

IMPORTANT RULES:
1. Be concise in responses — these go back to SMS/chat.
2. If the message is ambiguous, ask a clarifying question.
3. For actions that CREATE or MODIFY data, set requiresConfirmation: true.
4. For read-only queries, set requiresConfirmation: false.
5. Extract all relevant entities (names, amounts, quantities, dates, IDs).

Respond with a JSON object (no markdown, no code fences):
{
  "intent": "<intent_name>",
  "confidence": <0.0 to 1.0>,
  "entities": { <extracted key-value pairs> },
  "summary": "<one-line summary of what the user wants>",
  "requiresConfirmation": <true|false>,
  "suggestedResponse": "<friendly response to send back to the user>"
}

INTENT CATEGORIES:
- query_inventory: Check stock levels, inventory status
- query_orders: Look up order status, order details
- query_invoices: Invoice status, payment status, overdue invoices
- query_shipments: Shipment tracking, delivery status
- query_financials: Revenue, margins, financial summaries
- query_vendors: Vendor info, vendor performance
- query_customers: Customer info, order history
- query_production: Work order status, production schedule
- create_purchase_order: Create a new PO from natural language
- create_work_order: Create a production/manufacturing order
- create_invoice: Generate an invoice
- create_shipment: Log or create a shipment
- record_payment: Record a payment received
- update_order_status: Change an order's status
- update_inventory: Adjust inventory levels, transfers
- send_email: Send an email to a contact
- make_call: Initiate a phone call
- get_help: User needs help or doesn't know what to ask
- general_question: General question about the business
- unknown: Cannot determine intent`;

/**
 * Interpret a raw natural-language message into structured intent + entities.
 */
export async function interpretMessage(rawMessage: string): Promise<MessageInterpretation> {
  const result = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: rawMessage },
    ],
    maxTokens: 1024,
  });

  const responseText = typeof result.choices[0]?.message?.content === "string"
    ? result.choices[0].message.content
    : Array.isArray(result.choices[0]?.message?.content)
      ? result.choices[0].message.content
          .filter((c): c is { type: "text"; text: string } => typeof c === "object" && c.type === "text")
          .map(c => c.text)
          .join("")
      : "";

  try {
    // Strip markdown code fences if present
    const cleaned = responseText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      intent: parsed.intent || "unknown",
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0)),
      entities: parsed.entities || {},
      summary: parsed.summary || "",
      requiresConfirmation: parsed.requiresConfirmation ?? true,
      suggestedResponse: parsed.suggestedResponse || "I received your message and am processing it.",
    };
  } catch {
    return {
      intent: "unknown",
      confidence: 0,
      entities: {},
      summary: "Could not interpret message",
      requiresConfirmation: false,
      suggestedResponse: "Sorry, I couldn't understand that message. Try something like:\n• \"What's the inventory for SKU-123?\"\n• \"Create PO for 500kg flour from Vendor ABC\"\n• \"What invoices are overdue?\"",
    };
  }
}

// ============================================
// MESSAGE PROCESSING PIPELINE
// ============================================

/**
 * Full pipeline: interpret message → resolve user → execute via agent → return response.
 */
export async function processInboundMessage(
  message: InboundMessage,
  userId?: string,
  companyId?: number,
): Promise<MessageProcessingResult> {
  // Step 1: Interpret the message
  let interpretation: MessageInterpretation;
  try {
    interpretation = await interpretMessage(message.rawMessage);
  } catch (err) {
    return {
      success: false,
      interpretation: null,
      response: "Sorry, I'm having trouble processing your message right now. Please try again.",
      error: `Interpretation failed: ${(err as Error).message}`,
    };
  }

  // Step 2: Handle low-confidence or unknown intents
  if (interpretation.intent === "unknown" || interpretation.confidence < 0.3) {
    return {
      success: true,
      interpretation,
      response: interpretation.suggestedResponse,
    };
  }

  // Step 3: Handle help requests directly
  if (interpretation.intent === "get_help") {
    return {
      success: true,
      interpretation,
      response: formatHelpResponse(message.channel),
    };
  }

  // Step 4: For write operations that require confirmation, ask first
  if (interpretation.requiresConfirmation && !message.metadata?.confirmed) {
    return {
      success: true,
      interpretation,
      response: `${interpretation.suggestedResponse}\n\nReply YES to confirm or NO to cancel.`,
      actionTaken: "awaiting_confirmation",
    };
  }

  // Step 5: Execute the action via the AI agent
  if (!userId) {
    return {
      success: true,
      interpretation,
      response: interpretation.suggestedResponse,
      actionTaken: "response_only_no_user",
    };
  }

  try {
    const agentGoal = buildAgentGoal(interpretation, message.rawMessage);
    const agentResult = await triggerAgent({
      goal: agentGoal,
      userId,
      companyId,
      maxIterations: 10,
      context: {
        channel: message.channel,
        senderIdentifier: message.senderIdentifier,
        isMessagingGateway: true,
      },
    });

    // Extract the agent's final text response
    const agentResponse = extractAgentResponse(agentResult);

    return {
      success: agentResult.status === "completed",
      interpretation,
      agentRunId: agentResult.runId,
      response: agentResponse || interpretation.suggestedResponse,
      actionTaken: agentResult.summary || interpretation.summary,
      error: agentResult.error,
    };
  } catch (err) {
    return {
      success: false,
      interpretation,
      response: interpretation.suggestedResponse,
      error: `Agent execution failed: ${(err as Error).message}`,
    };
  }
}

// ============================================
// HELPERS
// ============================================

function buildAgentGoal(interpretation: MessageInterpretation, rawMessage: string): string {
  const entitySummary = Object.entries(interpretation.entities)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");

  return `The user sent a message via the messaging gateway: "${rawMessage}"

Detected intent: ${interpretation.intent}
Extracted entities: ${entitySummary || "none"}
Summary: ${interpretation.summary}

Please execute the appropriate action and provide a SHORT, concise response suitable for SMS/chat (max 300 chars if possible). Do not include markdown formatting.`;
}

function extractAgentResponse(agentResult: any): string {
  if (agentResult.summary) {
    return agentResult.summary;
  }

  // Walk the messages backwards to find the last assistant text
  const messages = agentResult.messages || [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant") {
      if (typeof msg.content === "string") return msg.content;
      if (Array.isArray(msg.content)) {
        const textBlocks = msg.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text);
        if (textBlocks.length > 0) return textBlocks.join("\n");
      }
    }
  }

  return "Your request has been processed.";
}

function formatHelpResponse(channel: string): string {
  return `Welcome to the ERP Assistant! You can message me to:

📦 Inventory: "What's the stock for [product]?"
📋 Orders: "Show me order #1234"
💰 Invoices: "What invoices are overdue?"
🚚 Shipments: "Track shipment #ABC123"
🏭 Production: "Create work order for 500 units of Widget A"
📝 POs: "Order 100kg flour from Vendor ABC"
💳 Payments: "Record $5000 payment from Acme Corp"
📊 Reports: "What's our revenue this month?"

Just type your request in plain English!`;
}

// ============================================
// CONFIRMATION HANDLING
// ============================================

const CONFIRM_WORDS = new Set(["yes", "y", "confirm", "ok", "sure", "do it", "proceed", "go ahead", "approved", "approve"]);
const DENY_WORDS = new Set(["no", "n", "cancel", "stop", "nevermind", "nvm", "abort", "deny"]);

/**
 * Check if a message is a confirmation/denial of a previous pending action.
 */
export function isConfirmationResponse(message: string): "confirm" | "deny" | null {
  const lower = message.trim().toLowerCase();
  if (CONFIRM_WORDS.has(lower)) return "confirm";
  if (DENY_WORDS.has(lower)) return "deny";
  return null;
}
