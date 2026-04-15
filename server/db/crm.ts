import { eq, and, or, desc, like, sql, count, sum, inArray } from "drizzle-orm";
import {
  crmContacts, InsertCrmContact, crmTags, InsertCrmTag, crmContactTags,
  whatsappMessages, InsertWhatsappMessage, crmInteractions, InsertCrmInteraction,
  crmPipelines, InsertCrmPipeline, crmDeals, InsertCrmDeal,
  contactCaptures, InsertContactCapture,
  crmEmailCampaigns, InsertCrmEmailCampaign, crmCampaignRecipients,
  sentEmails,
} from "../../drizzle/schema";
import { getDb } from "./connection";

// --- CRM CONTACTS ---

export async function getCrmContacts(filters?: {
  contactType?: string;
  status?: string;
  source?: string;
  pipelineStage?: string;
  assignedTo?: number;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.contactType) {
    conditions.push(eq(crmContacts.contactType, filters.contactType as any));
  }
  if (filters?.status) {
    conditions.push(eq(crmContacts.status, filters.status as any));
  }
  if (filters?.source) {
    conditions.push(eq(crmContacts.source, filters.source as any));
  }
  if (filters?.pipelineStage) {
    conditions.push(eq(crmContacts.pipelineStage, filters.pipelineStage as any));
  }
  if (filters?.assignedTo) {
    conditions.push(eq(crmContacts.assignedTo, filters.assignedTo));
  }
  if (filters?.search) {
    conditions.push(
      or(
        like(crmContacts.fullName, `%${filters.search}%`),
        like(crmContacts.email, `%${filters.search}%`),
        like(crmContacts.organization, `%${filters.search}%`),
        like(crmContacts.phone, `%${filters.search}%`)
      )
    );
  }

  let query = db.select().from(crmContacts);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return query
    .orderBy(desc(crmContacts.createdAt))
    .limit(filters?.limit || 100)
    .offset(filters?.offset || 0);
}

export async function getCrmContactById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(crmContacts).where(eq(crmContacts.id, id)).limit(1);
  return result[0];
}

export async function getCrmContactByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(crmContacts).where(eq(crmContacts.email, email)).limit(1);
  return result[0];
}

export async function createCrmContact(data: InsertCrmContact) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(crmContacts).values(data);
  return result[0].insertId;
}

export async function updateCrmContact(id: number, data: Partial<InsertCrmContact>) {
  const db = await getDb();
  if (!db) return;
  await db.update(crmContacts).set(data).where(eq(crmContacts.id, id));
}

export async function deleteCrmContact(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(crmContactTags).where(eq(crmContactTags.contactId, id));
  await db.delete(crmInteractions).where(eq(crmInteractions.contactId, id));
  await db.delete(whatsappMessages).where(eq(whatsappMessages.contactId, id));
  await db.delete(crmDeals).where(eq(crmDeals.contactId, id));
  await db.delete(crmContacts).where(eq(crmContacts.id, id));
}

export async function getCrmContactStats() {
  const db = await getDb();
  if (!db) return null;

  const [totalContacts] = await db.select({ count: count() }).from(crmContacts);
  const [leadCount] = await db.select({ count: count() }).from(crmContacts).where(eq(crmContacts.contactType, "lead"));
  const [prospectCount] = await db.select({ count: count() }).from(crmContacts).where(eq(crmContacts.contactType, "prospect"));
  const [customerCount] = await db.select({ count: count() }).from(crmContacts).where(eq(crmContacts.contactType, "customer"));
  const [investorCount] = await db.select({ count: count() }).from(crmContacts).where(eq(crmContacts.contactType, "investor"));
  const [donorCount] = await db.select({ count: count() }).from(crmContacts).where(eq(crmContacts.contactType, "donor"));

  return {
    total: totalContacts?.count || 0,
    leads: leadCount?.count || 0,
    prospects: prospectCount?.count || 0,
    customers: customerCount?.count || 0,
    investors: investorCount?.count || 0,
    donors: donorCount?.count || 0,
  };
}

// --- CRM TAGS ---

export async function getCrmTags(category?: string) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(crmTags);
  if (category) {
    query = query.where(eq(crmTags.category, category as any)) as any;
  }
  return query.orderBy(crmTags.name);
}

export async function createCrmTag(data: InsertCrmTag) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(crmTags).values(data);
  return result[0].insertId;
}

export async function deleteCrmTag(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(crmContactTags).where(eq(crmContactTags.tagId, id));
  await db.delete(crmTags).where(eq(crmTags.id, id));
}

export async function addTagToContact(contactId: number, tagId: number) {
  const db = await getDb();
  if (!db) return;
  await db.insert(crmContactTags).values({ contactId, tagId });
}

export async function removeTagFromContact(contactId: number, tagId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(crmContactTags).where(
    and(eq(crmContactTags.contactId, contactId), eq(crmContactTags.tagId, tagId))
  );
}

export async function getContactTags(contactId: number) {
  const db = await getDb();
  if (!db) return [];
  const result = await db
    .select({ tag: crmTags })
    .from(crmContactTags)
    .innerJoin(crmTags, eq(crmContactTags.tagId, crmTags.id))
    .where(eq(crmContactTags.contactId, contactId));
  return result.map(r => r.tag);
}

// --- WHATSAPP MESSAGES ---

export async function getWhatsappMessages(filters?: {
  contactId?: number;
  whatsappNumber?: string;
  direction?: string;
  conversationId?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.contactId) {
    conditions.push(eq(whatsappMessages.contactId, filters.contactId));
  }
  if (filters?.whatsappNumber) {
    conditions.push(eq(whatsappMessages.whatsappNumber, filters.whatsappNumber));
  }
  if (filters?.direction) {
    conditions.push(eq(whatsappMessages.direction, filters.direction as any));
  }
  if (filters?.conversationId) {
    conditions.push(eq(whatsappMessages.conversationId, filters.conversationId));
  }

  let query = db.select().from(whatsappMessages);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return query
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(filters?.limit || 100)
    .offset(filters?.offset || 0);
}

export async function getWhatsappConversations(limit: number = 50) {
  const db = await getDb();
  if (!db) return [];

  const result = await db.select().from(whatsappMessages)
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(limit * 2);

  const conversations = new Map<string, typeof result[0]>();
  for (const msg of result) {
    const key = msg.conversationId || msg.whatsappNumber;
    if (!conversations.has(key)) {
      conversations.set(key, msg);
    }
  }

  return Array.from(conversations.values()).slice(0, limit);
}

export async function createWhatsappMessage(data: InsertWhatsappMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(whatsappMessages).values(data);
  return result[0].insertId;
}

export async function updateWhatsappMessageStatus(
  id: number,
  status: string,
  timestamp?: Date
) {
  const db = await getDb();
  if (!db) return;

  const updates: Record<string, any> = { status };
  if (status === "sent" && timestamp) updates.sentAt = timestamp;
  if (status === "delivered" && timestamp) updates.deliveredAt = timestamp;
  if (status === "read" && timestamp) updates.readAt = timestamp;

  await db.update(whatsappMessages).set(updates).where(eq(whatsappMessages.id, id));
}

// --- CRM INTERACTIONS ---

export async function getCrmInteractions(filters?: {
  contactId?: number;
  channel?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.contactId) {
    conditions.push(eq(crmInteractions.contactId, filters.contactId));
  }
  if (filters?.channel) {
    conditions.push(eq(crmInteractions.channel, filters.channel as any));
  }

  let query = db.select().from(crmInteractions);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return query
    .orderBy(desc(crmInteractions.createdAt))
    .limit(filters?.limit || 100)
    .offset(filters?.offset || 0);
}

export async function createCrmInteraction(data: InsertCrmInteraction) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(crmInteractions).values(data);

  // Update contact's interaction count and last contacted timestamp
  await db.update(crmContacts)
    .set({
      totalInteractions: sql`${crmContacts.totalInteractions} + 1`,
      lastContactedAt: new Date(),
    })
    .where(eq(crmContacts.id, data.contactId));

  return result[0].insertId;
}

export async function getContactTimeline(contactId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];

  const interactions = await db.select().from(crmInteractions)
    .where(eq(crmInteractions.contactId, contactId))
    .orderBy(desc(crmInteractions.createdAt))
    .limit(limit);

  return interactions;
}

// --- CRM PIPELINES ---

export async function getCrmPipelines(type?: string) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(crmPipelines.isActive, true)];
  if (type) {
    conditions.push(eq(crmPipelines.type, type as typeof crmPipelines.type.enumValues[number]));
  }

  return db.select().from(crmPipelines).where(and(...conditions)).orderBy(crmPipelines.name);
}

export async function getCrmPipelineById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(crmPipelines).where(eq(crmPipelines.id, id)).limit(1);
  return result[0];
}

export async function createCrmPipeline(data: InsertCrmPipeline) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(crmPipelines).values(data);
  return result[0].insertId;
}

export async function updateCrmPipeline(id: number, data: Partial<InsertCrmPipeline>) {
  const db = await getDb();
  if (!db) return;
  await db.update(crmPipelines).set(data).where(eq(crmPipelines.id, id));
}

// --- CRM DEALS ---

export async function getCrmDeals(filters?: {
  pipelineId?: number;
  contactId?: number;
  stage?: string;
  status?: string;
  assignedTo?: number;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.pipelineId) conditions.push(eq(crmDeals.pipelineId, filters.pipelineId));
  if (filters?.contactId) conditions.push(eq(crmDeals.contactId, filters.contactId));
  if (filters?.stage) conditions.push(eq(crmDeals.stage, filters.stage));
  if (filters?.status) conditions.push(eq(crmDeals.status, filters.status as any));
  if (filters?.assignedTo) conditions.push(eq(crmDeals.assignedTo, filters.assignedTo));

  let query = db.select().from(crmDeals);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return query
    .orderBy(desc(crmDeals.createdAt))
    .limit(filters?.limit || 100)
    .offset(filters?.offset || 0);
}

export async function getCrmDealById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(crmDeals).where(eq(crmDeals.id, id)).limit(1);
  return result[0];
}

export async function createCrmDeal(data: InsertCrmDeal) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(crmDeals).values(data);
  return result[0].insertId;
}

export async function updateCrmDeal(id: number, data: Partial<InsertCrmDeal>) {
  const db = await getDb();
  if (!db) return;

  if (data.status === "won" && !data.wonAt) {
    data.wonAt = new Date();
  }
  if (data.status === "lost" && !data.lostAt) {
    data.lostAt = new Date();
  }

  await db.update(crmDeals).set(data).where(eq(crmDeals.id, id));
}

export async function deleteCrmDeal(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(crmDeals).where(eq(crmDeals.id, id));
}

export async function getCrmDealStats(pipelineId?: number) {
  const db = await getDb();
  if (!db) return null;

  const baseCondition = pipelineId ? eq(crmDeals.pipelineId, pipelineId) : undefined;

  const [totalDeals] = await db.select({ count: count() }).from(crmDeals).where(baseCondition);
  const [openDeals] = await db.select({ count: count(), totalValue: sum(crmDeals.amount) })
    .from(crmDeals)
    .where(baseCondition ? and(baseCondition, eq(crmDeals.status, "open")) : eq(crmDeals.status, "open"));
  const [wonDeals] = await db.select({ count: count(), totalValue: sum(crmDeals.amount) })
    .from(crmDeals)
    .where(baseCondition ? and(baseCondition, eq(crmDeals.status, "won")) : eq(crmDeals.status, "won"));
  const [lostDeals] = await db.select({ count: count() })
    .from(crmDeals)
    .where(baseCondition ? and(baseCondition, eq(crmDeals.status, "lost")) : eq(crmDeals.status, "lost"));

  return {
    total: totalDeals?.count || 0,
    open: openDeals?.count || 0,
    openValue: openDeals?.totalValue || 0,
    won: wonDeals?.count || 0,
    wonValue: wonDeals?.totalValue || 0,
    lost: lostDeals?.count || 0,
  };
}

// --- CONTACT CAPTURES ---

export async function getContactCaptures(filters?: {
  status?: string;
  captureMethod?: string;
  capturedBy?: number;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.status) conditions.push(eq(contactCaptures.status, filters.status as any));
  if (filters?.captureMethod) conditions.push(eq(contactCaptures.captureMethod, filters.captureMethod as any));
  if (filters?.capturedBy) conditions.push(eq(contactCaptures.capturedBy, filters.capturedBy));

  let query = db.select().from(contactCaptures);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return query
    .orderBy(desc(contactCaptures.capturedAt))
    .limit(filters?.limit || 100)
    .offset(filters?.offset || 0);
}

export async function getContactCaptureById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contactCaptures).where(eq(contactCaptures.id, id)).limit(1);
  return result[0];
}

export async function createContactCapture(data: InsertContactCapture) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(contactCaptures).values(data);
  return result[0].insertId;
}

export async function updateContactCapture(id: number, data: Partial<InsertContactCapture>) {
  const db = await getDb();
  if (!db) return;
  await db.update(contactCaptures).set(data).where(eq(contactCaptures.id, id));
}

// Parse vCard data and create/update contact
export async function processVCardCapture(captureId: number, vcardData: string, capturedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const parsedData = parseVCard(vcardData);

  let existingContact = null;
  if (parsedData.email) {
    existingContact = await getCrmContactByEmail(parsedData.email);
  }

  let contactId: number;

  if (existingContact) {
    await updateCrmContact(existingContact.id, {
      ...parsedData,
      updatedAt: new Date(),
    });
    contactId = existingContact.id;

    await updateContactCapture(captureId, {
      contactId,
      status: "merged",
      parsedData: JSON.stringify(parsedData),
    });
  } else {
    contactId = await createCrmContact({
      ...parsedData,
      firstName: parsedData.firstName ?? "Unknown",
      fullName: parsedData.fullName ?? parsedData.firstName ?? "Unknown",
      source: "iphone_bump",
      capturedBy,
      captureData: JSON.stringify({ vcardData, captureId }),
    });

    await updateContactCapture(captureId, {
      contactId,
      status: "contact_created",
      parsedData: JSON.stringify(parsedData),
    });
  }

  return contactId;
}

// Parse LinkedIn profile data and create/update contact
export async function processLinkedInCapture(
  captureId: number,
  linkedinData: {
    profileUrl: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    headline?: string;
    company?: string;
    email?: string;
  },
  capturedBy: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const parsedData: Partial<InsertCrmContact> = {
    firstName: linkedinData.firstName || linkedinData.name?.split(" ")[0] || "Unknown",
    lastName: linkedinData.lastName || linkedinData.name?.split(" ").slice(1).join(" ") || "",
    fullName: linkedinData.name || `${linkedinData.firstName || ""} ${linkedinData.lastName || ""}`.trim() || "Unknown",
    linkedinUrl: linkedinData.profileUrl,
    jobTitle: linkedinData.headline,
    organization: linkedinData.company,
    email: linkedinData.email,
  };

  let existingContact = null;
  if (linkedinData.email) {
    existingContact = await getCrmContactByEmail(linkedinData.email);
  }
  if (!existingContact && linkedinData.profileUrl) {
    const result = await db.select().from(crmContacts)
      .where(eq(crmContacts.linkedinUrl, linkedinData.profileUrl))
      .limit(1);
    existingContact = result[0];
  }

  let contactId: number;

  if (existingContact) {
    await updateCrmContact(existingContact.id, parsedData);
    contactId = existingContact.id;

    await updateContactCapture(captureId, {
      contactId,
      status: "merged",
      parsedData: JSON.stringify(parsedData),
    });
  } else {
    contactId = await createCrmContact({
      ...parsedData,
      source: "linkedin_scan",
      capturedBy,
      captureData: JSON.stringify({ linkedinData, captureId }),
    } as InsertCrmContact);

    await updateContactCapture(captureId, {
      contactId,
      status: "contact_created",
      parsedData: JSON.stringify(parsedData),
    });
  }

  return contactId;
}

// --- EMAIL CAMPAIGNS ---

export async function getCrmEmailCampaigns(filters?: {
  status?: string;
  type?: string;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.status) conditions.push(eq(crmEmailCampaigns.status, filters.status as any));
  if (filters?.type) conditions.push(eq(crmEmailCampaigns.type, filters.type as any));

  let query = db.select().from(crmEmailCampaigns);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return query
    .orderBy(desc(crmEmailCampaigns.createdAt))
    .limit(filters?.limit || 50);
}

export async function createCrmEmailCampaign(data: InsertCrmEmailCampaign) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(crmEmailCampaigns).values(data);
  return result[0].insertId;
}

export async function updateCrmEmailCampaign(id: number, data: Partial<InsertCrmEmailCampaign>) {
  const db = await getDb();
  if (!db) return;
  await db.update(crmEmailCampaigns).set(data).where(eq(crmEmailCampaigns.id, id));
}

// --- HELPER FUNCTIONS ---

function parseVCard(vcardData: string): Partial<InsertCrmContact> {
  const lines = vcardData.split(/\r?\n/);
  const result: Partial<InsertCrmContact> = {};

  for (const line of lines) {
    const [key, ...valueParts] = line.split(":");
    const value = valueParts.join(":").trim();

    if (!key || !value) continue;

    const keyLower = key.toLowerCase().split(";")[0];

    switch (keyLower) {
      case "fn":
        result.fullName = value;
        break;
      case "n":
        const nameParts = value.split(";");
        result.lastName = nameParts[0] || "";
        result.firstName = nameParts[1] || "";
        if (!result.fullName) {
          result.fullName = `${result.firstName} ${result.lastName}`.trim();
        }
        break;
      case "email":
        result.email = value;
        break;
      case "tel":
        if (key.toLowerCase().includes("cell") || key.toLowerCase().includes("mobile")) {
          result.phone = value;
          result.whatsappNumber = value.replace(/[^+\d]/g, "");
        } else if (!result.phone) {
          result.phone = value;
        }
        break;
      case "org":
        result.organization = value;
        break;
      case "title":
        result.jobTitle = value;
        break;
      case "adr":
        const addrParts = value.split(";");
        result.address = addrParts[2] || "";
        result.city = addrParts[3] || "";
        result.state = addrParts[4] || "";
        result.postalCode = addrParts[5] || "";
        result.country = addrParts[6] || "";
        break;
      case "url":
        if (value.includes("linkedin.com")) {
          result.linkedinUrl = value;
        }
        break;
      case "note":
        result.notes = value;
        break;
    }
  }

  if (!result.firstName) {
    result.firstName = result.fullName?.split(" ")[0] || "Unknown";
  }
  if (!result.fullName) {
    result.fullName = `${result.firstName || ""} ${result.lastName || ""}`.trim() || "Unknown";
  }

  return result;
}

// Get unified messaging history (emails + WhatsApp) for a contact
export async function getUnifiedMessagingHistory(contactId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];

  const contact = await getCrmContactById(contactId);
  if (!contact) return [];

  const whatsappMsgs = await getWhatsappMessages({
    contactId,
    limit,
  });

  const emailConditions = [];
  if (contact.email) {
    emailConditions.push(eq(sentEmails.toEmail, contact.email));
  }

  let emails: typeof sentEmails.$inferSelect[] = [];
  if (emailConditions.length > 0) {
    emails = await db.select().from(sentEmails)
      .where(or(...emailConditions))
      .orderBy(desc(sentEmails.createdAt))
      .limit(limit);
  }

  const combined = [
    ...whatsappMsgs.map(m => ({
      type: "whatsapp" as const,
      id: m.id,
      direction: m.direction,
      content: m.content,
      status: m.status,
      timestamp: m.createdAt,
      data: m,
    })),
    ...emails.map(e => ({
      type: "email" as const,
      id: e.id,
      direction: "outbound" as const,
      content: e.bodyText || e.subject,
      status: e.status,
      timestamp: e.createdAt,
      data: e,
    })),
  ].sort((a, b) => {
    const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return dateB - dateA;
  });

  return combined.slice(0, limit);
}
