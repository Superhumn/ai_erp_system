import { and, desc, eq, gte, lte, like, sql, inArray, or } from "drizzle-orm";
import {
  socialAccounts, InsertSocialAccount,
  marketingCampaigns, InsertMarketingCampaign,
  marketingPosts, InsertMarketingPost,
  marketingEngagements, InsertMarketingEngagement,
  marketingMetrics, InsertMarketingMetric,
  influencers, InsertInfluencer,
  influencerCampaignParticipations, InsertInfluencerCampaignParticipation,
  influencerDeliverables, InsertInfluencerDeliverable,
  influencerOutreach, InsertInfluencerOutreach,
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

// ============================================
// INFLUENCER CRM
// ============================================

export async function getInfluencers(filters?: {
  status?: string;
  tier?: string;
  platform?: string;
  search?: string;
  assignedTo?: number;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.status) conditions.push(eq(influencers.status, filters.status as any));
  if (filters?.tier) conditions.push(eq(influencers.tier, filters.tier as any));
  if (filters?.platform) conditions.push(eq(influencers.primaryPlatform, filters.platform as any));
  if (filters?.assignedTo) conditions.push(eq(influencers.assignedTo, filters.assignedTo));
  if (filters?.search) {
    conditions.push(
      or(
        like(influencers.fullName, `%${filters.search}%`),
        like(influencers.primaryHandle, `%${filters.search}%`),
        like(influencers.email, `%${filters.search}%`),
        like(influencers.niche, `%${filters.search}%`),
      ),
    );
  }
  let query = db.select().from(influencers);
  if (conditions.length > 0) query = query.where(and(...conditions)) as any;
  return query
    .orderBy(desc(influencers.followerCount), desc(influencers.createdAt))
    .limit(filters?.limit ?? 200)
    .offset(filters?.offset ?? 0);
}

export async function getInfluencerById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(influencers).where(eq(influencers.id, id)).limit(1);
  return result[0];
}

export async function createInfluencer(data: InsertInfluencer) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(influencers).values(data);
  return result[0].insertId;
}

export async function updateInfluencer(id: number, data: Partial<InsertInfluencer>) {
  const db = await getDb();
  if (!db) return;
  await db.update(influencers).set(data).where(eq(influencers.id, id));
}

export async function deleteInfluencer(id: number) {
  const db = await getDb();
  if (!db) return;
  // FK cascade handles participations -> deliverables, and outreach
  await db.delete(influencers).where(eq(influencers.id, id));
}

export async function getInfluencerPipelineCounts() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      status: influencers.status,
      count: sql<number>`count(*)`,
    })
    .from(influencers)
    .groupBy(influencers.status);
}

// --- PARTICIPATIONS ---

export async function getInfluencerParticipations(filters?: {
  campaignId?: number;
  influencerId?: number;
  status?: string;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.campaignId) conditions.push(eq(influencerCampaignParticipations.campaignId, filters.campaignId));
  if (filters?.influencerId) conditions.push(eq(influencerCampaignParticipations.influencerId, filters.influencerId));
  if (filters?.status) conditions.push(eq(influencerCampaignParticipations.status, filters.status as any));
  let query = db
    .select({
      participation: influencerCampaignParticipations,
      influencer: influencers,
      campaign: marketingCampaigns,
    })
    .from(influencerCampaignParticipations)
    .leftJoin(influencers, eq(influencerCampaignParticipations.influencerId, influencers.id))
    .leftJoin(marketingCampaigns, eq(influencerCampaignParticipations.campaignId, marketingCampaigns.id));
  if (conditions.length > 0) query = query.where(and(...conditions)) as any;
  return query.orderBy(desc(influencerCampaignParticipations.createdAt));
}

export async function createInfluencerParticipation(data: InsertInfluencerCampaignParticipation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(influencerCampaignParticipations).values(data);
  return result[0].insertId;
}

export async function updateInfluencerParticipation(
  id: number,
  data: Partial<InsertInfluencerCampaignParticipation>,
) {
  const db = await getDb();
  if (!db) return;
  await db.update(influencerCampaignParticipations).set(data).where(eq(influencerCampaignParticipations.id, id));
}

export async function deleteInfluencerParticipation(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(influencerCampaignParticipations).where(eq(influencerCampaignParticipations.id, id));
}

// --- DELIVERABLES ---

export async function getInfluencerDeliverables(participationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(influencerDeliverables)
    .where(eq(influencerDeliverables.participationId, participationId))
    .orderBy(desc(influencerDeliverables.scheduledAt));
}

export async function createInfluencerDeliverable(data: InsertInfluencerDeliverable) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(influencerDeliverables).values(data);
  return result[0].insertId;
}

export async function updateInfluencerDeliverable(
  id: number,
  data: Partial<InsertInfluencerDeliverable>,
) {
  const db = await getDb();
  if (!db) return;
  await db.update(influencerDeliverables).set(data).where(eq(influencerDeliverables.id, id));
}

export async function deleteInfluencerDeliverable(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(influencerDeliverables).where(eq(influencerDeliverables.id, id));
}

// --- OUTREACH ---

export async function getInfluencerOutreach(influencerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(influencerOutreach)
    .where(eq(influencerOutreach.influencerId, influencerId))
    .orderBy(desc(influencerOutreach.sentAt));
}

export async function logInfluencerOutreach(data: InsertInfluencerOutreach) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const normalizedData: InsertInfluencerOutreach = {
    ...data,
    direction: data.direction ?? "outbound",
  };
  const result = await db.insert(influencerOutreach).values(normalizedData);
  if (normalizedData.direction === "outbound") {
    await db
      .update(influencers)
      .set({ lastOutreachAt: new Date() })
      .where(eq(influencers.id, normalizedData.influencerId));
  }
  return result[0].insertId;
}

export async function updateInfluencerOutreachResponse(
  id: number,
  response: "interested" | "not_interested" | "no_response" | "negotiating",
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(influencerOutreach)
    .set({ response, respondedAt: new Date() })
    .where(eq(influencerOutreach.id, id));
}

// --- ROLLUPS ---

export async function getInfluencerPerformance(influencerId: number) {
  const db = await getDb();
  if (!db) return null;

  const participations = await db
    .select()
    .from(influencerCampaignParticipations)
    .where(eq(influencerCampaignParticipations.influencerId, influencerId));

  const participationIds = participations.map((p) => p.id);
  let metrics = { deliverables: 0, published: 0, impressions: 0, views: 0, likes: 0, comments: 0, shares: 0 };
  if (participationIds.length > 0) {
    const [m] = await db
      .select({
        deliverables: sql<number>`count(*)`,
        published: sql<number>`sum(case when ${influencerDeliverables.status} = 'published' then 1 else 0 end)`,
        impressions: sql<number>`coalesce(sum(${influencerDeliverables.impressions}), 0)`,
        views: sql<number>`coalesce(sum(${influencerDeliverables.views}), 0)`,
        likes: sql<number>`coalesce(sum(${influencerDeliverables.likes}), 0)`,
        comments: sql<number>`coalesce(sum(${influencerDeliverables.comments}), 0)`,
        shares: sql<number>`coalesce(sum(${influencerDeliverables.shares}), 0)`,
      })
      .from(influencerDeliverables)
      .where(inArray(influencerDeliverables.participationId, participationIds));
    metrics = {
      deliverables: Number(m?.deliverables ?? 0),
      published: Number(m?.published ?? 0),
      impressions: Number(m?.impressions ?? 0),
      views: Number(m?.views ?? 0),
      likes: Number(m?.likes ?? 0),
      comments: Number(m?.comments ?? 0),
      shares: Number(m?.shares ?? 0),
    };
  }

  const totalSpend = participations.reduce(
    (sum, p) => sum + Number(p.agreedFee ?? 0),
    0,
  );
  const paidSpend = participations
    .filter((p) => p.paymentStatus === "paid")
    .reduce((sum, p) => sum + Number(p.agreedFee ?? 0), 0);

  return {
    participationCount: participations.length,
    totalSpend,
    paidSpend,
    pendingSpend: totalSpend - paidSpend,
    metrics,
    cpm: metrics.impressions > 0 ? (totalSpend / metrics.impressions) * 1000 : null,
  };
}

export async function getCampaignInfluencerRollup(campaignId: number) {
  const db = await getDb();
  if (!db) return null;

  const [agg] = await db
    .select({
      participants: sql<number>`count(distinct ${influencerCampaignParticipations.influencerId})`,
      totalCommitted: sql<string>`coalesce(sum(${influencerCampaignParticipations.agreedFee}), 0)`,
      totalPaid: sql<string>`coalesce(sum(case when ${influencerCampaignParticipations.paymentStatus} = 'paid' then ${influencerCampaignParticipations.agreedFee} else 0 end), 0)`,
    })
    .from(influencerCampaignParticipations)
    .where(eq(influencerCampaignParticipations.campaignId, campaignId));

  return {
    participants: Number(agg?.participants ?? 0),
    totalCommitted: Number(agg?.totalCommitted ?? 0),
    totalPaid: Number(agg?.totalPaid ?? 0),
  };
}
