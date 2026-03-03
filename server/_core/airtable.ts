import { ENV } from "./env";

const AIRTABLE_API_BASE = "https://api.airtable.com/v0";

function getHeaders(tokenOverride?: string) {
  const token = tokenOverride || ENV.airtablePersonalAccessToken;
  if (!token) {
    throw new Error("Airtable Personal Access Token not configured. Set AIRTABLE_PERSONAL_ACCESS_TOKEN.");
  }
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export function isAirtableConfigured(): boolean {
  return !!ENV.airtablePersonalAccessToken;
}

export interface AirtableBase {
  id: string;
  name: string;
  permissionLevel: string;
}

export interface AirtableTable {
  id: string;
  name: string;
  fields: AirtableField[];
}

export interface AirtableField {
  id: string;
  name: string;
  type: string;
}

export interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime: string;
}

/**
 * List all bases accessible to the token.
 */
export async function listBases(token?: string): Promise<AirtableBase[]> {
  const res = await fetch(`${AIRTABLE_API_BASE}/meta/bases`, {
    headers: getHeaders(token),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable listBases failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.bases || [];
}

/**
 * List all tables in a base.
 */
export async function listTables(baseId: string, token?: string): Promise<AirtableTable[]> {
  const res = await fetch(`${AIRTABLE_API_BASE}/meta/bases/${baseId}/tables`, {
    headers: getHeaders(token),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable listTables failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.tables || [];
}

/**
 * Fetch all records from a table (handles pagination).
 */
export async function listRecords(
  baseId: string,
  tableIdOrName: string,
  options?: { maxRecords?: number; view?: string; fields?: string[] },
  token?: string
): Promise<AirtableRecord[]> {
  const allRecords: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams();
    if (offset) params.set("offset", offset);
    if (options?.maxRecords) params.set("maxRecords", String(options.maxRecords));
    if (options?.view) params.set("view", options.view);
    if (options?.fields) {
      options.fields.forEach((f) => params.append("fields[]", f));
    }

    const url = `${AIRTABLE_API_BASE}/${baseId}/${encodeURIComponent(tableIdOrName)}?${params.toString()}`;
    const res = await fetch(url, { headers: getHeaders(token) });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable listRecords failed (${res.status}): ${text}`);
    }
    const data = await res.json();
    allRecords.push(...(data.records || []));
    offset = data.offset;

    // Safety: stop if we've fetched way too many
    if (allRecords.length > 10_000) break;
  } while (offset);

  return allRecords;
}
