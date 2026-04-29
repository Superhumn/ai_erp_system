import { ENV } from "./_core/env";

type AlibabaSearchInput = {
  query: string;
  category?: string;
  minOrder?: string;
  country?: string;
};

type AlibabaSupplier = {
  companyName: string;
  productName: string;
  priceRange: string;
  minOrder: string;
  country: string;
  yearsInBusiness: number;
  responseRate: string;
  rating: number;
  verified: boolean;
  alibabaUrl: string;
};

type AlibabaSearchResult = {
  suppliers: AlibabaSupplier[];
  source: "alibaba_api";
};

const DEFAULT_ALIBABA_SEARCH_URL = "https://openapi.alibaba.com/v2/suppliers/search";

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const toString = (value: unknown, fallback = ""): string =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;

const toBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (["true", "1", "yes", "verified"].includes(lowered)) return true;
    if (["false", "0", "no", "unverified"].includes(lowered)) return false;
  }
  return fallback;
};

function mapAlibabaSupplierRecord(raw: unknown): AlibabaSupplier | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;

  const companyName = toString(
    item.companyName ?? item.supplierName ?? item.company_name,
    ""
  );
  const productName = toString(
    item.productName ?? item.title ?? item.product_title,
    ""
  );

  if (!companyName || !productName) return null;

  const alibabaUrl = toString(
    item.alibabaUrl ?? item.productUrl ?? item.url ?? item.offerUrl,
    "https://www.alibaba.com"
  );

  return {
    companyName,
    productName,
    priceRange: toString(item.priceRange ?? item.price ?? item.price_range, "Contact for price"),
    minOrder: toString(item.minOrder ?? item.moq ?? item.min_order_quantity, "N/A"),
    country: toString(item.country ?? item.region ?? item.countryName, "China"),
    yearsInBusiness: Math.max(0, Math.round(toNumber(item.yearsInBusiness ?? item.years ?? item.businessYears, 0))),
    responseRate: toString(item.responseRate ?? item.replyRate ?? item.response_rate, "N/A"),
    rating: Math.min(5, Math.max(0, toNumber(item.rating ?? item.starRating ?? item.score, 0))),
    verified: toBoolean(item.verified ?? item.isVerified ?? item.goldSupplier, false),
    alibabaUrl,
  };
}

export function isAlibabaApiConfigured(): boolean {
  return Boolean(
    ENV.alibabaApiKey &&
      ENV.alibabaApiSecret &&
      ENV.alibabaApiAccessToken
  );
}

function resolveSearchUrl(): string {
  return (ENV.alibabaApiSearchUrl || DEFAULT_ALIBABA_SEARCH_URL).trim();
}

function buildAuthHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${ENV.alibabaApiAccessToken}`,
    "X-Alibaba-App-Key": ENV.alibabaApiKey,
    "X-Alibaba-App-Secret": ENV.alibabaApiSecret,
  };
}

export async function searchAlibabaSuppliersViaApi(
  input: AlibabaSearchInput
): Promise<AlibabaSearchResult> {
  if (!isAlibabaApiConfigured()) {
    throw new Error("Alibaba API is not configured");
  }

  const url = new URL(resolveSearchUrl());
  const pageSize = Number(ENV.alibabaApiPageSize || "10");
  url.searchParams.set("q", input.query.trim());
  if (input.category) url.searchParams.set("category", input.category);
  if (input.country) url.searchParams.set("country", input.country);
  if (input.minOrder) url.searchParams.set("min_order", input.minOrder);
  url.searchParams.set("page_size", String(Number.isFinite(pageSize) ? Math.max(1, Math.min(pageSize, 50)) : 10));

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "content-type": "application/json",
      ...buildAuthHeaders(),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Alibaba API search failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;

  const maybeList =
    (payload.suppliers as unknown[]) ||
    (payload.data as unknown[]) ||
    ((payload.result as Record<string, unknown> | undefined)?.suppliers as unknown[]) ||
    ((payload.result as Record<string, unknown> | undefined)?.items as unknown[]) ||
    ((payload.data as Record<string, unknown> | undefined)?.items as unknown[]) ||
    [];

  const suppliers = (Array.isArray(maybeList) ? maybeList : [])
    .map(mapAlibabaSupplierRecord)
    .filter((v): v is AlibabaSupplier => Boolean(v))
    .slice(0, 10);

  return { suppliers, source: "alibaba_api" };
}
