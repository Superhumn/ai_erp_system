// Mercury Banking API Integration
// Provides real-time account balances and transaction data from Mercury bank accounts.
//
// When MERCURY_API_TOKEN is not configured, the helpers below return a
// `configured: false` shape rather than throwing, so callers can degrade
// gracefully without each having to wrap in try/catch.

const MERCURY_BASE = "https://api.mercury.com/api/v1";

export function isMercuryConfigured(): boolean {
  return !!process.env.MERCURY_API_TOKEN;
}

function getHeaders(): Record<string, string> {
  const token = process.env.MERCURY_API_TOKEN!;
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function getMercuryAccounts(): Promise<{ accounts: any[]; configured: boolean }> {
  if (!isMercuryConfigured()) return { accounts: [], configured: false };
  const res = await fetch(`${MERCURY_BASE}/accounts`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Mercury API error: ${res.status}`);
  const data = await res.json() as { accounts?: any[] };
  return { accounts: data.accounts ?? [], configured: true };
}

export async function getMercuryTransactions(accountId: string, limit = 500, offset = 0): Promise<{ transactions: any[]; configured: boolean }> {
  if (!isMercuryConfigured()) return { transactions: [], configured: false };
  const res = await fetch(
    `${MERCURY_BASE}/account/${accountId}/transactions?limit=${limit}&offset=${offset}`,
    { headers: getHeaders() },
  );
  if (!res.ok) throw new Error(`Mercury API error: ${res.status}`);
  const data = await res.json() as { transactions?: any[] };
  return { transactions: data.transactions ?? [], configured: true };
}

export async function getMercuryTransactionDetail(accountId: string, txnId: string): Promise<any> {
  if (!isMercuryConfigured()) {
    throw new Error("MERCURY_API_TOKEN not configured");
  }
  const res = await fetch(
    `${MERCURY_BASE}/account/${accountId}/transactions/${txnId}`,
    { headers: getHeaders() },
  );
  if (!res.ok) throw new Error(`Mercury API error: ${res.status}`);
  return res.json();
}
