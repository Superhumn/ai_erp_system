import { invokeLLM, type Message } from "./_core/llm";
import { getDb } from "./db";
import {
  aiPhoneCalls,
  aiPhoneCallLogs,
  aiPhoneCallPlaybooks,
  vendors,
  customers,
  shipments,
  purchaseOrders,
  orders,
} from "../drizzle/schema";
import { eq, and, desc, sql, gte, isNull } from "drizzle-orm";
import { ENV } from "./_core/env";

// ============================================
// AI PHONE CALL SERVICE
// Autonomous phone calls for vendor/customer service
// ============================================

export interface PhoneCallRequest {
  callType: string;
  targetCompany: string;
  targetPhoneNumber?: string;
  targetDepartment?: string;
  subject: string;
  objective: string;
  context?: Record<string, any>;
  relatedEntityType?: string;
  relatedEntityId?: number;
  vendorId?: number;
  customerId?: number;
  shipmentId?: number;
  orderId?: number;
  playbookId?: string;
  priority?: string;
  scheduledFor?: Date;
  requiresApproval?: boolean;
  createdBy?: number;
}

export interface PhoneCallResult {
  success: boolean;
  callId: number;
  callNumber: string;
  status: string;
  message: string;
  outcome?: string;
  resolution?: string;
  referenceNumber?: string;
  transcript?: string;
  summary?: string;
  followupActions?: string[];
  error?: string;
}

// ============================================
// CALL CREATION & MANAGEMENT
// ============================================

/**
 * Create a new AI phone call task
 */
export async function createPhoneCall(request: PhoneCallRequest): Promise<PhoneCallResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Generate call number
  const callNumber = `CALL-${Date.now().toString(36).toUpperCase()}`;

  // Look up playbook if specified or try to find one based on target company
  let playbook = null;
  if (request.playbookId) {
    const [pb] = await db
      .select()
      .from(aiPhoneCallPlaybooks)
      .where(eq(aiPhoneCallPlaybooks.playbookKey, request.playbookId));
    playbook = pb;
  } else {
    // Try to auto-match a playbook
    const playbooks = await db.select().from(aiPhoneCallPlaybooks).where(eq(aiPhoneCallPlaybooks.isActive, true));
    playbook = playbooks.find(
      (p) => p.targetCompany.toLowerCase() === request.targetCompany.toLowerCase()
    ) || null;
  }

  // Use playbook phone number if no number specified
  const targetPhoneNumber = request.targetPhoneNumber || playbook?.phoneNumber || null;

  // Gather context from related entities
  const enrichedContext = await enrichCallContext(db, request);

  // Generate call script using AI
  const callScript = await generateCallScript({
    callType: request.callType,
    targetCompany: request.targetCompany,
    targetDepartment: request.targetDepartment || playbook?.department || undefined,
    subject: request.subject,
    objective: request.objective,
    context: { ...request.context, ...enrichedContext },
    playbook,
  });

  // Create the phone call record
  const [call] = await db
    .insert(aiPhoneCalls)
    .values({
      callNumber,
      callType: request.callType as any,
      direction: "outbound",
      status: request.requiresApproval !== false ? "queued" : "preparing",
      priority: (request.priority as any) || "medium",
      targetCompany: request.targetCompany,
      targetPhoneNumber,
      targetDepartment: request.targetDepartment || playbook?.department,
      subject: request.subject,
      objective: request.objective,
      context: JSON.stringify({ ...request.context, ...enrichedContext }),
      relatedEntityType: request.relatedEntityType,
      relatedEntityId: request.relatedEntityId,
      vendorId: request.vendorId,
      customerId: request.customerId,
      shipmentId: request.shipmentId,
      orderId: request.orderId,
      playbookId: request.playbookId || playbook?.playbookKey,
      callScript: JSON.stringify(callScript),
      requiredInfo: JSON.stringify(callScript.requiredInfo || []),
      requiresApproval: request.requiresApproval !== false,
      scheduledFor: request.scheduledFor,
      createdBy: request.createdBy,
    })
    .$returningId();

  // Log the creation
  await db.insert(aiPhoneCallLogs).values({
    phoneCallId: call.id,
    eventType: "call_queued",
    status: "info",
    message: `Phone call created: ${request.subject} to ${request.targetCompany}`,
    details: JSON.stringify({
      callType: request.callType,
      objective: request.objective,
      hasPlaybook: !!playbook,
      requiresApproval: request.requiresApproval !== false,
    }),
  });

  return {
    success: true,
    callId: call.id,
    callNumber,
    status: request.requiresApproval !== false ? "queued" : "preparing",
    message: request.requiresApproval !== false
      ? `Phone call queued and awaiting approval. Call ${callNumber} to ${request.targetCompany}.`
      : `Phone call is being prepared. Call ${callNumber} to ${request.targetCompany}.`,
  };
}

/**
 * Enrich the call context with data from related entities
 */
async function enrichCallContext(
  db: any,
  request: PhoneCallRequest
): Promise<Record<string, any>> {
  const context: Record<string, any> = {};

  if (request.vendorId) {
    const [vendor] = await db.select().from(vendors).where(eq(vendors.id, request.vendorId));
    if (vendor) {
      context.vendor = {
        name: vendor.name,
        contactName: vendor.contactName,
        email: vendor.email,
        phone: vendor.phone,
        accountNumber: vendor.accountNumber,
      };
    }
  }

  if (request.customerId) {
    const [customer] = await db.select().from(customers).where(eq(customers.id, request.customerId));
    if (customer) {
      context.customer = {
        name: customer.name,
        contactName: customer.contactName,
        email: customer.email,
        phone: customer.phone,
      };
    }
  }

  if (request.shipmentId) {
    const [shipment] = await db.select().from(shipments).where(eq(shipments.id, request.shipmentId));
    if (shipment) {
      context.shipment = {
        trackingNumber: shipment.trackingNumber,
        carrier: shipment.carrier,
        status: shipment.status,
        origin: shipment.origin,
        destination: shipment.destination,
        estimatedDelivery: shipment.estimatedDelivery,
      };
    }
  }

  if (request.orderId) {
    const [order] = await db.select().from(orders).where(eq(orders.id, request.orderId));
    if (order) {
      context.order = {
        orderNumber: order.orderNumber,
        status: order.status,
        totalAmount: order.totalAmount,
      };
    }
  }

  return context;
}

// ============================================
// AI CALL SCRIPT GENERATION
// ============================================

interface ScriptGenerationParams {
  callType: string;
  targetCompany: string;
  targetDepartment?: string;
  subject: string;
  objective: string;
  context: Record<string, any>;
  playbook: any;
}

interface CallScript {
  opening: string;
  ivrNavigation: Array<{ step: number; instruction: string; expectedPrompt: string; action: string }>;
  mainObjective: string;
  talkingPoints: string[];
  requiredInfo: string[];
  informationToGather: string[];
  escalationTriggers: string[];
  closing: string;
  fallbackResponses: Record<string, string>;
}

async function generateCallScript(params: ScriptGenerationParams): Promise<CallScript> {
  const { callType, targetCompany, targetDepartment, subject, objective, context, playbook } = params;

  const playbookContext = playbook
    ? `
Use this playbook as a guide:
- IVR Instructions: ${playbook.ivrInstructions || "Navigate through the automated menu to reach the right department."}
- Opening: ${playbook.openingScript || "Introduce yourself and state the reason for your call."}
- Typical Questions: ${playbook.typicalQuestions || "Be prepared for standard verification questions."}
- Escalation Triggers: ${playbook.escalationTriggers || "Escalate if the representative cannot resolve the issue."}
`
    : "";

  const contextSummary = Object.entries(context)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an expert AI call preparation assistant for a business ERP system. Generate a detailed call script for an AI agent that will make an autonomous phone call. The script should be professional, efficient, and designed to achieve the stated objective.

The AI agent will use speech-to-text and text-to-speech to handle the call. It needs clear instructions for:
1. Navigating IVR (automated phone menus)
2. Identifying itself and the purpose of the call
3. Providing necessary account/reference information
4. Achieving the stated objective
5. Gathering any required information
6. Knowing when to escalate to a human operator

Respond in JSON format.`,
      },
      {
        role: "user",
        content: `Generate a call script for the following scenario:

Call Type: ${callType}
Target Company: ${targetCompany}
Department: ${targetDepartment || "General Customer Service"}
Subject: ${subject}
Objective: ${objective}

Business Context:
${contextSummary}
${playbookContext}

Generate a JSON call script with these fields:
- opening: string (how to introduce yourself)
- ivrNavigation: array of {step, instruction, expectedPrompt, action}
- mainObjective: string (clear statement of what to accomplish)
- talkingPoints: string[] (key points to communicate)
- requiredInfo: string[] (information we need to provide, like account numbers)
- informationToGather: string[] (what we need to get from the call)
- escalationTriggers: string[] (when to hand off to a human)
- closing: string (how to end the call)
- fallbackResponses: object with common scenarios and responses`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "call_script",
        strict: true,
        schema: {
          type: "object",
          properties: {
            opening: { type: "string" },
            ivrNavigation: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  step: { type: "number" },
                  instruction: { type: "string" },
                  expectedPrompt: { type: "string" },
                  action: { type: "string" },
                },
                required: ["step", "instruction", "expectedPrompt", "action"],
                additionalProperties: false,
              },
            },
            mainObjective: { type: "string" },
            talkingPoints: { type: "array", items: { type: "string" } },
            requiredInfo: { type: "array", items: { type: "string" } },
            informationToGather: { type: "array", items: { type: "string" } },
            escalationTriggers: { type: "array", items: { type: "string" } },
            closing: { type: "string" },
            fallbackResponses: {
              type: "object",
              additionalProperties: { type: "string" },
            },
          },
          required: [
            "opening",
            "ivrNavigation",
            "mainObjective",
            "talkingPoints",
            "requiredInfo",
            "informationToGather",
            "escalationTriggers",
            "closing",
            "fallbackResponses",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0].message.content;
  return JSON.parse(typeof content === "string" ? content : "{}");
}

// ============================================
// CALL EXECUTION (Twilio Integration)
// ============================================

/**
 * Execute a phone call using Twilio
 * This initiates the outbound call and sets up the webhook for call handling
 */
export async function executePhoneCall(callId: number): Promise<PhoneCallResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [call] = await db.select().from(aiPhoneCalls).where(eq(aiPhoneCalls.id, callId));
  if (!call) throw new Error("Phone call not found");

  if (call.status !== "preparing" && call.status !== "queued") {
    throw new Error(`Cannot execute call in ${call.status} state`);
  }

  if (!call.targetPhoneNumber) {
    // Try to look up playbook phone number
    if (call.playbookId) {
      const [playbook] = await db
        .select()
        .from(aiPhoneCallPlaybooks)
        .where(eq(aiPhoneCallPlaybooks.playbookKey, call.playbookId));
      if (playbook?.phoneNumber) {
        await db.update(aiPhoneCalls)
          .set({ targetPhoneNumber: playbook.phoneNumber })
          .where(eq(aiPhoneCalls.id, callId));
      } else {
        return {
          success: false,
          callId,
          callNumber: call.callNumber || "",
          status: "failed",
          message: "No phone number available for this call",
          error: "Missing target phone number and no playbook phone number found",
        };
      }
    } else {
      return {
        success: false,
        callId,
        callNumber: call.callNumber || "",
        status: "failed",
        message: "No phone number available for this call",
        error: "Missing target phone number",
      };
    }
  }

  // Check Twilio configuration
  const twilioAccountSid = ENV.twilioAccountSid;
  const twilioAuthToken = ENV.twilioAuthToken;
  const twilioPhoneNumber = ENV.twilioPhoneNumber;

  if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
    // In development/demo mode, simulate the call
    return simulatePhoneCall(callId, call);
  }

  // Update status to in_progress
  await db
    .update(aiPhoneCalls)
    .set({
      status: "in_progress",
      startedAt: new Date(),
      fromPhoneNumber: twilioPhoneNumber,
    })
    .where(eq(aiPhoneCalls.id, callId));

  await db.insert(aiPhoneCallLogs).values({
    phoneCallId: callId,
    eventType: "call_started",
    status: "info",
    message: `Initiating outbound call to ${call.targetCompany} at ${call.targetPhoneNumber}`,
  });

  try {
    // Make the Twilio API call
    const callbackUrl = `${ENV.publicAppUrl}/api/phone-call/webhook/${callId}`;

    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          To: call.targetPhoneNumber!,
          From: twilioPhoneNumber,
          Url: callbackUrl,
          StatusCallback: `${ENV.publicAppUrl}/api/phone-call/status/${callId}`,
          Record: "true",
          RecordingStatusCallback: `${ENV.publicAppUrl}/api/phone-call/recording/${callId}`,
        }),
      }
    );

    if (!twilioResponse.ok) {
      const errorText = await twilioResponse.text();
      throw new Error(`Twilio API error: ${twilioResponse.status} ${errorText}`);
    }

    const twilioData = await twilioResponse.json();

    // Store the Twilio Call SID
    await db
      .update(aiPhoneCalls)
      .set({ callSid: twilioData.sid })
      .where(eq(aiPhoneCalls.id, callId));

    await db.insert(aiPhoneCallLogs).values({
      phoneCallId: callId,
      eventType: "call_started",
      status: "success",
      message: `Call connected via Twilio (SID: ${twilioData.sid})`,
      details: JSON.stringify({ twilioSid: twilioData.sid }),
    });

    return {
      success: true,
      callId,
      callNumber: call.callNumber || "",
      status: "in_progress",
      message: `Call initiated to ${call.targetCompany}. The AI agent is handling the call.`,
    };
  } catch (error: any) {
    await db
      .update(aiPhoneCalls)
      .set({ status: "failed", lastError: error.message })
      .where(eq(aiPhoneCalls.id, callId));

    await db.insert(aiPhoneCallLogs).values({
      phoneCallId: callId,
      eventType: "error",
      status: "error",
      message: `Call failed: ${error.message}`,
      details: JSON.stringify({ error: error.message }),
    });

    return {
      success: false,
      callId,
      callNumber: call.callNumber || "",
      status: "failed",
      message: `Failed to initiate call: ${error.message}`,
      error: error.message,
    };
  }
}

// ============================================
// CALL SIMULATION (for development/demo)
// ============================================

/**
 * Simulate a phone call using AI for development and demo purposes
 */
async function simulatePhoneCall(callId: number, call: any): Promise<PhoneCallResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(aiPhoneCalls)
    .set({ status: "in_progress", startedAt: new Date() })
    .where(eq(aiPhoneCalls.id, callId));

  await db.insert(aiPhoneCallLogs).values({
    phoneCallId: callId,
    eventType: "call_started",
    status: "info",
    message: `[SIMULATION] Starting simulated call to ${call.targetCompany}`,
  });

  const callScript = call.callScript ? JSON.parse(call.callScript) : null;
  const callContext = call.context ? JSON.parse(call.context) : {};

  const isQuoteRequest = call.callType === "quote_request";

  // Build quote-specific prompt additions
  const quotePromptAddition = isQuoteRequest
    ? `\n\nIMPORTANT: This is a QUOTE REQUEST call. The AI agent is calling to gather pricing information. Generate realistic quote data including:
- Specific unit prices for each item discussed
- Minimum order quantities (MOQs)
- Volume discount tiers if applicable
- Lead times for delivery
- Payment terms offered
- Quote validity period
- Any setup fees or additional charges

Populate the "quoteResults" field with realistic pricing data. Each item should have a unitPrice, quantity discussed, totalPrice, leadTime, and any relevant notes.`
    : "";

  // Use AI to simulate the entire call conversation
  const simulationResponse = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are simulating a phone call between an AI business agent and a ${isQuoteRequest ? "sales representative" : "customer service representative"} at ${call.targetCompany}.

The AI agent is calling to: ${call.objective}

Generate a realistic phone call simulation including:
1. IVR navigation (automated menus)
2. Wait times (note them briefly)
3. Conversation with the representative
4. Resolution or outcome

Be realistic about what ${call.targetCompany} ${isQuoteRequest ? "sales team" : "customer service"} can actually do. Include realistic hold times, transfers, verification questions, etc.${quotePromptAddition}

Context about the issue:
${JSON.stringify(callContext, null, 2)}

${callScript ? `Call script guidance:\n${JSON.stringify(callScript, null, 2)}` : ""}

Respond in JSON format with the simulation results.`,
      },
      {
        role: "user",
        content: `Simulate the full phone call for: ${call.subject}

The call type is: ${call.callType}
Target department: ${call.targetDepartment || (isQuoteRequest ? "Sales" : "Customer Service")}

Generate realistic results including a transcript, outcome, and any reference numbers.${isQuoteRequest ? " Include detailed pricing/quote information gathered from the call." : ""}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "call_simulation",
        strict: true,
        schema: {
          type: "object",
          properties: {
            transcript: { type: "string" },
            summary: { type: "string" },
            outcome: {
              type: "string",
              enum: [
                "resolved",
                "partial_resolution",
                "escalated_to_human",
                "callback_scheduled",
                "needs_followup",
                "failed",
                "voicemail_left",
              ],
            },
            resolution: { type: "string" },
            referenceNumber: { type: "string" },
            durationSeconds: { type: "number" },
            waitTimeSeconds: { type: "number" },
            ivrPath: {
              type: "array",
              items: { type: "string" },
            },
            informationGathered: {
              type: "object",
              additionalProperties: { type: "string" },
            },
            followupActions: {
              type: "array",
              items: { type: "string" },
            },
            confidence: { type: "number" },
            quoteResults: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  item: { type: "string" },
                  description: { type: "string" },
                  unitPrice: { type: "number" },
                  currency: { type: "string" },
                  quantity: { type: "number" },
                  unit: { type: "string" },
                  totalPrice: { type: "number" },
                  leadTimeDays: { type: "number" },
                  moq: { type: "number" },
                  volumeDiscounts: { type: "string" },
                  notes: { type: "string" },
                },
                required: ["item", "description", "unitPrice", "currency", "quantity", "unit", "totalPrice", "leadTimeDays", "moq", "volumeDiscounts", "notes"],
                additionalProperties: false,
              },
            },
            quotedTotalAmount: { type: "number" },
            quoteCurrency: { type: "string" },
            quoteValidDays: { type: "number" },
            quoteTerms: { type: "string" },
          },
          required: [
            "transcript",
            "summary",
            "outcome",
            "resolution",
            "referenceNumber",
            "durationSeconds",
            "waitTimeSeconds",
            "ivrPath",
            "informationGathered",
            "followupActions",
            "confidence",
            "quoteResults",
            "quotedTotalAmount",
            "quoteCurrency",
            "quoteValidDays",
            "quoteTerms",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const content = simulationResponse.choices[0].message.content;
  const simulation = JSON.parse(typeof content === "string" ? content : "{}");

  // Log simulation events
  const events = [
    { eventType: "ivr_navigation" as const, message: `IVR path: ${simulation.ivrPath?.join(" → ")}` },
    { eventType: "on_hold" as const, message: `Wait time: ${simulation.waitTimeSeconds}s` },
    { eventType: "agent_connected" as const, message: "Connected with representative" },
    { eventType: "objective_progress" as const, message: simulation.summary },
    { eventType: "call_ended" as const, message: `Call ended. Outcome: ${simulation.outcome}` },
  ];

  // Add quote-specific log event if quote data was gathered
  if (isQuoteRequest && simulation.quoteResults?.length > 0) {
    const quoteItemsSummary = simulation.quoteResults
      .map((q: any) => `${q.item}: ${q.currency || "USD"} ${q.unitPrice}/${q.unit} (MOQ: ${q.moq}, Lead: ${q.leadTimeDays}d)`)
      .join("; ");
    events.push({
      eventType: "info_gathered" as const,
      message: `Quote received - ${simulation.quoteResults.length} item(s): ${quoteItemsSummary}. Total: ${simulation.quoteCurrency || "USD"} ${simulation.quotedTotalAmount}`,
    });
  }

  for (const event of events) {
    await db.insert(aiPhoneCallLogs).values({
      phoneCallId: callId,
      eventType: event.eventType,
      status: "info",
      message: `[SIMULATION] ${event.message}`,
    });
  }

  // Calculate quote valid-until date
  const quoteValidUntil = simulation.quoteValidDays
    ? new Date(Date.now() + simulation.quoteValidDays * 86400000)
    : null;

  // Update the call record with results
  await db
    .update(aiPhoneCalls)
    .set({
      status: "completed",
      endedAt: new Date(),
      durationSeconds: simulation.durationSeconds,
      waitTimeSeconds: simulation.waitTimeSeconds,
      ivrPath: JSON.stringify(simulation.ivrPath),
      outcome: simulation.outcome as any,
      resolution: simulation.resolution,
      referenceNumber: simulation.referenceNumber || null,
      transcript: simulation.transcript,
      transcriptSummary: simulation.summary,
      followupActions: JSON.stringify(simulation.followupActions),
      aiConfidence: simulation.confidence?.toString(),
      objectiveCompleted: simulation.outcome === "resolved",
      // Quote-specific fields
      ...(isQuoteRequest && simulation.quoteResults?.length > 0
        ? {
            quoteResults: JSON.stringify(simulation.quoteResults),
            quotedTotalAmount: simulation.quotedTotalAmount?.toString() || null,
            quoteCurrency: simulation.quoteCurrency || "USD",
            quoteValidUntil,
            quoteTerms: simulation.quoteTerms || null,
          }
        : {}),
    })
    .where(eq(aiPhoneCalls.id, callId));

  // Update playbook stats if applicable
  if (call.playbookId) {
    await db
      .update(aiPhoneCallPlaybooks)
      .set({
        totalCalls: sql`${aiPhoneCallPlaybooks.totalCalls} + 1`,
      })
      .where(eq(aiPhoneCallPlaybooks.playbookKey, call.playbookId));
  }

  return {
    success: true,
    callId,
    callNumber: call.callNumber || "",
    status: "completed",
    outcome: simulation.outcome,
    resolution: simulation.resolution,
    referenceNumber: simulation.referenceNumber,
    transcript: simulation.transcript,
    summary: simulation.summary,
    followupActions: simulation.followupActions,
    ...(isQuoteRequest && simulation.quoteResults?.length > 0
      ? {
          quoteResults: simulation.quoteResults,
          quotedTotalAmount: simulation.quotedTotalAmount,
          quoteCurrency: simulation.quoteCurrency,
          quoteTerms: simulation.quoteTerms,
        }
      : {}),
    message: `[SIMULATED] Call to ${call.targetCompany} completed. Outcome: ${simulation.outcome}. ${simulation.resolution}${
      isQuoteRequest && simulation.quotedTotalAmount
        ? ` Total quoted: ${simulation.quoteCurrency || "USD"} ${simulation.quotedTotalAmount}`
        : ""
    }`,
  };
}

// ============================================
// CALL CONVERSATION HANDLER
// Handles real-time call interactions via Twilio webhooks
// ============================================

/**
 * Generate TwiML response for call handling
 * This is called by Twilio webhooks during the call
 */
export async function handleCallWebhook(
  callId: number,
  speechResult?: string,
  digits?: string
): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [call] = await db.select().from(aiPhoneCalls).where(eq(aiPhoneCalls.id, callId));
  if (!call) throw new Error("Call not found");

  const callScript = call.callScript ? JSON.parse(call.callScript) : null;
  const callContext = call.context ? JSON.parse(call.context) : {};

  // Build conversation history from logs
  const logs = await db
    .select()
    .from(aiPhoneCallLogs)
    .where(eq(aiPhoneCallLogs.phoneCallId, callId))
    .orderBy(aiPhoneCallLogs.timestamp);

  const conversationHistory = logs
    .filter((l) => l.eventType === "ai_speaking" || l.eventType === "ai_listening")
    .map((l) => l.message);

  // Determine what to say next using AI
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an AI agent currently on a phone call with ${call.targetCompany} customer service.

Your objective: ${call.objective}

Call script: ${JSON.stringify(callScript)}
Business context: ${JSON.stringify(callContext)}

Previous conversation:
${conversationHistory.join("\n")}

${speechResult ? `The person just said: "${speechResult}"` : ""}
${digits ? `IVR digits pressed: ${digits}` : ""}

Respond with what you should say next. Be professional, clear, and focused on the objective.
If you've achieved the objective or need to end the call, include [CALL_COMPLETE] in your response.
If you need to escalate to a human, include [ESCALATE] in your response.
If you need to press a phone menu digit, include [PRESS:X] where X is the digit.`,
      },
      {
        role: "user",
        content: speechResult
          ? `Respond to: "${speechResult}"`
          : digits
            ? `You pressed ${digits}. What's next?`
            : "Start the call. What do you say first?",
      },
    ],
  });

  const aiResponse = typeof response.choices[0].message.content === "string"
    ? response.choices[0].message.content
    : "";

  // Log the interaction
  if (speechResult) {
    await db.insert(aiPhoneCallLogs).values({
      phoneCallId: callId,
      eventType: "ai_listening",
      status: "info",
      message: speechResult,
    });
  }

  await db.insert(aiPhoneCallLogs).values({
    phoneCallId: callId,
    eventType: "ai_speaking",
    status: "info",
    message: aiResponse.replace(/\[CALL_COMPLETE\]|\[ESCALATE\]|\[PRESS:\d\]/g, "").trim(),
  });

  // Generate TwiML
  let twiml = '<?xml version="1.0" encoding="UTF-8"?><Response>';

  if (aiResponse.includes("[CALL_COMPLETE]")) {
    // End the call
    const cleanResponse = aiResponse.replace("[CALL_COMPLETE]", "").trim();
    twiml += `<Say voice="Polly.Matthew">${escapeXml(cleanResponse)}</Say>`;
    twiml += "<Hangup/>";

    // Update call status
    await db
      .update(aiPhoneCalls)
      .set({
        status: "completed",
        endedAt: new Date(),
        objectiveCompleted: true,
      })
      .where(eq(aiPhoneCalls.id, callId));
  } else if (aiResponse.includes("[ESCALATE]")) {
    // Hand off to human
    const cleanResponse = aiResponse.replace("[ESCALATE]", "").trim();
    twiml += `<Say voice="Polly.Matthew">${escapeXml(cleanResponse)}</Say>`;
    twiml += "<Hangup/>";

    await db
      .update(aiPhoneCalls)
      .set({
        status: "requires_human",
        outcome: "escalated_to_human",
      })
      .where(eq(aiPhoneCalls.id, callId));
  } else if (aiResponse.match(/\[PRESS:(\d)\]/)) {
    // Press IVR digits
    const digit = aiResponse.match(/\[PRESS:(\d)\]/)![1];
    twiml += `<Play digits="${digit}"/>`;
    twiml += "<Pause length=\"2\"/>";
    twiml += `<Gather input="speech dtmf" timeout="10" speechTimeout="auto" action="${ENV.publicAppUrl}/api/phone-call/webhook/${callId}">`;
    twiml += `<Say voice="Polly.Matthew">Listening...</Say>`;
    twiml += "</Gather>";

    await db.insert(aiPhoneCallLogs).values({
      phoneCallId: callId,
      eventType: "ivr_navigation",
      status: "info",
      message: `Pressed ${digit} on IVR menu`,
    });
  } else {
    // Normal conversation - speak and listen
    const cleanResponse = aiResponse.trim();
    twiml += `<Gather input="speech" timeout="15" speechTimeout="auto" action="${ENV.publicAppUrl}/api/phone-call/webhook/${callId}">`;
    twiml += `<Say voice="Polly.Matthew">${escapeXml(cleanResponse)}</Say>`;
    twiml += "</Gather>";
    // Fallback if no speech detected
    twiml += `<Say voice="Polly.Matthew">I didn't catch that. Could you please repeat?</Say>`;
    twiml += `<Gather input="speech" timeout="15" speechTimeout="auto" action="${ENV.publicAppUrl}/api/phone-call/webhook/${callId}">`;
    twiml += "</Gather>";
  }

  twiml += "</Response>";
  return twiml;
}

/**
 * Handle call status updates from Twilio
 */
export async function handleCallStatusUpdate(
  callId: number,
  status: string,
  duration?: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (status === "completed" || status === "failed" || status === "busy" || status === "no-answer") {
    const callStatus = status === "completed" ? "completed" : "failed";

    await db
      .update(aiPhoneCalls)
      .set({
        status: callStatus as any,
        endedAt: new Date(),
        durationSeconds: duration,
      })
      .where(eq(aiPhoneCalls.id, callId));

    // Generate transcript summary if call completed
    if (callStatus === "completed") {
      await generateCallSummary(callId);
    }
  }

  await db.insert(aiPhoneCallLogs).values({
    phoneCallId: callId,
    eventType: status === "completed" ? "call_ended" : "error",
    status: status === "completed" ? "success" : "warning",
    message: `Call status update: ${status}${duration ? ` (${duration}s)` : ""}`,
  });
}

/**
 * Handle recording completion from Twilio
 */
export async function handleRecordingComplete(
  callId: number,
  recordingUrl: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(aiPhoneCalls)
    .set({ recordingUrl })
    .where(eq(aiPhoneCalls.id, callId));

  await db.insert(aiPhoneCallLogs).values({
    phoneCallId: callId,
    eventType: "transcript_ready",
    status: "info",
    message: "Call recording available",
    details: JSON.stringify({ recordingUrl }),
  });
}

// ============================================
// POST-CALL PROCESSING
// ============================================

/**
 * Generate a summary of the call from the transcript/logs
 */
async function generateCallSummary(callId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [call] = await db.select().from(aiPhoneCalls).where(eq(aiPhoneCalls.id, callId));
  if (!call) return;

  const logs = await db
    .select()
    .from(aiPhoneCallLogs)
    .where(eq(aiPhoneCallLogs.phoneCallId, callId))
    .orderBy(aiPhoneCallLogs.timestamp);

  const conversationLogs = logs
    .filter((l) => l.eventType === "ai_speaking" || l.eventType === "ai_listening")
    .map((l) => `${l.eventType === "ai_speaking" ? "AI Agent" : "Representative"}: ${l.message}`)
    .join("\n");

  if (!conversationLogs) return;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "Analyze this phone call transcript and provide a structured summary.",
      },
      {
        role: "user",
        content: `Phone call to ${call.targetCompany} regarding: ${call.subject}
Objective: ${call.objective}

Transcript:
${conversationLogs}

Provide a JSON summary with: summary (brief overview), outcome (resolved/partial_resolution/escalated_to_human/callback_scheduled/needs_followup/failed), resolution (what was accomplished), referenceNumber (any case/ticket numbers mentioned), followupActions (array of next steps)`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "call_summary",
        strict: true,
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            outcome: { type: "string" },
            resolution: { type: "string" },
            referenceNumber: { type: "string" },
            followupActions: { type: "array", items: { type: "string" } },
          },
          required: ["summary", "outcome", "resolution", "referenceNumber", "followupActions"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0].message.content;
  const summaryData = JSON.parse(typeof content === "string" ? content : "{}");

  await db
    .update(aiPhoneCalls)
    .set({
      transcriptSummary: summaryData.summary,
      outcome: summaryData.outcome as any,
      resolution: summaryData.resolution,
      referenceNumber: summaryData.referenceNumber || null,
      followupActions: JSON.stringify(summaryData.followupActions),
      transcript: conversationLogs,
    })
    .where(eq(aiPhoneCalls.id, callId));
}

// ============================================
// QUERY & MANAGEMENT FUNCTIONS
// ============================================

export async function getPhoneCalls(filters?: {
  status?: string;
  callType?: string;
  targetCompany?: string;
  limit?: number;
}): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const calls = await db
    .select()
    .from(aiPhoneCalls)
    .orderBy(desc(aiPhoneCalls.createdAt))
    .limit(filters?.limit || 50);

  let filtered = calls;
  if (filters?.status) {
    filtered = filtered.filter((c) => c.status === filters.status);
  }
  if (filters?.callType) {
    filtered = filtered.filter((c) => c.callType === filters.callType);
  }
  if (filters?.targetCompany) {
    filtered = filtered.filter((c) =>
      c.targetCompany.toLowerCase().includes(filters.targetCompany!.toLowerCase())
    );
  }

  return filtered;
}

export async function getPhoneCallById(id: number): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [call] = await db.select().from(aiPhoneCalls).where(eq(aiPhoneCalls.id, id));
  if (!call) return null;

  const logs = await db
    .select()
    .from(aiPhoneCallLogs)
    .where(eq(aiPhoneCallLogs.phoneCallId, id))
    .orderBy(aiPhoneCallLogs.timestamp);

  return { ...call, logs };
}

export async function approvePhoneCall(callId: number, approvedBy: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(aiPhoneCalls)
    .set({
      status: "preparing",
      approvedBy,
      approvedAt: new Date(),
    })
    .where(eq(aiPhoneCalls.id, callId));

  await db.insert(aiPhoneCallLogs).values({
    phoneCallId: callId,
    eventType: "call_preparing",
    status: "info",
    message: "Call approved and being prepared for execution",
  });
}

export async function rejectPhoneCall(
  callId: number,
  rejectedBy: number,
  reason?: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(aiPhoneCalls)
    .set({
      status: "cancelled",
      rejectedBy,
      rejectedAt: new Date(),
      rejectionReason: reason,
    })
    .where(eq(aiPhoneCalls.id, callId));

  await db.insert(aiPhoneCallLogs).values({
    phoneCallId: callId,
    eventType: "error",
    status: "warning",
    message: `Call rejected: ${reason || "No reason provided"}`,
  });
}

export async function cancelPhoneCall(callId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(aiPhoneCalls)
    .set({ status: "cancelled" })
    .where(eq(aiPhoneCalls.id, callId));
}

// ============================================
// PLAYBOOK MANAGEMENT
// ============================================

export async function getPlaybooks(): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(aiPhoneCallPlaybooks)
    .where(eq(aiPhoneCallPlaybooks.isActive, true))
    .orderBy(aiPhoneCallPlaybooks.name);
}

export async function getPlaybookByKey(key: string): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [playbook] = await db
    .select()
    .from(aiPhoneCallPlaybooks)
    .where(eq(aiPhoneCallPlaybooks.playbookKey, key));
  return playbook || null;
}

// ============================================
// PHONE CALL STATS
// ============================================

export async function getPhoneCallStats(): Promise<{
  total: number;
  completed: number;
  inProgress: number;
  queued: number;
  failed: number;
  resolved: number;
  avgDuration: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const allCalls = await db.select().from(aiPhoneCalls);

  const completed = allCalls.filter((c) => c.status === "completed");
  const resolved = allCalls.filter((c) => c.outcome === "resolved");
  const avgDuration =
    completed.length > 0
      ? completed.reduce((sum, c) => sum + (c.durationSeconds || 0), 0) / completed.length
      : 0;

  return {
    total: allCalls.length,
    completed: completed.length,
    inProgress: allCalls.filter((c) => c.status === "in_progress").length,
    queued: allCalls.filter((c) => c.status === "queued").length,
    failed: allCalls.filter((c) => c.status === "failed").length,
    resolved: resolved.length,
    avgDuration: Math.round(avgDuration),
  };
}

// ============================================
// UTILITY
// ============================================

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
