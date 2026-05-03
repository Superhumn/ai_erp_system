import { eq, and, or, desc, sql, inArray, isNull, gte, lte } from "drizzle-orm";
import {
  dataRooms, InsertDataRoom, dataRoomFolders, InsertDataRoomFolder,
  dataRoomDocuments, InsertDataRoomDocument, dataRoomLinks, InsertDataRoomLink,
  dataRoomVisitors, InsertDataRoomVisitor, documentViews, InsertDocumentView,
  dataRoomInvitations, InsertDataRoomInvitation,
  documentPageViews, InsertDocumentPageView,
  dataRoomDriveSyncConfig, InsertDataRoomDriveSyncConfig,
  dataRoomDriveSyncLogs, InsertDataRoomDriveSyncLog,
  dataRoomEmailAccessRules, InsertDataRoomEmailAccessRule,
  dataRoomVisitorSessions, InsertDataRoomVisitorSession,
  ndaDocuments, InsertNdaDocument, ndaSignatures, InsertNdaSignature,
  ndaSignatureAuditLog, InsertNdaSignatureAuditLog,
  dueDiligenceTemplates, InsertDueDiligenceTemplate,
  dueDiligenceCategories, InsertDueDiligenceCategory,
  dueDiligenceItems, InsertDueDiligenceItem,
  dataRoomChecklists, InsertDataRoomChecklist,
  dataRoomChecklistItems, InsertDataRoomChecklistItem,
} from "../../drizzle/schema";
import { getDb } from "./connection";

interface DDCategory { name: string; items: Array<{ name: string; keywords?: string[] }> }
const STANDARD_DD_CATEGORIES: Record<string, DDCategory> = {
  corporate: {
    name: "Corporate Documents",
    items: [
      { name: "Certificate of Incorporation", keywords: ["incorporation", "certificate", "articles"] },
      { name: "Bylaws / Operating Agreement", keywords: ["bylaws", "operating agreement"] },
      { name: "Board Minutes", keywords: ["board minutes", "board resolutions"] },
      { name: "Shareholder Agreement", keywords: ["shareholder", "stockholder"] },
      { name: "Cap Table", keywords: ["cap table", "capitalization", "equity"] },
      { name: "Good Standing Certificate", keywords: ["good standing"] },
    ],
  },
  financial: {
    name: "Financial Documents",
    items: [
      { name: "Audited Financial Statements", keywords: ["audited", "financial statements", "audit"] },
      { name: "Tax Returns (3 years)", keywords: ["tax return", "1120", "tax filing"] },
      { name: "Revenue Projections", keywords: ["revenue projection", "forecast", "financial model"] },
      { name: "Accounts Receivable Aging", keywords: ["accounts receivable", "AR aging"] },
      { name: "Accounts Payable Aging", keywords: ["accounts payable", "AP aging"] },
      { name: "Bank Statements", keywords: ["bank statement"] },
    ],
  },
  legal: {
    name: "Legal & Compliance",
    items: [
      { name: "Material Contracts", keywords: ["contract", "agreement", "material"] },
      { name: "Litigation Summary", keywords: ["litigation", "lawsuit", "legal proceedings"] },
      { name: "IP Portfolio", keywords: ["intellectual property", "patent", "trademark", "IP"] },
      { name: "Regulatory Licenses", keywords: ["license", "permit", "regulatory"] },
      { name: "Insurance Policies", keywords: ["insurance", "policy", "coverage"] },
    ],
  },
  operations: {
    name: "Operations",
    items: [
      { name: "Org Chart", keywords: ["org chart", "organization", "team structure"] },
      { name: "Key Employee List", keywords: ["employee", "key personnel", "management team"] },
      { name: "Employee Benefits Summary", keywords: ["benefits", "401k", "health insurance"] },
      { name: "Vendor Agreements", keywords: ["vendor", "supplier", "procurement"] },
      { name: "Customer Contracts", keywords: ["customer contract", "client agreement"] },
    ],
  },
};
const SERIES_B_DD_CATEGORIES: Record<string, DDCategory> = {
  ...STANDARD_DD_CATEGORIES,
  growth: {
    name: "Growth & Market",
    items: [
      { name: "Market Analysis", keywords: ["market analysis", "TAM", "SAM", "market size"] },
      { name: "Competitive Landscape", keywords: ["competitive", "competitor", "market position"] },
      { name: "Customer Acquisition Metrics", keywords: ["CAC", "customer acquisition", "LTV"] },
      { name: "Unit Economics", keywords: ["unit economics", "margin", "contribution"] },
      { name: "Growth Strategy Deck", keywords: ["growth strategy", "expansion plan"] },
    ],
  },
  technology: {
    name: "Technology & Product",
    items: [
      { name: "Product Roadmap", keywords: ["product roadmap", "feature plan"] },
      { name: "Technical Architecture", keywords: ["architecture", "tech stack", "infrastructure"] },
      { name: "Security Audit Report", keywords: ["security audit", "penetration test", "SOC 2"] },
      { name: "Data Privacy Compliance", keywords: ["GDPR", "CCPA", "data privacy", "privacy policy"] },
    ],
  },
};

const FUNDRAISING_DD_CATEGORIES: Record<string, DDCategory> = {
  pitch: {
    name: "Pitch Materials",
    items: [
      { name: "Pitch Deck", keywords: ["pitch deck", "investor deck", "presentation"] },
      { name: "Executive Summary", keywords: ["executive summary", "one pager", "overview"] },
      { name: "Company Overview", keywords: ["company overview", "about us"] },
    ],
  },
  financial: {
    name: "Financial Documents",
    items: [
      { name: "Financial Model / Projections", keywords: ["financial model", "projection", "forecast"] },
      { name: "Income Statement (P&L)", keywords: ["income statement", "profit loss", "P&L"] },
      { name: "Cash Flow Statement", keywords: ["cash flow", "burn rate", "runway"] },
      { name: "Bank Statements", keywords: ["bank statement"] },
      { name: "Cap Table", keywords: ["cap table", "capitalization", "equity", "share structure"] },
    ],
  },
  corporate: {
    name: "Corporate Documents",
    items: [
      { name: "Certificate of Incorporation", keywords: ["incorporation", "certificate", "articles"] },
      { name: "Bylaws / Operating Agreement", keywords: ["bylaws", "operating agreement"] },
      { name: "Shareholder Agreement", keywords: ["shareholder", "stockholder"] },
      { name: "Board Approval Minutes", keywords: ["board minutes", "board resolutions"] },
    ],
  },
  product: {
    name: "Product & Market",
    items: [
      { name: "Product Demo or Screenshots", keywords: ["demo", "screenshot", "product video"] },
      { name: "Market Size Analysis", keywords: ["market size", "TAM", "SAM", "SOM"] },
      { name: "Competitive Analysis", keywords: ["competitive", "competitor", "differentiation"] },
      { name: "Customer Testimonials / References", keywords: ["testimonial", "reference", "customer quote"] },
    ],
  },
  team: {
    name: "Team",
    items: [
      { name: "Org Chart", keywords: ["org chart", "organization", "team structure"] },
      { name: "Founder Bios / Resumes", keywords: ["bio", "resume", "founder background", "linkedin"] },
      { name: "Advisory Board List", keywords: ["advisory board", "advisor", "advisors"] },
    ],
  },
  legal: {
    name: "Legal & IP",
    items: [
      { name: "IP Portfolio / Patents", keywords: ["intellectual property", "patent", "trademark", "IP"] },
      { name: "Key Contracts", keywords: ["contract", "agreement", "material"] },
      { name: "Regulatory Licenses", keywords: ["license", "permit", "regulatory"] },
    ],
  },
};

const MA_DD_CATEGORIES: Record<string, DDCategory> = {
  ...STANDARD_DD_CATEGORIES,
  business: {
    name: "Business Overview",
    items: [
      { name: "Company Information Memo", keywords: ["information memo", "CIM", "company overview"] },
      { name: "Customer List / Concentration Analysis", keywords: ["customer list", "customer concentration", "top customers"] },
      { name: "Revenue by Customer / Product", keywords: ["revenue breakdown", "revenue by customer", "product revenue"] },
      { name: "Backlog / Pipeline", keywords: ["backlog", "pipeline", "order book"] },
    ],
  },
  hr: {
    name: "Human Resources",
    items: [
      { name: "Employee List with Compensation", keywords: ["employee list", "compensation", "salary"] },
      { name: "Key Employee Agreements", keywords: ["employment agreement", "key employee", "retention"] },
      { name: "Non-Compete / NDA Agreements", keywords: ["non-compete", "NDA", "non-disclosure", "confidentiality"] },
      { name: "Employee Benefits & Pension Plans", keywords: ["benefits", "pension", "401k", "ERISA"] },
      { name: "HR Policies Manual", keywords: ["HR policy", "employee handbook", "code of conduct"] },
    ],
  },
  real_estate: {
    name: "Real Estate & Assets",
    items: [
      { name: "Lease Agreements", keywords: ["lease", "real estate", "property", "landlord"] },
      { name: "Fixed Asset Register", keywords: ["fixed asset", "asset register", "PPE"] },
      { name: "Equipment Schedules", keywords: ["equipment", "machinery", "asset schedule"] },
    ],
  },
  it: {
    name: "IT & Systems",
    items: [
      { name: "IT Systems Inventory", keywords: ["IT systems", "software", "systems inventory"] },
      { name: "Cybersecurity Policies", keywords: ["cybersecurity", "information security", "security policy"] },
      { name: "Data Privacy Compliance", keywords: ["GDPR", "CCPA", "data privacy", "privacy policy"] },
    ],
  },
  environmental: {
    name: "Environmental & Regulatory",
    items: [
      { name: "Environmental Compliance Reports", keywords: ["environmental", "EPA", "compliance report"] },
      { name: "Regulatory Filings", keywords: ["regulatory filing", "government filing", "compliance"] },
      { name: "Permits & Licenses", keywords: ["permit", "license", "certification"] },
    ],
  },
};

// Data Rooms
export async function createDataRoom(data: InsertDataRoom) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(dataRooms).values(data);
  return { id: result[0].insertId };
}

export async function getDataRooms(ownerId?: number) {
  const db = await getDb();
  if (!db) return [];
  
  if (ownerId) {
    return db.select().from(dataRooms).where(eq(dataRooms.ownerId, ownerId)).orderBy(desc(dataRooms.createdAt));
  }
  return db.select().from(dataRooms).orderBy(desc(dataRooms.createdAt));
}

export async function getDataRoomById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(dataRooms).where(eq(dataRooms.id, id)).limit(1);
  return result[0] || null;
}

export async function getDataRoomBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(dataRooms).where(eq(dataRooms.slug, slug)).limit(1);
  return result[0] || null;
}

export async function updateDataRoom(id: number, data: Partial<InsertDataRoom>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dataRooms).set(data).where(eq(dataRooms.id, id));
}

export async function deleteDataRoom(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(dataRooms).where(eq(dataRooms.id, id));
}

// Data Room Folders
export async function createDataRoomFolder(data: InsertDataRoomFolder) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(dataRoomFolders).values(data);
  return { id: result[0].insertId };
}

export async function getDataRoomFolders(dataRoomId: number, parentId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  
  if (parentId === null) {
    return db.select().from(dataRoomFolders)
      .where(and(eq(dataRoomFolders.dataRoomId, dataRoomId), isNull(dataRoomFolders.parentId)))
      .orderBy(dataRoomFolders.sortOrder, dataRoomFolders.name);
  } else if (parentId !== undefined) {
    return db.select().from(dataRoomFolders)
      .where(and(eq(dataRoomFolders.dataRoomId, dataRoomId), eq(dataRoomFolders.parentId, parentId)))
      .orderBy(dataRoomFolders.sortOrder, dataRoomFolders.name);
  }
  
  return db.select().from(dataRoomFolders)
    .where(eq(dataRoomFolders.dataRoomId, dataRoomId))
    .orderBy(dataRoomFolders.sortOrder, dataRoomFolders.name);
}

export async function getDataRoomFolderById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(dataRoomFolders).where(eq(dataRoomFolders.id, id)).limit(1);
  return result[0] || null;
}

export async function updateDataRoomFolder(id: number, data: Partial<InsertDataRoomFolder>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dataRoomFolders).set(data).where(eq(dataRoomFolders.id, id));
}

export async function deleteDataRoomFolder(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(dataRoomFolders).where(eq(dataRoomFolders.id, id));
}

// Data Room Documents
export async function createDataRoomDocument(data: InsertDataRoomDocument) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(dataRoomDocuments).values(data);
  return { id: result[0].insertId };
}

export async function getDataRoomDocuments(dataRoomId: number, folderId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  
  if (folderId === null) {
    return db.select().from(dataRoomDocuments)
      .where(and(eq(dataRoomDocuments.dataRoomId, dataRoomId), isNull(dataRoomDocuments.folderId)))
      .orderBy(dataRoomDocuments.sortOrder, dataRoomDocuments.name);
  } else if (folderId !== undefined) {
    return db.select().from(dataRoomDocuments)
      .where(and(eq(dataRoomDocuments.dataRoomId, dataRoomId), eq(dataRoomDocuments.folderId, folderId)))
      .orderBy(dataRoomDocuments.sortOrder, dataRoomDocuments.name);
  }
  
  return db.select().from(dataRoomDocuments)
    .where(eq(dataRoomDocuments.dataRoomId, dataRoomId))
    .orderBy(dataRoomDocuments.sortOrder, dataRoomDocuments.name);
}

export async function getDataRoomDocumentById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(dataRoomDocuments).where(eq(dataRoomDocuments.id, id)).limit(1);
  return result[0] || null;
}

export async function updateDataRoomDocument(id: number, data: Partial<InsertDataRoomDocument>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dataRoomDocuments).set(data).where(eq(dataRoomDocuments.id, id));
}

export async function deleteDataRoomDocument(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(dataRoomDocuments).where(eq(dataRoomDocuments.id, id));
}

// Data Room Links
export async function createDataRoomLink(data: InsertDataRoomLink) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(dataRoomLinks).values(data);
  return { id: result[0].insertId };
}

export async function getDataRoomLinks(dataRoomId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dataRoomLinks)
    .where(eq(dataRoomLinks.dataRoomId, dataRoomId))
    .orderBy(desc(dataRoomLinks.createdAt));
}

export async function getDataRoomLinkByCode(linkCode: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(dataRoomLinks).where(eq(dataRoomLinks.linkCode, linkCode)).limit(1);
  return result[0] || null;
}

export async function updateDataRoomLink(id: number, data: Partial<InsertDataRoomLink>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dataRoomLinks).set(data).where(eq(dataRoomLinks.id, id));
}

export async function incrementLinkViewCount(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dataRoomLinks)
    .set({ viewCount: sql`${dataRoomLinks.viewCount} + 1` })
    .where(eq(dataRoomLinks.id, id));
}

export async function deleteDataRoomLink(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(dataRoomLinks).where(eq(dataRoomLinks.id, id));
}

// Data Room Visitors
export async function createDataRoomVisitor(data: InsertDataRoomVisitor) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(dataRoomVisitors).values(data);
  return { id: result[0].insertId };
}

export async function getDataRoomVisitors(dataRoomId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dataRoomVisitors)
    .where(eq(dataRoomVisitors.dataRoomId, dataRoomId))
    .orderBy(desc(dataRoomVisitors.lastViewedAt));
}

export async function getVisitorByEmail(dataRoomId: number, email: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(dataRoomVisitors)
    .where(and(eq(dataRoomVisitors.dataRoomId, dataRoomId), eq(dataRoomVisitors.email, email.toLowerCase())))
    .limit(1);
  return result[0] || null;
}

export async function updateDataRoomVisitor(id: number, data: Partial<InsertDataRoomVisitor>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dataRoomVisitors).set(data).where(eq(dataRoomVisitors.id, id));
}

// Document Views
export async function createDocumentView(data: InsertDocumentView) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(documentViews).values(data);
  return { id: result[0].insertId };
}

export async function getDocumentViews(documentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documentViews)
    .where(eq(documentViews.documentId, documentId))
    .orderBy(desc(documentViews.startedAt));
}

export async function getVisitorDocumentViews(visitorId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documentViews)
    .where(eq(documentViews.visitorId, visitorId))
    .orderBy(desc(documentViews.startedAt));
}

export async function updateDocumentView(id: number, data: Partial<InsertDocumentView>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(documentViews).set(data).where(eq(documentViews.id, id));
}

// Data Room Invitations
export async function createDataRoomInvitation(data: InsertDataRoomInvitation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(dataRoomInvitations).values(data);
  return { id: result[0].insertId };
}

export async function getDataRoomInvitations(dataRoomId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dataRoomInvitations)
    .where(eq(dataRoomInvitations.dataRoomId, dataRoomId))
    .orderBy(desc(dataRoomInvitations.createdAt));
}

export async function getInvitationByCode(inviteCode: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(dataRoomInvitations)
    .where(eq(dataRoomInvitations.inviteCode, inviteCode))
    .limit(1);
  return result[0] || null;
}

export async function updateDataRoomInvitation(id: number, data: Partial<InsertDataRoomInvitation>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dataRoomInvitations).set(data).where(eq(dataRoomInvitations.id, id));
}


// ============================================
// DATA ROOM ANALYTICS
// ============================================

export async function getDataRoomAnalytics(dataRoomId: number) {
  const db = await getDb();
  if (!db) return null;

  // Get total visitors
  const visitors = await db.select().from(dataRoomVisitors).where(eq(dataRoomVisitors.dataRoomId, dataRoomId));
  
  // Get total document views
  const documents = await db.select().from(dataRoomDocuments).where(eq(dataRoomDocuments.dataRoomId, dataRoomId));
  const documentIds = documents.map(d => d.id);
  
  let totalViews = 0;
  let totalTimeSpent = 0;
  let viewsByDocument: Record<number, number> = {};
  
  if (documentIds.length > 0) {
    const views = await db.select().from(documentViews).where(inArray(documentViews.documentId, documentIds));
    totalViews = views.length;
    totalTimeSpent = views.reduce((sum, v) => sum + (v.duration || 0), 0);
    
    for (const view of views) {
      viewsByDocument[view.documentId] = (viewsByDocument[view.documentId] || 0) + 1;
    }
  }

  // Get links
  const links = await db.select().from(dataRoomLinks).where(eq(dataRoomLinks.dataRoomId, dataRoomId));
  const totalLinkViews = links.reduce((sum, l) => sum + l.viewCount, 0);

  return {
    totalVisitors: visitors.length,
    totalDocumentViews: totalViews,
    totalTimeSpent,
    totalLinks: links.length,
    totalLinkViews,
    viewsByDocument,
    recentVisitors: visitors.slice(0, 10),
  };
}

export async function getDocumentAnalytics(documentId: number) {
  const db = await getDb();
  if (!db) return null;

  const views = await db.select().from(documentViews).where(eq(documentViews.documentId, documentId)).orderBy(desc(documentViews.startedAt));
  
  const totalViews = views.length;
  const uniqueVisitors = new Set(views.map(v => v.visitorId)).size;
  const totalTimeSpent = views.reduce((sum, v) => sum + (v.duration || 0), 0);
  const avgTimeSpent = totalViews > 0 ? totalTimeSpent / totalViews : 0;
  const downloads = views.filter(v => v.downloaded).length;

  return {
    totalViews,
    uniqueVisitors,
    totalTimeSpent,
    avgTimeSpent,
    downloads,
    recentViews: views.slice(0, 20),
  };
}

export async function getVisitorTimeline(visitorId: number) {
  const db = await getDb();
  if (!db) return [];

  const views = await db.select({
    view: documentViews,
    document: dataRoomDocuments,
  })
  .from(documentViews)
  .leftJoin(dataRoomDocuments, eq(documentViews.documentId, dataRoomDocuments.id))
  .where(eq(documentViews.visitorId, visitorId))
  .orderBy(desc(documentViews.startedAt));

  return views.map(v => ({
    ...v.view,
    documentName: v.document?.name || 'Unknown',
    documentType: v.document?.fileType || 'unknown',
  }));
}

// ============================================
// DATA ROOM - PAGE-LEVEL TRACKING FUNCTIONS
// ============================================

// Document Page Views
export async function createDocumentPageView(data: InsertDocumentPageView) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(documentPageViews).values(data);
  return result[0].insertId;
}

export async function getDocumentPageViewById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(documentPageViews)
    .where(eq(documentPageViews.id, id))
    .limit(1);
  return result[0] || null;
}

export async function getDocumentPageViews(documentId: number, visitorId?: number) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(documentPageViews.documentId, documentId)];
  if (visitorId) {
    conditions.push(eq(documentPageViews.visitorId, visitorId));
  }

  return db.select().from(documentPageViews)
    .where(and(...conditions))
    .orderBy(desc(documentPageViews.enterTime));
}

export async function getPageViewsByVisitor(visitorId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(documentPageViews)
    .where(eq(documentPageViews.visitorId, visitorId))
    .orderBy(desc(documentPageViews.enterTime));
}

export async function updateDocumentPageView(id: number, data: Partial<InsertDocumentPageView>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(documentPageViews).set(data).where(eq(documentPageViews.id, id));
}

export async function getPageViewAnalytics(dataRoomId: number) {
  const db = await getDb();
  if (!db) return { pageViews: [], documentStats: [], visitorStats: [] };

  // Get all documents in the data room
  const docs = await db.select().from(dataRoomDocuments)
    .where(eq(dataRoomDocuments.dataRoomId, dataRoomId));

  const docIds = docs.map(d => d.id);
  if (docIds.length === 0) {
    return { pageViews: [], documentStats: [], visitorStats: [] };
  }

  // Get page views for those documents
  const pageViews = await db.select().from(documentPageViews)
    .where(inArray(documentPageViews.documentId, docIds))
    .orderBy(desc(documentPageViews.enterTime));

  // Aggregate stats by document
  const documentStats = docs.map(doc => {
    const docPageViews = pageViews.filter(pv => pv.documentId === doc.id);
    const totalDuration = docPageViews.reduce((sum, pv) => sum + (pv.durationMs || 0), 0);
    const uniqueVisitors = new Set(docPageViews.map(pv => pv.visitorId)).size;
    const pageStats: Record<number, { views: number; avgDuration: number }> = {};

    docPageViews.forEach(pv => {
      if (!pageStats[pv.pageNumber]) {
        pageStats[pv.pageNumber] = { views: 0, avgDuration: 0 };
      }
      pageStats[pv.pageNumber].views++;
      pageStats[pv.pageNumber].avgDuration += pv.durationMs || 0;
    });

    // Calculate averages
    Object.keys(pageStats).forEach(page => {
      const p = parseInt(page);
      if (pageStats[p].views > 0) {
        pageStats[p].avgDuration = pageStats[p].avgDuration / pageStats[p].views;
      }
    });

    return {
      documentId: doc.id,
      documentName: doc.name,
      totalViews: docPageViews.length,
      uniqueVisitors,
      totalDurationMs: totalDuration,
      avgDurationMs: docPageViews.length > 0 ? totalDuration / docPageViews.length : 0,
      pageStats,
    };
  });

  // Aggregate stats by visitor
  const visitorIds = Array.from(new Set(pageViews.map(pv => pv.visitorId)));
  const visitors = visitorIds.length > 0
    ? await db.select().from(dataRoomVisitors).where(inArray(dataRoomVisitors.id, visitorIds))
    : [];

  const visitorStats = visitors.map(visitor => {
    const visitorPageViews = pageViews.filter(pv => pv.visitorId === visitor.id);
    const totalDuration = visitorPageViews.reduce((sum, pv) => sum + (pv.durationMs || 0), 0);
    const documentsViewed = new Set(visitorPageViews.map(pv => pv.documentId)).size;

    // Group by document
    const byDocument: Record<number, { pages: number[]; totalDuration: number }> = {};
    visitorPageViews.forEach(pv => {
      if (!byDocument[pv.documentId]) {
        byDocument[pv.documentId] = { pages: [], totalDuration: 0 };
      }
      if (!byDocument[pv.documentId].pages.includes(pv.pageNumber)) {
        byDocument[pv.documentId].pages.push(pv.pageNumber);
      }
      byDocument[pv.documentId].totalDuration += pv.durationMs || 0;
    });

    return {
      visitorId: visitor.id,
      email: visitor.email,
      name: visitor.name,
      company: visitor.company,
      totalPageViews: visitorPageViews.length,
      documentsViewed,
      totalDurationMs: totalDuration,
      byDocument,
    };
  });

  return { pageViews, documentStats, visitorStats };
}

// ============================================
// DATA ROOM - GOOGLE DRIVE SYNC FUNCTIONS
// ============================================

export async function createDriveSyncConfig(data: InsertDataRoomDriveSyncConfig) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(dataRoomDriveSyncConfig).values(data);
  return result[0].insertId;
}

export async function getDriveSyncConfig(dataRoomId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(dataRoomDriveSyncConfig)
    .where(eq(dataRoomDriveSyncConfig.dataRoomId, dataRoomId));
  return result[0] || null;
}

export async function updateDriveSyncConfig(id: number, data: Partial<InsertDataRoomDriveSyncConfig>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dataRoomDriveSyncConfig).set(data).where(eq(dataRoomDriveSyncConfig.id, id));
}

export async function deleteDriveSyncConfig(dataRoomId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(dataRoomDriveSyncConfig).where(eq(dataRoomDriveSyncConfig.dataRoomId, dataRoomId));
}

export async function createDriveSyncLog(data: InsertDataRoomDriveSyncLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(dataRoomDriveSyncLogs).values(data);
  return result[0].insertId;
}

export async function getDriveSyncLogs(dataRoomId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dataRoomDriveSyncLogs)
    .where(eq(dataRoomDriveSyncLogs.dataRoomId, dataRoomId))
    .orderBy(desc(dataRoomDriveSyncLogs.startedAt))
    .limit(limit);
}

export async function updateDriveSyncLog(id: number, data: Partial<InsertDataRoomDriveSyncLog>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dataRoomDriveSyncLogs).set(data).where(eq(dataRoomDriveSyncLogs.id, id));
}

// ============================================
// DATA ROOM - EMAIL ACCESS RULES FUNCTIONS
// ============================================

export async function createEmailAccessRule(data: InsertDataRoomEmailAccessRule) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(dataRoomEmailAccessRules).values(data);
  return result[0].insertId;
}

export async function getEmailAccessRules(dataRoomId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dataRoomEmailAccessRules)
    .where(eq(dataRoomEmailAccessRules.dataRoomId, dataRoomId))
    .orderBy(desc(dataRoomEmailAccessRules.priority));
}

export async function updateEmailAccessRule(id: number, data: Partial<InsertDataRoomEmailAccessRule>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dataRoomEmailAccessRules).set(data).where(eq(dataRoomEmailAccessRules.id, id));
}

export async function deleteEmailAccessRule(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(dataRoomEmailAccessRules).where(eq(dataRoomEmailAccessRules.id, id));
}

export async function checkEmailAccess(dataRoomId: number, email: string): Promise<{
  allowed: boolean;
  rule: typeof dataRoomEmailAccessRules.$inferSelect | null;
  permissions: { allowDownload: boolean; allowPrint: boolean; maxViews: number | null; requireNda: boolean };
}> {
  const db = await getDb();
  if (!db) return { allowed: true, rule: null, permissions: { allowDownload: true, allowPrint: true, maxViews: null, requireNda: true } };

  const rules = await db.select().from(dataRoomEmailAccessRules)
    .where(and(
      eq(dataRoomEmailAccessRules.dataRoomId, dataRoomId),
      eq(dataRoomEmailAccessRules.isActive, true),
      // Filter out expired rules
      or(
        isNull(dataRoomEmailAccessRules.expiresAt),
        gte(dataRoomEmailAccessRules.expiresAt, new Date())
      )
    ))
    .orderBy(desc(dataRoomEmailAccessRules.priority));

  const emailLower = email.toLowerCase();
  const domain = emailLower.split('@')[1];

  for (const rule of rules) {
    const pattern = rule.emailPattern.toLowerCase();
    let matches = false;

    if (rule.ruleType === 'allow_email' || rule.ruleType === 'block_email') {
      matches = emailLower === pattern;
    } else if (rule.ruleType === 'allow_domain' || rule.ruleType === 'block_domain') {
      matches = domain === pattern || pattern === '*';
    }

    if (matches) {
      const isBlock = rule.ruleType === 'block_email' || rule.ruleType === 'block_domain';
      return {
        allowed: !isBlock,
        rule,
        permissions: {
          allowDownload: rule.allowDownload ?? true,
          allowPrint: rule.allowPrint ?? true,
          maxViews: rule.maxViews,
          requireNda: rule.requireNdaSignature ?? true,
        }
      };
    }
  }

  // Default: allow with default permissions
  return { allowed: true, rule: null, permissions: { allowDownload: true, allowPrint: true, maxViews: null, requireNda: true } };
}

// ============================================
// DATA ROOM - VISITOR SESSION FUNCTIONS
// ============================================

export async function createVisitorSession(data: InsertDataRoomVisitorSession) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(dataRoomVisitorSessions).values(data);
  return result[0].insertId;
}

export async function getVisitorSessions(visitorId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dataRoomVisitorSessions)
    .where(eq(dataRoomVisitorSessions.visitorId, visitorId))
    .orderBy(desc(dataRoomVisitorSessions.sessionStartAt));
}

export async function getDataRoomSessions(dataRoomId: number, limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dataRoomVisitorSessions)
    .where(eq(dataRoomVisitorSessions.dataRoomId, dataRoomId))
    .orderBy(desc(dataRoomVisitorSessions.sessionStartAt))
    .limit(limit);
}

export async function updateVisitorSession(id: number, data: Partial<InsertDataRoomVisitorSession>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dataRoomVisitorSessions).set(data).where(eq(dataRoomVisitorSessions.id, id));
}

export async function getSessionByToken(sessionToken: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(dataRoomVisitorSessions)
    .where(eq(dataRoomVisitorSessions.sessionToken, sessionToken));
  return result[0] || null;
}

export async function getActiveSession(visitorId: number, dataRoomId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(dataRoomVisitorSessions)
    .where(and(
      eq(dataRoomVisitorSessions.visitorId, visitorId),
      eq(dataRoomVisitorSessions.dataRoomId, dataRoomId),
      eq(dataRoomVisitorSessions.isActive, true)
    ))
    .orderBy(desc(dataRoomVisitorSessions.sessionStartAt))
    .limit(1);
  return result[0] || null;
}

// ============================================
// DATA ROOM - DETAILED ANALYTICS FUNCTIONS
// ============================================

export async function getDetailedVisitorAnalytics(dataRoomId: number, visitorId: number) {
  const db = await getDb();
  if (!db) return null;

  // Get visitor info
  const visitor = await db.select().from(dataRoomVisitors)
    .where(eq(dataRoomVisitors.id, visitorId));
  if (!visitor[0]) return null;

  // Get all sessions
  const sessions = await getVisitorSessions(visitorId);

  // Get all page views
  const pageViews = await getPageViewsByVisitor(visitorId);

  // Get document views
  const docViews = await db.select().from(documentViews)
    .where(eq(documentViews.visitorId, visitorId));

  // Get documents info
  const docIds = Array.from(new Set(pageViews.map(pv => pv.documentId)));
  const documents = docIds.length > 0
    ? await db.select().from(dataRoomDocuments).where(inArray(dataRoomDocuments.id, docIds))
    : [];

  // Build detailed analytics
  const documentEngagement = documents.map(doc => {
    const docPageViews = pageViews.filter(pv => pv.documentId === doc.id);
    const uniquePages = Array.from(new Set(docPageViews.map(pv => pv.pageNumber)));
    const totalDuration = docPageViews.reduce((sum, pv) => sum + (pv.durationMs || 0), 0);

    // Page-by-page breakdown
    const pageBreakdown: Record<number, { views: number; totalDuration: number; avgDuration: number; scrollDepth: number }> = {};
    docPageViews.forEach(pv => {
      if (!pageBreakdown[pv.pageNumber]) {
        pageBreakdown[pv.pageNumber] = { views: 0, totalDuration: 0, avgDuration: 0, scrollDepth: 0 };
      }
      pageBreakdown[pv.pageNumber].views++;
      pageBreakdown[pv.pageNumber].totalDuration += pv.durationMs || 0;
      pageBreakdown[pv.pageNumber].scrollDepth = Math.max(pageBreakdown[pv.pageNumber].scrollDepth, pv.scrollDepth || 0);
    });

    Object.keys(pageBreakdown).forEach(page => {
      const p = parseInt(page);
      pageBreakdown[p].avgDuration = pageBreakdown[p].totalDuration / pageBreakdown[p].views;
    });

    return {
      documentId: doc.id,
      documentName: doc.name,
      pageCount: doc.pageCount || 1,
      pagesViewed: uniquePages.length,
      percentViewed: doc.pageCount ? Math.round((uniquePages.length / doc.pageCount) * 100) : 100,
      totalViews: docPageViews.length,
      totalDurationMs: totalDuration,
      avgPageDurationMs: docPageViews.length > 0 ? totalDuration / docPageViews.length : 0,
      pageBreakdown,
    };
  });

  return {
    visitor: visitor[0],
    sessions,
    documentEngagement,
    summary: {
      totalSessions: sessions.length,
      totalDocuments: documents.length,
      totalPageViews: pageViews.length,
      totalTimeMs: sessions.reduce((sum, s) => sum + (s.totalDurationMs || 0), 0),
      downloads: docViews.filter(dv => dv.downloaded).length,
      prints: docViews.filter(dv => dv.printed).length,
    },
  };
}

export async function getDataRoomEngagementReport(dataRoomId: number, startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) return null;

  const room = await db.select().from(dataRooms).where(eq(dataRooms.id, dataRoomId));
  if (!room[0]) return null;

  // Get all visitors
  const visitors = await db.select().from(dataRoomVisitors)
    .where(eq(dataRoomVisitors.dataRoomId, dataRoomId));

  // Get all documents
  const documents = await db.select().from(dataRoomDocuments)
    .where(eq(dataRoomDocuments.dataRoomId, dataRoomId));

  // Get all sessions with date filter applied in SQL
  const sessionsConditions = [eq(dataRoomVisitorSessions.dataRoomId, dataRoomId)];
  if (startDate) {
    sessionsConditions.push(gte(dataRoomVisitorSessions.sessionStartAt, startDate));
  }
  if (endDate) {
    sessionsConditions.push(lte(dataRoomVisitorSessions.sessionStartAt, endDate));
  }
  const filteredSessions = await db.select().from(dataRoomVisitorSessions)
    .where(and(...sessionsConditions));

  // Get page views for documents with date filter applied in SQL
  const docIds = documents.map(d => d.id);
  let filteredPageViews: any[] = [];
  if (docIds.length > 0) {
    const pageViewConditions = [inArray(documentPageViews.documentId, docIds)];
    if (startDate) {
      pageViewConditions.push(gte(documentPageViews.enterTime, startDate));
    }
    if (endDate) {
      pageViewConditions.push(lte(documentPageViews.enterTime, endDate));
    }
    filteredPageViews = await db.select().from(documentPageViews)
      .where(and(...pageViewConditions));
  }

  // Build report
  const visitorEngagement = visitors.map(v => {
    const vSessions = filteredSessions.filter(s => s.visitorId === v.id);
    const vPageViews = filteredPageViews.filter(pv => pv.visitorId === v.id);

    return {
      visitorId: v.id,
      email: v.email,
      name: v.name,
      company: v.company,
      accessStatus: v.accessStatus,
      ndaAcceptedAt: v.ndaAcceptedAt,
      sessionsCount: vSessions.length,
      totalTimeMs: vSessions.reduce((sum, s) => sum + (s.totalDurationMs || 0), 0),
      documentsViewed: Array.from(new Set(vPageViews.map(pv => pv.documentId))).length,
      pagesViewed: vPageViews.length,
      lastActivity: vSessions.length > 0
        ? vSessions.reduce((latest, s) => s.sessionStartAt > latest ? s.sessionStartAt : latest, vSessions[0].sessionStartAt)
        : v.lastViewedAt,
    };
  });

  const documentEngagement = documents.map(d => {
    const dPageViews = filteredPageViews.filter(pv => pv.documentId === d.id);
    const uniqueVisitors = Array.from(new Set(dPageViews.map(pv => pv.visitorId)));

    return {
      documentId: d.id,
      documentName: d.name,
      pageCount: d.pageCount || 1,
      views: dPageViews.length,
      uniqueVisitors: uniqueVisitors.length,
      totalTimeMs: dPageViews.reduce((sum, pv) => sum + (pv.durationMs || 0), 0),
      avgTimePerPageMs: dPageViews.length > 0
        ? dPageViews.reduce((sum, pv) => sum + (pv.durationMs || 0), 0) / dPageViews.length
        : 0,
    };
  });

  return {
    dataRoom: room[0],
    period: { startDate, endDate },
    summary: {
      totalVisitors: visitors.length,
      activeVisitors: visitors.filter(v => v.accessStatus === 'active').length,
      totalSessions: filteredSessions.length,
      totalDocuments: documents.length,
      totalPageViews: filteredPageViews.length,
      totalEngagementTimeMs: filteredSessions.reduce((sum, s) => sum + (s.totalDurationMs || 0), 0),
      ndaSignedCount: visitors.filter(v => v.ndaAcceptedAt).length,
    },
    visitorEngagement: visitorEngagement.sort((a, b) => b.totalTimeMs - a.totalTimeMs),
    documentEngagement: documentEngagement.sort((a, b) => b.views - a.views),
  };
}


// ============================================
// NDA E-SIGNATURES
// ============================================

// NDA Documents
export async function getNdaDocuments(dataRoomId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(ndaDocuments)
    .where(eq(ndaDocuments.dataRoomId, dataRoomId))
    .orderBy(desc(ndaDocuments.createdAt));
}

export async function getActiveNdaDocument(dataRoomId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const [result] = await db.select().from(ndaDocuments)
    .where(and(
      eq(ndaDocuments.dataRoomId, dataRoomId),
      eq(ndaDocuments.isActive, true)
    ))
    .orderBy(desc(ndaDocuments.createdAt))
    .limit(1);
  
  return result || null;
}

export async function getNdaDocumentById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const [result] = await db.select().from(ndaDocuments).where(eq(ndaDocuments.id, id));
  return result || null;
}

export async function createNdaDocument(data: {
  dataRoomId: number;
  name: string;
  version?: string;
  storageKey: string;
  storageUrl: string;
  mimeType?: string;
  fileSize?: number;
  pageCount?: number;
  requiresSignature?: boolean;
  allowTypedSignature?: boolean;
  allowDrawnSignature?: boolean;
  uploadedBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Deactivate previous NDA documents for this data room
  await db.update(ndaDocuments)
    .set({ isActive: false })
    .where(eq(ndaDocuments.dataRoomId, data.dataRoomId));
  
  const [result] = await db.insert(ndaDocuments).values({
    ...data,
    isActive: true,
  });
  return { id: result.insertId };
}

export async function updateNdaDocument(id: number, data: Partial<{
  name: string;
  version: string;
  isActive: boolean;
  requiresSignature: boolean;
  allowTypedSignature: boolean;
  allowDrawnSignature: boolean;
}>) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(ndaDocuments).set(data).where(eq(ndaDocuments.id, id));
}

export async function deleteNdaDocument(id: number) {
  const db = await getDb();
  if (!db) return;
  
  await db.delete(ndaDocuments).where(eq(ndaDocuments.id, id));
}

// NDA Signatures
export async function getNdaSignatures(dataRoomId: number, options?: { visitorId?: number; status?: string }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [eq(ndaSignatures.dataRoomId, dataRoomId)];
  if (options?.visitorId) conditions.push(eq(ndaSignatures.visitorId, options.visitorId));
  if (options?.status) conditions.push(eq(ndaSignatures.status, options.status as any));
  
  return db.select().from(ndaSignatures)
    .where(and(...conditions))
    .orderBy(desc(ndaSignatures.signedAt));
}

export async function getNdaSignatureById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const [result] = await db.select().from(ndaSignatures).where(eq(ndaSignatures.id, id));
  return result || null;
}

export async function getVisitorNdaSignature(dataRoomId: number, visitorEmail: string) {
  const db = await getDb();
  if (!db) return null;
  
  const [result] = await db.select().from(ndaSignatures)
    .where(and(
      eq(ndaSignatures.dataRoomId, dataRoomId),
      eq(ndaSignatures.signerEmail, visitorEmail),
      eq(ndaSignatures.status, 'signed')
    ))
    .orderBy(desc(ndaSignatures.signedAt))
    .limit(1);
  
  return result || null;
}

export async function createNdaSignature(data: {
  ndaDocumentId: number;
  dataRoomId: number;
  visitorId?: number;
  linkId?: number;
  signerName: string;
  signerEmail: string;
  signerTitle?: string;
  signerCompany?: string;
  signatureType: 'typed' | 'drawn';
  signatureData: string;
  signatureImageUrl?: string;
  signedDocumentKey?: string;
  signedDocumentUrl?: string;
  ipAddress: string;
  userAgent?: string;
  agreementText?: string;
  consentCheckbox?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db.insert(ndaSignatures).values({
    ...data,
    status: 'signed',
  });
  return { id: result.insertId };
}

export async function updateNdaSignature(id: number, data: Partial<{
  signedDocumentKey: string;
  signedDocumentUrl: string;
  status: 'pending' | 'signed' | 'revoked' | 'expired';
  revokedAt: Date;
  revokedReason: string;
}>) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(ndaSignatures).set(data).where(eq(ndaSignatures.id, id));
}

// NDA Audit Log
export async function createNdaAuditLog(data: {
  signatureId: number;
  action: 'viewed_nda' | 'started_signing' | 'completed_signature' | 'downloaded_signed_copy' | 'signature_revoked' | 'access_granted' | 'access_denied';
  ipAddress?: string;
  userAgent?: string;
  details?: any;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db.insert(ndaSignatureAuditLog).values(data);
  return { id: result.insertId };
}

export async function getNdaAuditLogs(signatureId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(ndaSignatureAuditLog)
    .where(eq(ndaSignatureAuditLog.signatureId, signatureId))
    .orderBy(desc(ndaSignatureAuditLog.createdAt));
}


// ============================================
// ENHANCED DATA ROOM ACCESS CONTROL
// ============================================

// Get visitor by ID
export async function getDataRoomVisitorById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [visitor] = await db.select().from(dataRoomVisitors).where(eq(dataRoomVisitors.id, id));
  return visitor || null;
}

// Get invitation by email for a data room
export async function getDataRoomInvitationByEmail(dataRoomId: number, email: string) {
  const db = await getDb();
  if (!db) return null;
  const [invitation] = await db.select().from(dataRoomInvitations)
    .where(and(
      eq(dataRoomInvitations.dataRoomId, dataRoomId),
      eq(dataRoomInvitations.email, email.toLowerCase())
    ));
  return invitation || null;
}

// Block a visitor
export async function blockDataRoomVisitor(id: number, reason?: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(dataRoomVisitors).set({
    accessStatus: 'blocked',
    blockedAt: new Date(),
    blockedReason: reason,
  }).where(eq(dataRoomVisitors.id, id));
}

// Unblock a visitor
export async function unblockDataRoomVisitor(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(dataRoomVisitors).set({
    accessStatus: 'active',
    blockedAt: null,
    blockedReason: null,
  }).where(eq(dataRoomVisitors.id, id));
}

// Revoke visitor access
export async function revokeDataRoomVisitorAccess(id: number, reason?: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(dataRoomVisitors).set({
    accessStatus: 'revoked',
    revokedAt: new Date(),
    revokedReason: reason,
  }).where(eq(dataRoomVisitors.id, id));
}

// Restore visitor access
export async function restoreDataRoomVisitorAccess(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(dataRoomVisitors).set({
    accessStatus: 'active',
    revokedAt: null,
    revokedReason: null,
  }).where(eq(dataRoomVisitors.id, id));
}

// Update invitation permissions
export async function updateDataRoomInvitationPermissions(id: number, data: {
  allowedFolderIds?: number[] | null;
  allowedDocumentIds?: number[] | null;
  restrictedFolderIds?: number[] | null;
  restrictedDocumentIds?: number[] | null;
  allowDownload?: boolean;
  allowPrint?: boolean;
  role?: 'viewer' | 'editor' | 'admin';
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(dataRoomInvitations).set(data).where(eq(dataRoomInvitations.id, id));
}

// Link visitor to their NDA signature
export async function linkVisitorToNdaSignature(visitorId: number, signatureId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(dataRoomVisitors).set({
    ndaSignatureId: signatureId,
  }).where(eq(dataRoomVisitors.id, visitorId));
}

// Get visitor by email for a data room
export async function getDataRoomVisitorByEmail(dataRoomId: number, email: string) {
  const db = await getDb();
  if (!db) return null;
  const [visitor] = await db.select().from(dataRoomVisitors)
    .where(and(
      eq(dataRoomVisitors.dataRoomId, dataRoomId),
      eq(dataRoomVisitors.email, email.toLowerCase())
    ));
  return visitor || null;
}


// Additional data room helper
export async function getInvitationByIdWithDataRoom(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({
      id: dataRoomInvitations.id,
      email: dataRoomInvitations.email,
      name: dataRoomInvitations.name,
      inviteCode: dataRoomInvitations.inviteCode,
      dataRoomId: dataRoomInvitations.dataRoomId,
      dataRoomName: dataRooms.name,
    })
    .from(dataRoomInvitations)
    .leftJoin(dataRooms, eq(dataRoomInvitations.dataRoomId, dataRooms.id))
    .where(eq(dataRoomInvitations.id, id))
    .limit(1);
  return result[0] || null;
}
// ============================================
// DUE DILIGENCE CHECKLIST FUNCTIONS
// ============================================

// Due Diligence Templates
export async function createDueDiligenceTemplate(data: InsertDueDiligenceTemplate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(dueDiligenceTemplates).values(data);
  return { id: result[0].insertId };
}

export async function getDueDiligenceTemplates(userId?: number, includePublic: boolean = true) {
  const db = await getDb();
  if (!db) return [];

  if (userId && includePublic) {
    return db.select().from(dueDiligenceTemplates)
      .where(or(eq(dueDiligenceTemplates.createdBy, userId), eq(dueDiligenceTemplates.isPublic, true)))
      .orderBy(desc(dueDiligenceTemplates.createdAt));
  } else if (userId) {
    return db.select().from(dueDiligenceTemplates)
      .where(eq(dueDiligenceTemplates.createdBy, userId))
      .orderBy(desc(dueDiligenceTemplates.createdAt));
  } else {
    return db.select().from(dueDiligenceTemplates)
      .where(eq(dueDiligenceTemplates.isPublic, true))
      .orderBy(desc(dueDiligenceTemplates.createdAt));
  }
}

export async function getDueDiligenceTemplateById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(dueDiligenceTemplates).where(eq(dueDiligenceTemplates.id, id));
  return result[0] || null;
}

export async function getTemplateWithItems(templateId: number) {
  const db = await getDb();
  if (!db) return null;

  const template = await getDueDiligenceTemplateById(templateId);
  if (!template) return null;

  const categories = await db.select().from(dueDiligenceCategories)
    .where(eq(dueDiligenceCategories.templateId, templateId))
    .orderBy(dueDiligenceCategories.sortOrder);

  const items = await db.select().from(dueDiligenceItems)
    .where(eq(dueDiligenceItems.templateId, templateId))
    .orderBy(dueDiligenceItems.sortOrder);

  return {
    ...template,
    categories: categories.map(cat => ({
      ...cat,
      items: items.filter(item => item.categoryId === cat.id),
    })),
  };
}

export async function createDueDiligenceCategory(data: InsertDueDiligenceCategory) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(dueDiligenceCategories).values(data);
  return { id: result[0].insertId };
}

export async function createDueDiligenceItem(data: InsertDueDiligenceItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(dueDiligenceItems).values(data);
  return { id: result[0].insertId };
}

// Data Room Checklists
export async function createDataRoomChecklist(data: InsertDataRoomChecklist) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(dataRoomChecklists).values(data);
  return { id: result[0].insertId };
}

export async function getDataRoomChecklists(dataRoomId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dataRoomChecklists)
    .where(eq(dataRoomChecklists.dataRoomId, dataRoomId))
    .orderBy(desc(dataRoomChecklists.createdAt));
}

export async function getDataRoomChecklistById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(dataRoomChecklists).where(eq(dataRoomChecklists.id, id));
  return result[0] || null;
}

export async function updateDataRoomChecklist(id: number, data: Partial<InsertDataRoomChecklist>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dataRoomChecklists).set(data).where(eq(dataRoomChecklists.id, id));
}

export async function deleteDataRoomChecklist(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(dataRoomChecklistItems).where(eq(dataRoomChecklistItems.checklistId, id));
  await db.delete(dataRoomChecklists).where(eq(dataRoomChecklists.id, id));
}

// Data Room Checklist Items
export async function createDataRoomChecklistItem(data: InsertDataRoomChecklistItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(dataRoomChecklistItems).values(data);
  return { id: result[0].insertId };
}

export async function getChecklistItems(checklistId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dataRoomChecklistItems)
    .where(eq(dataRoomChecklistItems.checklistId, checklistId))
    .orderBy(dataRoomChecklistItems.categoryName, dataRoomChecklistItems.sortOrder);
}

export async function getChecklistItemById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(dataRoomChecklistItems).where(eq(dataRoomChecklistItems.id, id));
  return result[0] || null;
}

export async function updateChecklistItem(id: number, data: Partial<InsertDataRoomChecklistItem>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dataRoomChecklistItems).set(data).where(eq(dataRoomChecklistItems.id, id));
}

export async function deleteChecklistItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(dataRoomChecklistItems).where(eq(dataRoomChecklistItems.id, id));
}

export async function bulkCreateChecklistItems(items: InsertDataRoomChecklistItem[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (items.length === 0) return [];
  const result = await db.insert(dataRoomChecklistItems).values(items);
  return result;
}

// Get checklist with all items and linked documents
export async function getChecklistWithItems(checklistId: number) {
  const db = await getDb();
  if (!db) return null;

  const checklist = await getDataRoomChecklistById(checklistId);
  if (!checklist) return null;

  const items = await getChecklistItems(checklistId);

  // Group items by category
  const categories: Record<string, typeof items> = {};
  items.forEach(item => {
    if (!categories[item.categoryName]) {
      categories[item.categoryName] = [];
    }
    categories[item.categoryName].push(item);
  });

  // Get linked documents for each item
  const documentsMap: Record<number, any[]> = {};
  for (const item of items) {
    if (item.linkedDocumentIds) {
      try {
        const docIds = JSON.parse(item.linkedDocumentIds) as number[];
        if (docIds.length > 0) {
          const docs = await db.select().from(dataRoomDocuments).where(inArray(dataRoomDocuments.id, docIds));
          documentsMap[item.id] = docs;
        }
      } catch (e) {
        documentsMap[item.id] = [];
      }
    }
  }

  return {
    ...checklist,
    categories: Object.entries(categories).map(([name, catItems]) => ({
      name,
      items: catItems.map(item => ({
        ...item,
        linkedDocuments: documentsMap[item.id] || [],
      })),
    })),
  };
}

// Normalize a filename for matching: strip extension, split camelCase, replace separators
function normalizeForMatching(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')           // strip file extension
    .replace(/[-_./\\]+/g, ' ')        // separators to spaces
    .replace(/([a-z])([A-Z])/g, '$1 $2') // split camelCase
    .toLowerCase()
    .trim();
}

// Score how well a document matches a checklist item's keywords
function scoreDocumentMatch(docName: string, docDescription: string | null | undefined, keywords: string[]): number {
  const normalizedName = normalizeForMatching(docName);
  const nameTokens = normalizedName.split(/\s+/).filter(t => t.length > 1);
  const descNorm = docDescription ? normalizeForMatching(docDescription) : '';

  let score = 0;

  for (const keyword of keywords) {
    const kwLower = keyword.toLowerCase();

    // Exact phrase in normalized name (strongest signal)
    if (normalizedName.includes(kwLower)) {
      score += 10;
      continue;
    }

    // Exact phrase in description
    if (descNorm.includes(kwLower)) {
      score += 5;
      continue;
    }

    // Token overlap: split keyword into words, check how many appear in doc name tokens
    const kwTokens = kwLower.split(/\s+/).filter(t => t.length > 1);
    if (kwTokens.length === 0) continue;

    const hits = kwTokens.filter(kt =>
      nameTokens.some(nt => nt === kt || nt.includes(kt) || kt.includes(nt))
    ).length;

    if (hits === kwTokens.length) {
      score += 7; // all keyword tokens matched
    } else if (hits > 0) {
      score += hits * 2; // partial
    }
  }

  return score;
}

// Auto-match documents against checklist items using keyword scoring
export async function autoMatchChecklistDocuments(checklistId: number) {
  const db = await getDb();
  if (!db) return { matched: 0, items: [] };

  const checklist = await getDataRoomChecklistById(checklistId);
  if (!checklist) return { matched: 0, items: [] };

  const items = await getChecklistItems(checklistId);
  const documents = await getDataRoomDocuments(checklist.dataRoomId);

  let matchedCount = 0;
  const matchedItems: any[] = [];

  for (const item of items) {
    // Skip items manually set to waived or n/a
    if (item.status === 'waived' || item.status === 'not_applicable') continue;

    let keywords: string[] = [];
    try {
      keywords = item.matchKeywords ? JSON.parse(item.matchKeywords) : [];
    } catch (e) {
      keywords = [];
    }

    if (keywords.length === 0) continue;

    // Score every document against this item
    const scored = documents
      .map(doc => ({ doc, score: scoreDocumentMatch(doc.name, doc.description, keywords) }))
      .filter(s => s.score >= 5)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      const linkedDocIds = scored.map(s => s.doc.id);

      await updateChecklistItem(item.id, {
        status: 'complete',
        linkedDocumentIds: JSON.stringify(linkedDocIds),
        linkedDocumentCount: linkedDocIds.length,
      });

      matchedCount++;
      matchedItems.push({
        itemId: item.id,
        itemName: item.itemName,
        matchedDocuments: scored.map(s => ({ id: s.doc.id, name: s.doc.name, score: s.score })),
        status: 'complete',
      });
    } else if (item.status === 'complete' && item.linkedDocumentIds) {
      // Was auto-matched but no longer has scoring documents — reset to missing.
      // Manually-ticked items (linkedDocumentIds is null) are left unchanged.
      await updateChecklistItem(item.id, {
        status: 'missing',
        linkedDocumentIds: null,
        linkedDocumentCount: 0,
      });
    }
  }

  await recalculateChecklistProgress(checklistId);

  return { matched: matchedCount, items: matchedItems };
}

// ============================================
// EDI MODULE
// ============================================

// --- EDI Trading Partners ---
// Recalculate checklist progress
export async function recalculateChecklistProgress(checklistId: number) {
  const db = await getDb();
  if (!db) return;

  const items = await getChecklistItems(checklistId);

  const total = items.length;
  const completed = items.filter(i => i.status === 'complete').length;
  const partial = items.filter(i => i.status === 'partial').length;
  const missing = items.filter(i => i.status === 'missing').length;

  await updateDataRoomChecklist(checklistId, {
    totalItems: total,
    completedItems: completed,
    partialItems: partial,
    missingItems: missing,
  });
}

// Create a checklist from a template
export async function createChecklistFromTemplate(
  dataRoomId: number,
  templateId: number,
  userId: number,
  customName?: string
) {
  const template = await getTemplateWithItems(templateId) as {
    name: string; description?: string;
    categories: Array<{ name: string; items: Array<{ name: string; description?: string; requirement?: string; matchKeywords?: string; matchFileTypes?: string }> }>;
  } | null;
  if (!template) throw new Error("Template not found");

  // Create the checklist
  const checklist = await createDataRoomChecklist({
    dataRoomId,
    templateId,
    name: customName || template.name,
    description: template.description,
    createdBy: userId,
    totalItems: template.categories.reduce((sum: number, cat: { items: unknown[] }) => sum + cat.items.length, 0),
    missingItems: template.categories.reduce((sum: number, cat: { items: unknown[] }) => sum + cat.items.length, 0),
  });

  // Create checklist items from template
  let sortOrder = 0;
  for (const category of template.categories) {
    for (const item of category.items) {
      await createDataRoomChecklistItem({
        checklistId: checklist.id,
        dataRoomId,
        categoryName: category.name,
        itemName: item.name,
        itemDescription: item.description,
        requirement: (item.requirement ?? "required") as "required" | "optional" | "conditional",
        matchKeywords: item.matchKeywords,
        matchFileTypes: item.matchFileTypes,
        sortOrder: sortOrder++,
        status: 'missing',
      });
    }
  }

  return checklist;
}

// Create a standard due diligence checklist
export async function createStandardChecklist(
  dataRoomId: number,
  userId: number,
  checklistType: 'fundraising' | 'ma' | 'full' | 'series_b' = 'full',
  customName?: string
) {
  // Select the appropriate category template
  const categories =
    checklistType === 'series_b' ? SERIES_B_DD_CATEGORIES :
    checklistType === 'fundraising' ? FUNDRAISING_DD_CATEGORIES :
    checklistType === 'ma' ? MA_DD_CATEGORIES :
    STANDARD_DD_CATEGORIES;

  // Generate name based on template type
  const templateNames: Record<string, string> = {
    'series_b': 'Series B Due Diligence Checklist',
    'fundraising': 'Fundraising Due Diligence Checklist',
    'ma': 'M&A Due Diligence Checklist',
    'full': 'Standard Due Diligence Checklist',
  };

  // Create the checklist
  const totalItems = Object.values(categories).reduce((sum, cat) => sum + cat.items.length, 0);
  const checklist = await createDataRoomChecklist({
    dataRoomId,
    name: customName || templateNames[checklistType] || 'Due Diligence Checklist',
    description: `${templateNames[checklistType] || 'Due diligence checklist'} with ${totalItems} items across ${Object.keys(categories).length} categories`,
    createdBy: userId,
    totalItems,
    missingItems: totalItems,
  });

  // Create checklist items
  let sortOrder = 0;
  for (const [key, category] of Object.entries(categories)) {
    for (const item of category.items) {
      await createDataRoomChecklistItem({
        checklistId: checklist.id,
        dataRoomId,
        categoryName: category.name,
        itemName: item.name,
        requirement: 'required',
        matchKeywords: item.keywords ? JSON.stringify(item.keywords) : null,
        sortOrder: sortOrder++,
        status: 'missing',
      });
    }
  }

  return checklist;
}

// Get checklist summary for a data room
export async function getChecklistSummary(dataRoomId: number) {
  const db = await getDb();
  if (!db) return null;

  const checklists = await getDataRoomChecklists(dataRoomId);
  if (checklists.length === 0) return null;

  // Get the most recent active checklist
  const activeChecklist = checklists.find(c => c.status === 'active') || checklists[0];
  const items = await getChecklistItems(activeChecklist.id);

  // Group by category and status
  const byCategory: Record<string, { total: number; complete: number; partial: number; missing: number }> = {};
  items.forEach(item => {
    if (!byCategory[item.categoryName]) {
      byCategory[item.categoryName] = { total: 0, complete: 0, partial: 0, missing: 0 };
    }
    byCategory[item.categoryName].total++;
    if (item.status === 'complete') byCategory[item.categoryName].complete++;
    else if (item.status === 'partial') byCategory[item.categoryName].partial++;
    else if (item.status === 'missing') byCategory[item.categoryName].missing++;
  });

  return {
    checklist: activeChecklist,
    totalItems: items.length,
    completedItems: items.filter(i => i.status === 'complete').length,
    partialItems: items.filter(i => i.status === 'partial').length,
    missingItems: items.filter(i => i.status === 'missing').length,
    completionPercent: items.length > 0
      ? Math.round((items.filter(i => i.status === 'complete').length / items.length) * 100)
      : 0,
    byCategory,
    requiredMissing: items.filter(i => i.status === 'missing' && i.requirement === 'required'),
  };
}

