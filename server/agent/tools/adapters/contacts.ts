import { getDb } from "../../../db";
import {
  crmContacts,
  crmInteractions,
  customers,
  vendors,
  sentEmails,
  agentCallLogs,
} from "../../../../drizzle/schema";
import { eq, desc, or, like, sql } from "drizzle-orm";
import type { ToolAdapterResult } from "../../types";

interface ContactInput {
  action: string;
  payload?: {
    contactType?: "vendor" | "customer" | "crm_contact";
    contactId?: number;
    searchQuery?: string;
    limit?: number;
  };
}

/**
 * Contact management adapter — allows the agent to look up contacts,
 * search across vendors/customers/CRM, and view unified interaction history.
 */
export async function runContactLookup(input: ContactInput): Promise<ToolAdapterResult> {
  const db = await getDb();
  const { action, payload } = input;

  switch (action) {
    case "search_contacts": {
      const query = payload?.searchQuery;
      if (!query) return { success: false, error: "searchQuery is required" };

      const limit = Math.min(payload?.limit ?? 20, 50);
      const pattern = `%${query}%`;

      // Search across all contact sources
      const [crmResults, vendorResults, customerResults] = await Promise.all([
        db.select({
          id: crmContacts.id,
          name: crmContacts.fullName,
          email: crmContacts.email,
          phone: crmContacts.phone,
          type: crmContacts.contactType,
          status: crmContacts.status,
          lastContactedAt: crmContacts.lastContactedAt,
        })
          .from(crmContacts)
          .where(or(
            like(crmContacts.fullName, pattern),
            like(crmContacts.email, pattern),
            like(crmContacts.organization, pattern),
          ))
          .limit(limit),

        db.select({
          id: vendors.id,
          name: vendors.name,
          contactName: vendors.contactName,
          email: vendors.email,
          phone: vendors.phone,
          status: vendors.status,
        })
          .from(vendors)
          .where(or(
            like(vendors.name, pattern),
            like(vendors.contactName, pattern),
            like(vendors.email, pattern),
          ))
          .limit(limit),

        db.select({
          id: customers.id,
          name: customers.name,
          email: customers.email,
          phone: customers.phone,
          status: customers.status,
        })
          .from(customers)
          .where(or(
            like(customers.name, pattern),
            like(customers.email, pattern),
          ))
          .limit(limit),
      ]);

      return {
        success: true,
        data: {
          crmContacts: crmResults.map(r => ({ ...r, source: "crm_contact" })),
          vendors: vendorResults.map(r => ({ ...r, source: "vendor" })),
          customers: customerResults.map(r => ({ ...r, source: "customer" })),
          totalResults: crmResults.length + vendorResults.length + customerResults.length,
        },
      };
    }

    case "get_contact_details": {
      const { contactType, contactId } = payload ?? {};
      if (!contactType || !contactId) {
        return { success: false, error: "contactType and contactId are required" };
      }

      let contact: any = null;

      switch (contactType) {
        case "vendor": {
          const [v] = await db.select().from(vendors).where(eq(vendors.id, contactId));
          contact = v ? { ...v, source: "vendor" } : null;
          break;
        }
        case "customer": {
          const [c] = await db.select().from(customers).where(eq(customers.id, contactId));
          contact = c ? { ...c, source: "customer" } : null;
          break;
        }
        case "crm_contact": {
          const [cr] = await db.select().from(crmContacts).where(eq(crmContacts.id, contactId));
          contact = cr ? { ...cr, source: "crm_contact" } : null;
          break;
        }
      }

      if (!contact) {
        return { success: false, error: `${contactType} with id ${contactId} not found` };
      }

      return { success: true, data: contact };
    }

    case "get_interaction_history": {
      const { contactType, contactId } = payload ?? {};
      if (!contactType || !contactId) {
        return { success: false, error: "contactType and contactId are required" };
      }

      // Find CRM contact
      let crmContactId: number | undefined;

      if (contactType === "crm_contact") {
        crmContactId = contactId;
      } else {
        // Look up by email from vendor/customer
        let email = "";
        if (contactType === "vendor") {
          const [v] = await db.select().from(vendors).where(eq(vendors.id, contactId));
          email = v?.email ?? "";
        } else if (contactType === "customer") {
          const [c] = await db.select().from(customers).where(eq(customers.id, contactId));
          email = c?.email ?? "";
        }

        if (email) {
          const [crm] = await db.select().from(crmContacts).where(eq(crmContacts.email, email)).limit(1);
          crmContactId = crm?.id;
        }
      }

      if (!crmContactId) {
        return { success: true, data: { interactions: [], calls: [], emails: [], message: "No CRM contact found for this entity" } };
      }

      // Fetch all interaction types
      const [interactions, calls, emails] = await Promise.all([
        db.select()
          .from(crmInteractions)
          .where(eq(crmInteractions.contactId, crmContactId))
          .orderBy(desc(crmInteractions.createdAt))
          .limit(50),

        db.select()
          .from(agentCallLogs)
          .where(eq(agentCallLogs.contactId, contactId))
          .orderBy(desc(agentCallLogs.createdAt))
          .limit(20),

        // Fetch sent emails by looking up the contact's email
        (async () => {
          const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, crmContactId!));
          if (!contact?.email) return [];
          return db.select()
            .from(sentEmails)
            .where(eq(sentEmails.toEmail, contact.email))
            .orderBy(desc(sentEmails.createdAt))
            .limit(20);
        })(),
      ]);

      return {
        success: true,
        data: {
          contactId: crmContactId,
          interactions,
          calls,
          emails,
          summary: {
            totalInteractions: interactions.length,
            totalCalls: calls.length,
            totalEmails: emails.length,
            channels: Array.from(new Set(interactions.map(i => i.channel))),
          },
        },
      };
    }

    case "add_note": {
      const { contactType, contactId } = payload ?? {};
      const note = (payload as any)?.note;
      if (!contactType || !contactId || !note) {
        return { success: false, error: "contactType, contactId, and note are required" };
      }

      // Find or create CRM contact
      let crmContactId: number | undefined;
      if (contactType === "crm_contact") {
        crmContactId = contactId;
      } else {
        let email = "";
        let name = "";
        if (contactType === "vendor") {
          const [v] = await db.select().from(vendors).where(eq(vendors.id, contactId));
          email = v?.email ?? "";
          name = v?.contactName ?? v?.name ?? "";
        } else {
          const [c] = await db.select().from(customers).where(eq(customers.id, contactId));
          email = c?.email ?? "";
          name = c?.name ?? "";
        }
        if (email) {
          const [existing] = await db.select().from(crmContacts).where(eq(crmContacts.email, email)).limit(1);
          crmContactId = existing?.id;
        }
        if (!crmContactId && name) {
          const [created] = await db.insert(crmContacts).values({
            firstName: name.split(" ")[0] || name,
            fullName: name,
            email: email || undefined,
            contactType: contactType === "vendor" ? "vendor" : "customer",
            source: "manual",
          }).$returningId();
          crmContactId = created.id;
        }
      }

      if (!crmContactId) {
        return { success: false, error: "Could not resolve CRM contact for note" };
      }

      await db.insert(crmInteractions).values({
        contactId: crmContactId,
        channel: "note",
        interactionType: "note_added",
        content: note,
      });

      return { success: true, data: { noted: true, contactId: crmContactId } };
    }

    default:
      return { success: false, error: `Unknown contact action: ${action}` };
  }
}
