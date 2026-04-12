/**
 * SeaRates API Integration
 * Tracking: https://docs.searates.com/reference/tracking/introduction
 * Base URL: https://tracking.searates.com
 * Auth: API key in query param
 */

const SEARATES_BASE = "https://tracking.searates.com";
const SEARATES_LOGISTICS_BASE = "https://www.searates.com/services";

function getApiKey(): string {
  const key = process.env.SEARATES_API_KEY;
  if (!key) throw new Error("SEARATES_API_KEY not configured");
  return key;
}

// ── Container/BL/Booking Tracking ────────────────────────────
export interface TrackingResult {
  status: string;
  message: string;
  data: {
    metadata: {
      type: string;
      number: string;
      sealine: string;
      sealine_name?: string;
      status: string;
      updated_at: string;
      api_calls?: { total: number; used: number; remaining: number };
    };
    locations: Array<{
      id: number;
      name: string;
      date: string;
      actual: boolean;
      type: string;
      status: string;
      country?: string;
      coordinates?: { lat: number; lng: number };
      timezone?: { name: string; offset: string };
    }>;
    containers: Array<{
      number: string;
      iso_code?: string;
      size_type?: string;
      status?: string;
      events?: Array<{
        date: string;
        description: string;
        location: string;
        status: string;
      }>;
    }>;
    vessels: Array<{
      name: string;
      imo?: string;
      flag?: string;
      call_sign?: string;
    }>;
    route_data?: {
      route?: {
        prepol?: { location: string; date: string };
        pol?: { location: string; date: string };
        pod?: { location: string; date: string };
        postpod?: { location: string; date: string };
      };
      pin?: { lat: number; lng: number };
    };
  };
}

export async function trackShipment(
  number: string,
  options?: { type?: "CT" | "BL" | "BK"; sealine?: string; route?: boolean; ais?: boolean }
): Promise<TrackingResult> {
  const params = new URLSearchParams({
    api_key: getApiKey(),
    number,
    ...(options?.type ? { type: options.type } : {}),
    ...(options?.sealine ? { sealine: options.sealine } : { sealine: "auto" }),
    route: String(options?.route ?? true),
    ais: String(options?.ais ?? false),
  });

  const res = await fetch(`${SEARATES_BASE}/tracking?${params}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SeaRates tracking error (${res.status}): ${text}`);
  }
  return res.json();
}

// ── Shipping Lines Info ──────────────────────────────────────
export async function getShippingLines(): Promise<any> {
  const params = new URLSearchParams({ api_key: getApiKey() });
  const res = await fetch(`${SEARATES_BASE}/sealines?${params}`);
  if (!res.ok) throw new Error(`SeaRates sealines error: ${res.status}`);
  return res.json();
}

// ── Freight Rate Quote (Logistics Explorer) ──────────────────
export interface RateQuoteParams {
  fromCity: string;
  toCity: string;
  fromCountry: string;
  toCountry: string;
  weight?: number; // kg
  volume?: number; // cbm
  containerType?: "20ST" | "40ST" | "40HQ" | "20RF" | "40RF";
  mode?: "fcl" | "lcl" | "air";
}

export interface RateQuoteResult {
  rates: Array<{
    carrier?: string;
    transitTime?: string;
    price?: number;
    currency?: string;
    mode?: string;
    validFrom?: string;
    validTo?: string;
    details?: any;
  }>;
  cheapest?: { price: number; carrier: string; transitTime: string };
  fastest?: { price: number; carrier: string; transitTime: string };
}

export async function getFreightRates(params: RateQuoteParams): Promise<RateQuoteResult> {
  // SeaRates Logistics Explorer API
  const apiKey = getApiKey();
  const queryParams = new URLSearchParams({
    api_key: apiKey,
    from: `${params.fromCity}, ${params.fromCountry}`,
    to: `${params.toCity}, ${params.toCountry}`,
    ...(params.weight ? { weight: String(params.weight) } : {}),
    ...(params.volume ? { volume: String(params.volume) } : {}),
    ...(params.containerType ? { container: params.containerType } : {}),
    ...(params.mode ? { mode: params.mode } : {}),
  });

  const res = await fetch(`${SEARATES_BASE}/rates?${queryParams}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SeaRates rates error (${res.status}): ${text}`);
  }
  const data = await res.json();

  // Normalize response
  const rates = Array.isArray(data.data) ? data.data : (data.rates || []);
  const sorted = [...rates].sort((a: any, b: any) => (a.price || Infinity) - (b.price || Infinity));

  return {
    rates: rates.map((r: any) => ({
      carrier: r.carrier || r.shipping_line || r.airline || "Unknown",
      transitTime: r.transit_time || r.transitTime || "-",
      price: r.price || r.total || 0,
      currency: r.currency || "USD",
      mode: r.mode || params.mode || "fcl",
      validFrom: r.valid_from || r.validFrom,
      validTo: r.valid_to || r.validTo,
      details: r,
    })),
    cheapest: sorted[0] ? { price: sorted[0].price || 0, carrier: sorted[0].carrier || "", transitTime: sorted[0].transit_time || "" } : undefined,
    fastest: undefined, // sorted by transit time separately if needed
  };
}
