import { invokeLLM } from "./_core/llm";

export async function generateContent(params: {
  contentType: string;
  topic: string;
  brandVoice?: string;
  targetAudience?: string;
  platform?: string;
  keywords?: string[];
  length?: string;
}): Promise<{
  title: string;
  body: string;
  hashtags?: string[];
  metaDescription?: string;
}> {
  const prompt = `You are a marketing content specialist for a premium food/CPG brand. Generate ${params.contentType} content.

Topic: ${params.topic}
Platform: ${params.platform || 'website'}
${params.brandVoice ? `Brand Voice: ${params.brandVoice}` : 'Brand Voice: Professional, innovative, health-conscious'}
${params.targetAudience ? `Target Audience: ${params.targetAudience}` : ''}
${params.keywords?.length ? `Keywords to include: ${params.keywords.join(', ')}` : ''}
${params.length ? `Target length: ${params.length}` : ''}

Respond in JSON format with:
- title: compelling headline
- body: the full content
- hashtags: array of relevant hashtags (for social media)
- metaDescription: SEO meta description (for blog posts)`;

  const response = await invokeLLM(prompt);
  try {
    return JSON.parse(response);
  } catch {
    return { title: params.topic, body: response };
  }
}

export async function generatePrPitch(params: {
  pitchType: string;
  journalistBeat?: string;
  outlet?: string;
  companyInfo: string;
  newsAngle: string;
}): Promise<{
  subject: string;
  body: string;
  matchScore: number;
  talkingPoints: string[];
}> {
  const prompt = `You are a PR specialist. Craft a compelling media pitch.

Pitch Type: ${params.pitchType}
${params.journalistBeat ? `Journalist Beat: ${params.journalistBeat}` : ''}
${params.outlet ? `Target Outlet: ${params.outlet}` : ''}
Company Info: ${params.companyInfo}
News Angle: ${params.newsAngle}

Respond in JSON format with:
- subject: email subject line
- body: pitch email body (personalized, concise, newsworthy)
- matchScore: 0-100 score of how well this angle matches the journalist's beat
- talkingPoints: array of 3-5 key talking points`;

  const response = await invokeLLM(prompt);
  try {
    return JSON.parse(response);
  } catch {
    return { subject: params.newsAngle, body: response, matchScore: 50, talkingPoints: [] };
  }
}

export async function generateInvestorUpdate(params: {
  updateType: string;
  periodStart: string;
  periodEnd: string;
  metrics?: Record<string, any>;
  highlights?: string[];
  challenges?: string[];
}): Promise<{
  title: string;
  body: string;
  highlights: string[];
  metrics: Record<string, any>;
}> {
  const prompt = `You are an investor relations specialist. Generate a professional investor update.

Update Type: ${params.updateType}
Period: ${params.periodStart} to ${params.periodEnd}
${params.metrics ? `Key Metrics: ${JSON.stringify(params.metrics)}` : ''}
${params.highlights?.length ? `Highlights: ${params.highlights.join('; ')}` : ''}
${params.challenges?.length ? `Challenges: ${params.challenges.join('; ')}` : ''}

Respond in JSON format with:
- title: update title
- body: full investor update letter (professional, data-driven, forward-looking)
- highlights: array of key highlights to emphasize
- metrics: structured metrics object`;

  const response = await invokeLLM(prompt);
  try {
    return JSON.parse(response);
  } catch {
    return { title: `${params.updateType} Update`, body: response, highlights: params.highlights || [], metrics: params.metrics || {} };
  }
}

export async function matchJournalist(params: {
  newsAngle: string;
  journalists: Array<{ id: number; name: string; beat: string; outlet: string; tier: string }>;
}): Promise<{
  matches: Array<{ id: number; score: number; reason: string }>;
}> {
  const prompt = `You are a PR targeting specialist. Match this news angle to the most relevant journalists.

News Angle: ${params.newsAngle}

Journalists:
${params.journalists.map(j => `- ID ${j.id}: ${j.name} at ${j.outlet} (beat: ${j.beat}, tier: ${j.tier})`).join('\n')}

Respond in JSON format with a "matches" array sorted by relevance, each having:
- id: journalist ID
- score: 0-100 relevance score
- reason: why they're a good match`;

  const response = await invokeLLM(prompt);
  try {
    return JSON.parse(response);
  } catch {
    return { matches: [] };
  }
}

export async function analyzeFraud(params: {
  entityType: string;
  entityData: Record<string, any>;
  historicalPatterns?: Record<string, any>;
}): Promise<{
  riskScore: number;
  alertType: string;
  description: string;
  analysis: string;
  recommendations: string[];
}> {
  const prompt = `You are a financial fraud detection AI. Analyze the following transaction for potential fraud indicators.

Entity Type: ${params.entityType}
Entity Data: ${JSON.stringify(params.entityData)}
${params.historicalPatterns ? `Historical Patterns: ${JSON.stringify(params.historicalPatterns)}` : ''}

Respond in JSON format with:
- riskScore: 0-100 (higher = more suspicious)
- alertType: one of "duplicate_invoice", "unusual_amount", "vendor_mismatch", "timing_anomaly", "pattern_deviation", "unauthorized_change"
- description: brief description of the concern
- analysis: detailed analysis
- recommendations: array of recommended actions`;

  const response = await invokeLLM(prompt);
  try {
    return JSON.parse(response);
  } catch {
    return {
      riskScore: 0,
      alertType: "pattern_deviation",
      description: "Unable to analyze",
      analysis: response.slice(0, 500),
      recommendations: ["Manual review recommended"]
    };
  }
}
