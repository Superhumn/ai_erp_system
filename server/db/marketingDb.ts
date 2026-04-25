import { and, desc, eq, gte, lte, like, sql, inArray } from "drizzle-orm";
import {
  socialAccounts, InsertSocialAccount,
  marketingCampaigns, InsertMarketingCampaign,
  marketingPosts, InsertMarketingPost,
  marketingEngagements, InsertMarketingEngagement,
  marketingMetrics, InsertMarketingMetric,
  crmContacts,
  orders,
} from "../../drizzle/schema";
import { getDb } from "./connection";

export const MARKETING_MODULE_TAG = "marketing" as const;

// --- SOCIAL ACCOUNTS ---

export async function getSocialAccounts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(socialAccounts).orderBy(socialAccounts.platform, socialAccounts.handle);
}

export async function createSocialAccount(data: InsertSocialAccount) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(socialAccounts).values(data);
  return result[0].insertId;
}

export async function updateSocialAccount(id: number, data: Partial<InsertSocialAccount>) {
  const db = await getDb();
  if (!db) return;
  await db.update(socialAccounts).set(data).where(eq(socialAccounts.id, id));
}

export async function deleteSocialAccount(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(socialAccounts).where(eq(socialAccounts.id, id));
}

// --- CAMPAIGNS ---

export async function getMarketingCampaigns(filters?: { status?: string; search?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.status) conditions.push(eq(marketingCampaigns.status, filters.status as any));
  if (filters?.search) conditions.push(like(marketingCampaigns.name, `%${filters.search}%`));
  let query = db.select().from(marketingCampaigns);
  if (conditions.length > 0) query = query.where(and(...conditions)) as any;
  return query.orderBy(desc(marketingCampaigns.createdAt));
}

export async function getMarketingCampaignById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(marketingCampaigns).where(eq(marketingCampaigns.id, id)).limit(1);
  return result[0];
}

export async function createMarketingCampaign(data: InsertMarketingCampaign) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(marketingCampaigns).values(data);
  return result[0].insertId;
}

export async function updateMarketingCampaign(id: number, data: Partial<InsertMarketingCampaign>) {
  const db = await getDb();
  if (!db) return;
  await db.update(marketingCampaigns).set(data).where(eq(marketingCampaigns.id, id));
}

export async function deleteMarketingCampaign(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(marketingPosts).set({ campaignId: null }).where(eq(marketingPosts.campaignId, id));
  await db.delete(marketingCampaigns).where(eq(marketingCampaigns.id, id));
}

// --- POSTS ---

export async function getMarketingPosts(filters?: {
  campaignId?: number;
  status?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.campaignId) conditions.push(eq(marketingPosts.campaignId, filters.campaignId));
  if (filters?.status) conditions.push(eq(marketingPosts.status, filters.status as any));
  if (filters?.from) conditions.push(gte(marketingPosts.scheduledAt, filters.from));
  if (filters?.to) conditions.push(lte(marketingPosts.scheduledAt, filters.to));
  let query = db.select().from(marketingPosts);
  if (conditions.length > 0) query = query.where(and(...conditions)) as any;
  return query.orderBy(desc(marketingPosts.scheduledAt)).limit(filters?.limit ?? 200);
}

export async function getMarketingPostById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(marketingPosts).where(eq(marketingPosts.id, id)).limit(1);
  return result[0];
}

export async function createMarketingPost(data: InsertMarketingPost) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(marketingPosts).values(data);
  return result[0].insertId;
}

export async function updateMarketingPost(id: number, data: Partial<InsertMarketingPost>) {
  const db = await getDb();
  if (!db) return;
  await db.update(marketingPosts).set(data).where(eq(marketingPosts.id, id));
}

export async function deleteMarketingPost(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(marketingMetrics).where(eq(marketingMetrics.postId, id));
  await db.update(marketingEngagements).set({ postId: null }).where(eq(marketingEngagements.postId, id));
  await db.delete(marketingPosts).where(eq(marketingPosts.id, id));
}

// --- ENGAGEMENTS ---

export async function getMarketingEngagements(filters?: {
  postId?: number;
  platform?: string;
  type?: string;
  unlinkedOnly?: boolean;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.postId) conditions.push(eq(marketingEngagements.postId, filters.postId));
  if (filters?.platform) conditions.push(eq(marketingEngagements.platform, filters.platform as any));
  if (filters?.type) conditions.push(eq(marketingEngagements.type, filters.type as any));
  if (filters?.unlinkedOnly) conditions.push(sql`${marketingEngagements.contactId} IS NULL`);
  let query = db.select().from(marketingEngagements);
  if (conditions.length > 0) query = query.where(and(...conditions)) as any;
  return query.orderBy(desc(marketingEngagements.occurredAt)).limit(filters?.limit ?? 100);
}

export async function createMarketingEngagement(data: InsertMarketingEngagement) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(marketingEngagements).values(data);
  return result[0].insertId;
}

export async function linkEngagementToContact(engagementId: number, contactId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(marketingEngagements).set({ contactId }).where(eq(marketingEngagements.id, engagementId));
}

export async function markEngagementReplied(engagementId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(marketingEngagements).set({ repliedAt: new Date() }).where(eq(marketingEngagements.id, engagementId));
}

// --- METRICS ---

export async function recordMarketingMetric(data: InsertMarketingMetric) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(marketingMetrics).values(data);
  return result[0].insertId;
}

export async function getLatestMetricsForPost(postId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(marketingMetrics)
    .where(eq(marketingMetrics.postId, postId))
    .orderBy(desc(marketingMetrics.recordedAt))
    .limit(10);
}

// --- ROLLUPS & ROI ---

export async function getMarketingOverviewStats() {
  const db = await getDb();
  if (!db) return null;

  const [postsTotal] = await db.select({ c: sql<number>`count(*)` }).from(marketingPosts);
  const [postsScheduled] = await db
    .select({ c: sql<number>`count(*)` })
    .from(marketingPosts)
    .where(eq(marketingPosts.status, "scheduled"));
  const [postsPosted] = await db
    .select({ c: sql<number>`count(*)` })
    .from(marketingPosts)
    .where(eq(marketingPosts.status, "posted"));
  const [campaignsActive] = await db
    .select({ c: sql<number>`count(*)` })
    .from(marketingCampaigns)
    .where(eq(marketingCampaigns.status, "active"));
  const [engagementsTotal] = await db.select({ c: sql<number>`count(*)` }).from(marketingEngagements);
  const [engagementsUnreplied] = await db
    .select({ c: sql<number>`count(*)` })
    .from(marketingEngagements)
    .where(sql`${marketingEngagements.repliedAt} IS NULL`);

  const [metrics] = await db
    .select({
      impressions: sql<number>`coalesce(sum(${marketingMetrics.impressions}), 0)`,
      clicks: sql<number>`coalesce(sum(${marketingMetrics.clicks}), 0)`,
      reach: sql<number>`coalesce(sum(${marketingMetrics.reach}), 0)`,
    })
    .from(marketingMetrics);

  return {
    posts: {
      total: Number(postsTotal?.c ?? 0),
      scheduled: Number(postsScheduled?.c ?? 0),
      posted: Number(postsPosted?.c ?? 0),
    },
    campaigns: {
      active: Number(campaignsActive?.c ?? 0),
    },
    engagement: {
      total: Number(engagementsTotal?.c ?? 0),
      unreplied: Number(engagementsUnreplied?.c ?? 0),
    },
    totals: {
      impressions: Number(metrics?.impressions ?? 0),
      reach: Number(metrics?.reach ?? 0),
      clicks: Number(metrics?.clicks ?? 0),
    },
  };
}

export async function getCampaignRoi(campaignId: number) {
  const db = await getDb();
  if (!db) return null;

  const campaign = await getMarketingCampaignById(campaignId);
  if (!campaign) return null;

  const postIdsRows = await db
    .select({ id: marketingPosts.id })
    .from(marketingPosts)
    .where(eq(marketingPosts.campaignId, campaignId));
  const postIds = postIdsRows.map((r) => r.id);

  let metricsAgg = { impressions: 0, reach: 0, clicks: 0, likes: 0, comments: 0, shares: 0 };
  let engagementCount = 0;
  let attributedContactIds: number[] = [];

  if (postIds.length > 0) {
    const [m] = await db
      .select({
        impressions: sql<number>`coalesce(sum(${marketingMetrics.impressions}), 0)`,
        reach: sql<number>`coalesce(sum(${marketingMetrics.reach}), 0)`,
        clicks: sql<number>`coalesce(sum(${marketingMetrics.clicks}), 0)`,
        likes: sql<number>`coalesce(sum(${marketingMetrics.likes}), 0)`,
        comments: sql<number>`coalesce(sum(${marketingMetrics.comments}), 0)`,
        shares: sql<number>`coalesce(sum(${marketingMetrics.shares}), 0)`,
      })
      .from(marketingMetrics)
      .where(inArray(marketingMetrics.postId, postIds));
    metricsAgg = {
      impressions: Number(m?.impressions ?? 0),
      reach: Number(m?.reach ?? 0),
      clicks: Number(m?.clicks ?? 0),
      likes: Number(m?.likes ?? 0),
      comments: Number(m?.comments ?? 0),
      shares: Number(m?.shares ?? 0),
    };

    const [eCount] = await db
      .select({ c: sql<number>`count(*)` })
      .from(marketingEngagements)
      .where(inArray(marketingEngagements.postId, postIds));
    engagementCount = Number(eCount?.c ?? 0);

    const contactRows = await db
      .select({ contactId: marketingEngagements.contactId })
      .from(marketingEngagements)
      .where(
        and(
          inArray(marketingEngagements.postId, postIds),
          sql`${marketingEngagements.contactId} IS NOT NULL`,
        ),
      );
    attributedContactIds = Array.from(new Set(contactRows.map((r) => r.contactId!).filter(Boolean)));
  }

  // Attributed orders: orders belonging to customers linked to the engaged contacts
  // First resolve contact -> customerId
  let attributedRevenue = 0;
  let attributedOrderCount = 0;
  if (attributedContactIds.length > 0) {
    const contacts = await db
      .select({ id: crmContacts.id, customerId: crmContacts.customerId })
      .from(crmContacts)
      .where(inArray(crmContacts.id, attributedContactIds));
    const customerIds = Array.from(new Set(contacts.map((c) => c.customerId).filter((x): x is number => !!x)));
    if (customerIds.length > 0 && campaign.startDate) {
      const [o] = await db
        .select({
          revenue: sql<string>`coalesce(sum(${orders.totalAmount}), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(orders)
        .where(
          and(
            inArray(orders.customerId, customerIds),
            gte(orders.createdAt, campaign.startDate),
          ),
        );
      attributedRevenue = Number(o?.revenue ?? 0);
      attributedOrderCount = Number(o?.count ?? 0);
    }
  }

  const spend = Number(campaign.spendAmount ?? 0);
  const roi = spend > 0 ? (attributedRevenue - spend) / spend : null;

  return {
    campaign,
    postCount: postIds.length,
    metrics: metricsAgg,
    engagementCount,
    attributedContacts: attributedContactIds.length,
    attributedOrderCount,
    attributedRevenue,
    spend,
    roi,
  };
}

export async function suggestContactForHandle(handle: string) {
  const db = await getDb();
  if (!db || !handle) return null;
  const normalized = handle.replace(/^@/, "");
  const candidates = await db
    .select()
    .from(crmContacts)
    .where(
      sql`LOWER(${crmContacts.linkedinUrl}) LIKE ${"%" + normalized.toLowerCase() + "%"}
          OR LOWER(${crmContacts.email}) LIKE ${normalized.toLowerCase() + "%"}
          OR LOWER(${crmContacts.fullName}) LIKE ${"%" + normalized.toLowerCase() + "%"}`,
    )
    .limit(5);
  return candidates;
}
