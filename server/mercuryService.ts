// Mercury Banking API Integration
// Provides real-time account balances and transaction data from Mercury bank accounts.

const MERCURY_BASE = "https://api.mercury.com/api/v1";

function getHeaders(): Record<string, string> {
  const token = process.env.MERCURY_API_TOKEN;
  if (!token) throw new Error("MERCURY_API_TOKEN not configured");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function getMercuryAccounts() {
  const res = await fetch(`${MERCURY_BASE}/accounts`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Mercury API error: ${res.status}`);
  return res.json();
}

export async function getMercuryTransactions(accountId: string, limit = 500, offset = 0) {
  const res = await fetch(
    `${MERCURY_BASE}/account/${accountId}/transactions?limit=${limit}&offset=${offset}`,
    { headers: getHeaders() },
  );
  if (!res.ok) throw new Error(`Mercury API error: ${res.status}`);
  return res.json();
}

export async function getMercuryTransactionDetail(accountId: string, txnId: string) {
  const res = await fetch(
    `${MERCURY_BASE}/account/${accountId}/transactions/${txnId}`,
    { headers: getHeaders() },
  );
  if (!res.ok) throw new Error(`Mercury API error: ${res.status}`);
  return res.json();
}
