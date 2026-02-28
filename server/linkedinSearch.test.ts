import { describe, expect, it, vi, beforeEach } from "vitest";

// ============================================
// Unit tests for the LinkedIn Search Service
// ============================================
// Tests cover: query building, result parsing,
// AI enrichment fallback, full search flow,
// and CRM export logic.

// Mock axios
vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

// Mock LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// Mock db
vi.mock("./db", () => ({
  createLinkedInSearch: vi.fn().mockResolvedValue(1),
  updateLinkedInSearch: vi.fn().mockResolvedValue(undefined),
  createLinkedInSearchResult: vi.fn().mockResolvedValue(1),
  getLinkedInSearchResult: vi.fn(),
  updateLinkedInSearchResult: vi.fn().mockResolvedValue(undefined),
  getCrmContactByLinkedInUrl: vi.fn().mockResolvedValue(null),
  createCrmContact: vi.fn().mockResolvedValue(100),
}));

import axios from "axios";
import { invokeLLM } from "./_core/llm";
import * as db from "./db";

// We need to dynamically import the service after mocks are set up
let searchLinkedIn: typeof import("./linkedinSearchService").searchLinkedIn;
let exportResultsToCRM: typeof import("./linkedinSearchService").exportResultsToCRM;

beforeEach(async () => {
  vi.clearAllMocks();
  // Set env vars for the test
  process.env.GOOGLE_SEARCH_API_KEY = "test-api-key";
  process.env.GOOGLE_SEARCH_ENGINE_ID = "test-engine-id";
  // Re-import to pick up mocks
  const mod = await import("./linkedinSearchService");
  searchLinkedIn = mod.searchLinkedIn;
  exportResultsToCRM = mod.exportResultsToCRM;
});

// ============================================
// buildSearchQuery (tested indirectly via searchLinkedIn)
// ============================================
describe("LinkedIn Search - Query Building", () => {
  it("builds a basic hiring query with keywords and job title", async () => {
    const mockAxios = vi.mocked(axios.get);
    mockAxios.mockResolvedValueOnce({ data: { items: [] } });

    await searchLinkedIn(
      { purpose: "hiring", keywords: "food industry", jobTitle: "CEO" },
      1
    );

    expect(mockAxios).toHaveBeenCalledWith(
      "https://www.googleapis.com/customsearch/v1",
      expect.objectContaining({
        params: expect.objectContaining({
          q: expect.stringContaining("site:linkedin.com/in/"),
        }),
      })
    );

    const query = mockAxios.mock.calls[0][1]?.params?.q as string;
    expect(query).toContain("food industry");
    expect(query).toContain('"CEO"');
  });

  it("adds investor-specific terms when purpose is investor", async () => {
    const mockAxios = vi.mocked(axios.get);
    mockAxios.mockResolvedValueOnce({ data: { items: [] } });

    await searchLinkedIn(
      { purpose: "investor", keywords: "food tech" },
      1
    );

    const query = mockAxios.mock.calls[0][1]?.params?.q as string;
    expect(query).toContain("investor OR venture OR capital OR angel");
  });

  it("skips investor terms when keywords already include them", async () => {
    const mockAxios = vi.mocked(axios.get);
    mockAxios.mockResolvedValueOnce({ data: { items: [] } });

    await searchLinkedIn(
      { purpose: "investor", keywords: "angel investor food" },
      1
    );

    const query = mockAxios.mock.calls[0][1]?.params?.q as string;
    expect(query).not.toContain("investor OR venture OR capital OR angel");
  });

  it("adds sales prospect fallback terms when no jobTitle", async () => {
    const mockAxios = vi.mocked(axios.get);
    mockAxios.mockResolvedValueOnce({ data: { items: [] } });

    await searchLinkedIn(
      { purpose: "sales_prospect", keywords: "organic snacks" },
      1
    );

    const query = mockAxios.mock.calls[0][1]?.params?.q as string;
    expect(query).toContain("director OR VP OR head OR manager OR owner OR founder");
  });

  it("skips sales prospect fallback terms when jobTitle is provided", async () => {
    const mockAxios = vi.mocked(axios.get);
    mockAxios.mockResolvedValueOnce({ data: { items: [] } });

    await searchLinkedIn(
      { purpose: "sales_prospect", keywords: "organic snacks", jobTitle: "Buyer" },
      1
    );

    const query = mockAxios.mock.calls[0][1]?.params?.q as string;
    expect(query).not.toContain("director OR VP");
    expect(query).toContain('"Buyer"');
  });

  it("includes all optional filter params in query", async () => {
    const mockAxios = vi.mocked(axios.get);
    mockAxios.mockResolvedValueOnce({ data: { items: [] } });

    await searchLinkedIn(
      {
        purpose: "hiring",
        keywords: "engineer",
        jobTitle: "Software Engineer",
        company: "Acme Corp",
        industry: "Technology",
        location: "San Francisco",
        country: "USA",
        seniority: "Senior",
      },
      1
    );

    const query = mockAxios.mock.calls[0][1]?.params?.q as string;
    expect(query).toContain('"Software Engineer"');
    expect(query).toContain('"Acme Corp"');
    expect(query).toContain("Technology");
    expect(query).toContain("San Francisco");
    expect(query).toContain("USA");
    expect(query).toContain("Senior");
  });
});

// ============================================
// parseLinkedInResult (tested via full flow)
// ============================================
describe("LinkedIn Search - Result Parsing", () => {
  it("parses LinkedIn title format: Name - Title - Company | LinkedIn", async () => {
    const mockAxios = vi.mocked(axios.get);
    mockAxios.mockResolvedValueOnce({
      data: {
        items: [
          {
            title: "Jane Smith - CEO - FoodCo Inc | LinkedIn",
            link: "https://www.linkedin.com/in/jane-smith",
            snippet: "Jane Smith is the CEO of FoodCo Inc. Based in New York.",
          },
        ],
      },
    });

    vi.mocked(invokeLLM).mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              enrichments: [
                {
                  index: 0,
                  relevanceScore: 90,
                  estimatedSeniority: "C-Suite",
                  keySkills: ["Leadership", "Food Industry"],
                  potentialFit: "Strong match for CEO role",
                  suggestedOutreach: "Hi Jane, I noticed your leadership at FoodCo...",
                },
              ],
            }),
          },
        },
      ],
    } as any);

    const result = await searchLinkedIn(
      { purpose: "hiring", keywords: "food", jobTitle: "CEO" },
      1
    );

    expect(result.results).toHaveLength(1);
    expect(result.results[0].name).toBe("Jane Smith");
    expect(result.results[0].profileUrl).toBe("https://www.linkedin.com/in/jane-smith");
    expect(result.results[0].relevanceScore).toBe(90);
    expect(result.results[0].enrichedData?.estimatedSeniority).toBe("C-Suite");
  });

  it("parses title with only Name - Company (no job title)", async () => {
    const mockAxios = vi.mocked(axios.get);
    mockAxios.mockResolvedValueOnce({
      data: {
        items: [
          {
            title: "Bob Jones - SnackWorks | LinkedIn",
            link: "https://www.linkedin.com/in/bob-jones",
            snippet: "Bob Jones at SnackWorks. Located in Chicago.",
          },
        ],
      },
    });

    vi.mocked(invokeLLM).mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ enrichments: [{ index: 0, relevanceScore: 60 }] }) } }],
    } as any);

    const result = await searchLinkedIn({ purpose: "hiring", keywords: "snacks" }, 1);

    expect(result.results[0].name).toBe("Bob Jones");
    expect(result.results[0].company).toBe("SnackWorks");
  });

  it("parses title with Name - Title (matches job title pattern)", async () => {
    const mockAxios = vi.mocked(axios.get);
    mockAxios.mockResolvedValueOnce({
      data: {
        items: [
          {
            title: "Alice Wang - VP of Sales | LinkedIn",
            link: "https://www.linkedin.com/in/alice-wang",
            snippet: "Alice Wang, VP of Sales.",
          },
        ],
      },
    });

    vi.mocked(invokeLLM).mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ enrichments: [{ index: 0, relevanceScore: 75 }] }) } }],
    } as any);

    const result = await searchLinkedIn({ purpose: "sales_prospect", keywords: "sales", jobTitle: "VP" }, 1);

    expect(result.results[0].name).toBe("Alice Wang");
    expect(result.results[0].jobTitle).toBe("VP of Sales");
  });

  it("filters out non-LinkedIn profile URLs", async () => {
    const mockAxios = vi.mocked(axios.get);
    mockAxios.mockResolvedValueOnce({
      data: {
        items: [
          {
            title: "Some Company Page",
            link: "https://www.linkedin.com/company/foodco",
            snippet: "Company page...",
          },
          {
            title: "John Doe - Manager - FoodCo | LinkedIn",
            link: "https://www.linkedin.com/in/john-doe",
            snippet: "Manager at FoodCo.",
          },
        ],
      },
    });

    vi.mocked(invokeLLM).mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ enrichments: [{ index: 0, relevanceScore: 80 }] }) } }],
    } as any);

    const result = await searchLinkedIn({ purpose: "hiring", keywords: "food" }, 1);

    // Only the /in/ profile should be included
    expect(result.results).toHaveLength(1);
    expect(result.results[0].profileUrl).toContain("/in/");
  });
});

// ============================================
// AI Enrichment fallback
// ============================================
describe("LinkedIn Search - AI Enrichment", () => {
  it("falls back to default scores when LLM fails", async () => {
    const mockAxios = vi.mocked(axios.get);
    mockAxios.mockResolvedValueOnce({
      data: {
        items: [
          {
            title: "Test User - Engineer | LinkedIn",
            link: "https://www.linkedin.com/in/test-user",
            snippet: "Engineer at TestCo.",
          },
        ],
      },
    });

    vi.mocked(invokeLLM).mockRejectedValueOnce(new Error("LLM unavailable"));

    const result = await searchLinkedIn({ purpose: "hiring", keywords: "engineer" }, 1);

    expect(result.results).toHaveLength(1);
    expect(result.results[0].relevanceScore).toBe(50); // default fallback
    expect(result.results[0].enrichedData).toBeUndefined();
  });
});

// ============================================
// Full search flow + DB persistence
// ============================================
describe("LinkedIn Search - Full Flow", () => {
  it("creates search record, saves results, and updates status", async () => {
    const mockAxios = vi.mocked(axios.get);
    mockAxios.mockResolvedValueOnce({
      data: {
        items: [
          {
            title: "Sara Lee - Director of Operations - BigFood | LinkedIn",
            link: "https://www.linkedin.com/in/sara-lee",
            snippet: "Director of Operations at BigFood. Based in Los Angeles.",
          },
          {
            title: "Tom Brown - Supply Chain Manager - MealCo | LinkedIn",
            link: "https://www.linkedin.com/in/tom-brown",
            snippet: "Supply Chain Manager at MealCo.",
          },
        ],
      },
    });

    vi.mocked(invokeLLM).mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              enrichments: [
                { index: 0, relevanceScore: 85, estimatedSeniority: "Director", keySkills: ["Operations"], potentialFit: "Great fit", suggestedOutreach: "Hi Sara..." },
                { index: 1, relevanceScore: 70, estimatedSeniority: "Manager", keySkills: ["Supply Chain"], potentialFit: "Good fit", suggestedOutreach: "Hi Tom..." },
              ],
            }),
          },
        },
      ],
    } as any);

    const result = await searchLinkedIn(
      { purpose: "hiring", keywords: "food operations", limit: 10 },
      42
    );

    // Verify search was created
    expect(db.createLinkedInSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        purpose: "hiring",
        keywords: "food operations",
        status: "processing",
      })
    );

    // Verify results were saved
    expect(db.createLinkedInSearchResult).toHaveBeenCalledTimes(2);

    // Verify search was marked completed
    expect(db.updateLinkedInSearch).toHaveBeenCalledWith(1, {
      resultCount: 2,
      status: "completed",
    });

    // Verify response structure
    expect(result.searchId).toBe(1);
    expect(result.purpose).toBe("hiring");
    expect(result.totalResults).toBe(2);
    expect(result.results).toHaveLength(2);
    // Results should be sorted by relevance (85, 70)
    expect(result.results[0].relevanceScore).toBe(85);
    expect(result.results[1].relevanceScore).toBe(70);
  });

  it("marks search as failed when Google API throws", async () => {
    const mockAxios = vi.mocked(axios.get);
    mockAxios.mockRejectedValueOnce(new Error("API quota exceeded"));

    await expect(
      searchLinkedIn({ purpose: "hiring", keywords: "food" }, 1)
    ).rejects.toThrow("API quota exceeded");

    expect(db.updateLinkedInSearch).toHaveBeenCalledWith(1, {
      status: "failed",
      errorMessage: "API quota exceeded",
    });
  });

  it("throws when API keys are missing", async () => {
    delete process.env.GOOGLE_SEARCH_API_KEY;

    await expect(
      searchLinkedIn({ purpose: "hiring", keywords: "food" }, 1)
    ).rejects.toThrow("Google Search API not configured");
  });

  it("paginates for large limits", async () => {
    const mockAxios = vi.mocked(axios.get);

    // First page
    mockAxios.mockResolvedValueOnce({
      data: {
        items: Array.from({ length: 10 }, (_, i) => ({
          title: `Person ${i} - Role | LinkedIn`,
          link: `https://www.linkedin.com/in/person-${i}`,
          snippet: `Person ${i} description.`,
        })),
        queries: { nextPage: [{}] },
      },
    });

    // Second page
    mockAxios.mockResolvedValueOnce({
      data: {
        items: Array.from({ length: 5 }, (_, i) => ({
          title: `Person ${i + 10} - Role | LinkedIn`,
          link: `https://www.linkedin.com/in/person-${i + 10}`,
          snippet: `Person ${i + 10} description.`,
        })),
      },
    });

    vi.mocked(invokeLLM).mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ enrichments: [] }) } }],
    } as any);

    const result = await searchLinkedIn(
      { purpose: "hiring", keywords: "food", limit: 15 },
      1
    );

    // Should have made 2 API calls (page 1 + page 2)
    expect(mockAxios).toHaveBeenCalledTimes(2);
    expect(result.results).toHaveLength(15);
  });
});

// ============================================
// CRM Export
// ============================================
describe("LinkedIn Search - CRM Export", () => {
  it("exports search results to CRM contacts", async () => {
    vi.mocked(db.getLinkedInSearchResult).mockResolvedValueOnce({
      id: 1,
      searchId: 1,
      name: "Jane Doe",
      headline: "CEO at FoodCo",
      profileUrl: "https://www.linkedin.com/in/jane-doe",
      snippet: "CEO at FoodCo. Experienced leader.",
      location: "New York",
      company: "FoodCo",
      jobTitle: "CEO",
      industry: null,
      imageUrl: null,
      relevanceScore: 90,
      enrichedData: null,
      status: "new",
      notes: null,
      crmContactId: null,
      createdAt: new Date(),
    } as any);

    vi.mocked(db.getCrmContactByLinkedInUrl).mockResolvedValueOnce(null);
    vi.mocked(db.createCrmContact).mockResolvedValueOnce(100);

    const result = await exportResultsToCRM([1], 42, "lead");

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    // Verify contact was created with correct data
    expect(db.createCrmContact).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: "Jane",
        lastName: "Doe",
        fullName: "Jane Doe",
        linkedinUrl: "https://www.linkedin.com/in/jane-doe",
        organization: "FoodCo",
        jobTitle: "CEO",
        contactType: "lead",
        source: "linkedin_scan",
        pipelineStage: "new",
        capturedBy: 42,
      })
    );

    // Verify result was marked as exported
    expect(db.updateLinkedInSearchResult).toHaveBeenCalledWith(1, {
      status: "exported_to_crm",
      crmContactId: 100,
    });
  });

  it("skips results that already exist as CRM contacts", async () => {
    vi.mocked(db.getLinkedInSearchResult).mockResolvedValueOnce({
      id: 2,
      name: "Existing Person",
      profileUrl: "https://www.linkedin.com/in/existing",
      snippet: "",
      headline: "",
    } as any);

    vi.mocked(db.getCrmContactByLinkedInUrl).mockResolvedValueOnce({
      id: 50,
      firstName: "Existing",
    } as any);

    const result = await exportResultsToCRM([2], 1);

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(db.createCrmContact).not.toHaveBeenCalled();
    expect(db.updateLinkedInSearchResult).toHaveBeenCalledWith(2, {
      status: "already_in_crm",
      crmContactId: 50,
    });
  });

  it("handles missing result IDs gracefully", async () => {
    vi.mocked(db.getLinkedInSearchResult).mockResolvedValueOnce(null as any);

    const result = await exportResultsToCRM([999], 1);

    expect(result.imported).toBe(0);
    expect(result.errors).toContain("Result 999 not found");
  });

  it("handles multiple results with mixed outcomes", async () => {
    // Result 1 - will import successfully
    vi.mocked(db.getLinkedInSearchResult)
      .mockResolvedValueOnce({
        id: 1, name: "New Person", profileUrl: "https://www.linkedin.com/in/new-person",
        snippet: "", headline: "", company: "TestCo", jobTitle: "Manager",
      } as any)
      // Result 2 - already in CRM
      .mockResolvedValueOnce({
        id: 2, name: "Old Person", profileUrl: "https://www.linkedin.com/in/old-person",
        snippet: "", headline: "",
      } as any)
      // Result 3 - not found
      .mockResolvedValueOnce(null as any);

    vi.mocked(db.getCrmContactByLinkedInUrl)
      .mockResolvedValueOnce(null) // new
      .mockResolvedValueOnce({ id: 50 } as any); // existing

    vi.mocked(db.createCrmContact).mockResolvedValueOnce(101);

    const result = await exportResultsToCRM([1, 2, 3], 42, "prospect");

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Result 3 not found");
  });
});
