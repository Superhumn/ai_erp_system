import axios from "axios";
import { invokeLLM } from "./_core/llm";
import * as db from "./db";

// ============================================
// LINKEDIN SEARCH SERVICE
// ============================================
// Uses Google Custom Search API to find LinkedIn profiles
// matching hiring, investor, or sales prospect criteria.
// Results are enriched with AI to extract structured data.

export type SearchPurpose = "hiring" | "investor" | "sales_prospect";

export type LinkedInSearchParams = {
  purpose: SearchPurpose;
  keywords: string;
  jobTitle?: string;
  company?: string;
  industry?: string;
  location?: string;
  country?: string;
  seniority?: string;
  limit?: number;
};

export type LinkedInSearchResult = {
  name: string;
  headline: string;
  profileUrl: string;
  snippet: string;
  location?: string;
  company?: string;
  jobTitle?: string;
  industry?: string;
  imageUrl?: string;
  relevanceScore: number;
  enrichedData?: {
    estimatedSeniority?: string;
    keySkills?: string[];
    potentialFit?: string;
    suggestedOutreach?: string;
  };
};

export type LinkedInSearchResponse = {
  results: LinkedInSearchResult[];
  totalResults: number;
  searchQuery: string;
  purpose: SearchPurpose;
  searchId: number;
};

function buildSearchQuery(params: LinkedInSearchParams): string {
  const parts: string[] = ["site:linkedin.com/in/"];

  if (params.keywords) {
    parts.push(params.keywords);
  }

  if (params.jobTitle) {
    parts.push(`"${params.jobTitle}"`);
  }

  if (params.company) {
    parts.push(`"${params.company}"`);
  }

  if (params.industry) {
    parts.push(params.industry);
  }

  if (params.location) {
    parts.push(params.location);
  }

  if (params.country) {
    parts.push(params.country);
  }

  if (params.seniority) {
    parts.push(params.seniority);
  }

  // Add purpose-specific terms
  switch (params.purpose) {
    case "hiring":
      // No extra terms needed - jobTitle + industry covers it
      break;
    case "investor":
      if (!params.keywords.toLowerCase().includes("investor") &&
          !params.keywords.toLowerCase().includes("venture") &&
          !params.keywords.toLowerCase().includes("angel")) {
        parts.push("investor OR venture OR capital OR angel");
      }
      break;
    case "sales_prospect":
      if (!params.jobTitle) {
        parts.push("director OR VP OR head OR manager OR owner OR founder");
      }
      break;
  }

  return parts.join(" ");
}

async function searchGoogleForLinkedIn(
  query: string,
  limit: number
): Promise<Array<{ title: string; link: string; snippet: string }>> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !searchEngineId) {
    throw new Error(
      "Google Search API not configured. Set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID environment variables."
    );
  }

  const results: Array<{ title: string; link: string; snippet: string }> = [];
  const maxPages = Math.ceil(Math.min(limit, 30) / 10);

  for (let page = 0; page < maxPages; page++) {
    const startIndex = page * 10 + 1;

    const response = await axios.get(
      "https://www.googleapis.com/customsearch/v1",
      {
        params: {
          key: apiKey,
          cx: searchEngineId,
          q: query,
          start: startIndex,
          num: Math.min(10, limit - results.length),
        },
      }
    );

    if (response.data.items) {
      for (const item of response.data.items) {
        // Only include actual LinkedIn profile URLs
        if (
          item.link &&
          item.link.includes("linkedin.com/in/")
        ) {
          results.push({
            title: item.title || "",
            link: item.link,
            snippet: item.snippet || "",
          });
        }
      }
    }

    if (!response.data.queries?.nextPage) break;
    if (results.length >= limit) break;
  }

  return results.slice(0, limit);
}

function parseLinkedInResult(raw: {
  title: string;
  link: string;
  snippet: string;
}): Omit<LinkedInSearchResult, "relevanceScore" | "enrichedData"> {
  // LinkedIn titles typically follow: "FirstName LastName - Title - Company | LinkedIn"
  const titleParts = raw.title
    .replace(/\s*\|\s*LinkedIn\s*$/, "")
    .replace(/\s*-\s*LinkedIn\s*$/, "")
    .split(/\s*[-–]\s*/);

  const name = titleParts[0]?.trim() || "Unknown";
  const headline =
    titleParts.length > 1 ? titleParts.slice(1).join(" - ").trim() : "";

  // Extract company and job title from headline
  let jobTitle = "";
  let company = "";
  if (titleParts.length >= 3) {
    jobTitle = titleParts[1]?.trim() || "";
    company = titleParts[2]?.trim() || "";
  } else if (titleParts.length === 2) {
    // Could be either title or company
    const part = titleParts[1]?.trim() || "";
    if (
      part.match(
        /CEO|CTO|CFO|COO|VP|Director|Manager|Founder|Partner|Head|Lead|Chief/i
      )
    ) {
      jobTitle = part;
    } else {
      company = part;
    }
  }

  // Try to extract location from snippet
  let location: string | undefined;
  const locationMatch = raw.snippet.match(
    /(?:Location|Based in|located in)\s*[:\s]*([^·.]+)/i
  );
  if (locationMatch) {
    location = locationMatch[1].trim();
  }

  return {
    name,
    headline,
    profileUrl: raw.link,
    snippet: raw.snippet,
    location,
    company,
    jobTitle,
  };
}

async function enrichResultsWithAI(
  results: Array<Omit<LinkedInSearchResult, "relevanceScore" | "enrichedData">>,
  params: LinkedInSearchParams
): Promise<LinkedInSearchResult[]> {
  if (results.length === 0) return [];

  const purposeDescription = {
    hiring: `We're looking to hire candidates for: ${params.jobTitle || params.keywords}${params.industry ? ` in the ${params.industry} industry` : ""}${params.location ? ` located in ${params.location}` : ""}`,
    investor: `We're looking for investors to reach out to about our ${params.industry || "food/retail"} business${params.location ? ` in ${params.location}` : ""}. Keywords: ${params.keywords}`,
    sales_prospect: `We're looking for sales prospects in the ${params.industry || "foodservice/retail"} industry${params.location ? ` in ${params.location}` : ""} to pitch our products/services. Keywords: ${params.keywords}`,
  };

  const prompt = `You are an expert recruiter/sales analyst. Analyze these LinkedIn search results and provide structured enrichment data.

Context: ${purposeDescription[params.purpose]}

For each person, provide:
1. A relevance score (0-100) based on how well they match our criteria
2. Estimated seniority level
3. Key skills or attributes (from their snippet)
4. A brief "potential fit" assessment (1 sentence)
5. A suggested outreach message opening (1-2 sentences, professional and personalized)

Here are the search results:
${results.map((r, i) => `[${i}] Name: ${r.name}\nHeadline: ${r.headline}\nCompany: ${r.company || "N/A"}\nJob Title: ${r.jobTitle || "N/A"}\nSnippet: ${r.snippet}\nLocation: ${r.location || "N/A"}`).join("\n\n")}

Respond in valid JSON with this structure:
{
  "enrichments": [
    {
      "index": 0,
      "relevanceScore": 85,
      "estimatedSeniority": "Senior/Director",
      "keySkills": ["skill1", "skill2"],
      "potentialFit": "Strong match because...",
      "suggestedOutreach": "Hi [Name], I noticed your experience in..."
    }
  ]
}`;

  try {
    const llmResult = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are a professional recruiter and business development expert. Always respond with valid JSON only, no markdown formatting.",
        },
        { role: "user", content: prompt },
      ],
      responseFormat: { type: "json_object" },
    });

    const content =
      typeof llmResult.choices[0]?.message?.content === "string"
        ? llmResult.choices[0].message.content
        : "";

    const parsed = JSON.parse(content);
    const enrichments = parsed.enrichments || [];

    return results.map((result, index) => {
      const enrichment = enrichments.find(
        (e: any) => e.index === index
      ) || {};
      return {
        ...result,
        relevanceScore: enrichment.relevanceScore ?? 50,
        enrichedData: {
          estimatedSeniority: enrichment.estimatedSeniority,
          keySkills: enrichment.keySkills,
          potentialFit: enrichment.potentialFit,
          suggestedOutreach: enrichment.suggestedOutreach,
        },
      };
    });
  } catch (error) {
    console.error("[LinkedIn Search] AI enrichment failed:", error);
    // Return results without enrichment
    return results.map((result) => ({
      ...result,
      relevanceScore: 50,
    }));
  }
}

export async function searchLinkedIn(
  params: LinkedInSearchParams,
  userId: number
): Promise<LinkedInSearchResponse> {
  const query = buildSearchQuery(params);
  const limit = params.limit || 10;

  console.log(`[LinkedIn Search] Executing search: "${query}" (limit: ${limit})`);

  // Save the search to database
  const searchId = await db.createLinkedInSearch({
    userId,
    purpose: params.purpose,
    keywords: params.keywords,
    jobTitle: params.jobTitle,
    company: params.company,
    industry: params.industry,
    location: params.location,
    country: params.country,
    seniority: params.seniority,
    searchQuery: query,
    resultCount: 0,
    status: "processing",
  });

  try {
    // Search Google for LinkedIn profiles
    const rawResults = await searchGoogleForLinkedIn(query, limit);

    // Parse raw results
    const parsedResults = rawResults.map(parseLinkedInResult);

    // Enrich with AI
    const enrichedResults = await enrichResultsWithAI(parsedResults, params);

    // Sort by relevance score
    enrichedResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Save results to database
    for (const result of enrichedResults) {
      await db.createLinkedInSearchResult({
        searchId,
        name: result.name,
        headline: result.headline,
        profileUrl: result.profileUrl,
        snippet: result.snippet,
        location: result.location,
        company: result.company,
        jobTitle: result.jobTitle,
        industry: result.industry,
        relevanceScore: result.relevanceScore,
        enrichedData: result.enrichedData
          ? JSON.stringify(result.enrichedData)
          : null,
        status: "new",
      });
    }

    // Update search status
    await db.updateLinkedInSearch(searchId, {
      resultCount: enrichedResults.length,
      status: "completed",
    });

    return {
      results: enrichedResults,
      totalResults: enrichedResults.length,
      searchQuery: query,
      purpose: params.purpose,
      searchId,
    };
  } catch (error: any) {
    // Update search status to failed
    await db.updateLinkedInSearch(searchId, {
      status: "failed",
      errorMessage: error.message,
    });
    throw error;
  }
}

export async function exportResultsToCRM(
  searchResultIds: number[],
  userId: number,
  contactType: string = "lead"
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const resultId of searchResultIds) {
    try {
      const result = await db.getLinkedInSearchResult(resultId);
      if (!result) {
        errors.push(`Result ${resultId} not found`);
        continue;
      }

      // Check if contact already exists by LinkedIn URL
      const existingContact = await db.getCrmContactByLinkedInUrl(
        result.profileUrl
      );
      if (existingContact) {
        skipped++;
        await db.updateLinkedInSearchResult(resultId, {
          status: "already_in_crm",
          crmContactId: existingContact.id,
        });
        continue;
      }

      // Parse name into first/last
      const nameParts = result.name.split(" ");
      const firstName = nameParts[0] || result.name;
      const lastName =
        nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined;

      // Create CRM contact
      const contactId = await db.createCrmContact({
        firstName,
        lastName,
        fullName: result.name,
        linkedinUrl: result.profileUrl,
        organization: result.company || undefined,
        jobTitle: result.jobTitle || undefined,
        contactType: contactType as any,
        source: "linkedin_scan",
        pipelineStage: "new",
        notes: `Imported from LinkedIn search. ${result.snippet || ""}`,
        capturedBy: userId,
      });

      await db.updateLinkedInSearchResult(resultId, {
        status: "exported_to_crm",
        crmContactId: contactId,
      });

      imported++;
    } catch (error: any) {
      errors.push(`Failed to import result ${resultId}: ${error.message}`);
    }
  }

  return { imported, skipped, errors };
}
