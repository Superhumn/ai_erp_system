import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Landmark, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { formatCurrency } from "@/lib/format";

export default function Banking() {
  // Queries
  const { data: balancesData, isLoading: balancesLoading } = trpc.banking.balances.useQuery();

  const accounts: any[] = balancesData?.accounts || [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-[1.75rem] font-semibold tracking-[-0.025em] flex items-center gap-2">
          <Landmark className="h-8 w-8" />
          Banking
        </h1>
        <p className="text-muted-foreground mt-1">
          Mercury account balances.
        </p>
      </div>

      {/* Account Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {balancesLoading ? (
          <Card className="col-span-full">
            <CardContent className="py-8 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading accounts...
            </CardContent>
          </Card>
        ) : accounts.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="py-8 flex items-center justify-center gap-2 text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              No Mercury accounts found. Check your MERCURY_API_TOKEN.
            </CardContent>
          </Card>
        ) : (
          accounts.map((acct: any) => (
            <Card key={acct.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {acct.name || acct.nickname || "Account"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(acct.currentBalance ?? acct.availableBalance ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {acct.kind || acct.type || "Checking"} &middot; {acct.routingNumber ? `****${acct.accountNumber?.slice(-4) || ""}` : acct.id?.slice(-8)}
                </p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* View in Mercury link */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <ExternalLink className="h-4 w-4" />
        <a href="https://app.mercury.com" target="_blank" rel="noopener noreferrer" className="hover:underline">
          View transactions in Mercury
        </a>
      </div>
    </div>
  );
}
