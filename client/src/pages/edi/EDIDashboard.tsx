import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeftRight,
  Building2,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  ArrowRight,
  Loader2,
  BarChart3,
  ShoppingCart,
  FileOutput,
  Truck,
  Settings,
  Save,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

const txnSetLabels: Record<string, string> = {
  "850": "Purchase Order",
  "855": "PO Acknowledgment",
  "810": "Invoice",
  "856": "Ship Notice (ASN)",
  "997": "Functional Ack",
};

const statusColors: Record<string, string> = {
  received: "bg-blue-100 text-blue-800",
  parsing: "bg-yellow-100 text-yellow-800",
  parsed: "bg-indigo-100 text-indigo-800",
  validated: "bg-purple-100 text-purple-800",
  processing: "bg-orange-100 text-orange-800",
  processed: "bg-green-100 text-green-800",
  error: "bg-red-100 text-red-800",
  rejected: "bg-red-100 text-red-800",
  acknowledged: "bg-emerald-100 text-emerald-800",
};

export default function EDIDashboard() {
  const { data: stats, isLoading } = trpc.edi.dashboardStats.useQuery();
  const { data: recentTransactions } = trpc.edi.transactions.list.useQuery({ limit: 10 });
  const { data: partners } = trpc.edi.partners.list.useQuery({});
  const { data: ediSettings, refetch: refetchSettings } = trpc.edi.settings.get.useQuery();
  const [showSettings, setShowSettings] = useState(false);

  const upsertSettings = trpc.edi.settings.upsert.useMutation({
    onSuccess: () => {
      toast.success("EDI settings saved");
      refetchSettings();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSaveSettings = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    upsertSettings.mutate({
      isaId: fd.get("isaId") as string,
      isaQualifier: (fd.get("isaQualifier") as string) || "ZZ",
      gsApplicationCode: fd.get("gsApplicationCode") as string,
      companyName: (fd.get("companyName") as string) || undefined,
      autoSend997: fd.get("autoSend997") === "on",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">EDI Hub</h1>
          <p className="text-muted-foreground">Electronic Data Interchange for retail customer connections</p>
        </div>
        <div className="flex gap-2">
          <Link href="/edi/partners">
            <Button variant="outline">
              <Building2 className="h-4 w-4 mr-2" />
              Trading Partners
            </Button>
          </Link>
          <Link href="/edi/transactions">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Process EDI Document
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Partners
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalPartners || 0}</div>
            <p className="text-xs text-muted-foreground">{stats?.activePartners || 0} active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4" />
              Total Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalTransactions || 0}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.recentTransactions || 0}</div>
            <p className="text-xs text-muted-foreground">Last 7 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pending ACKs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pendingAcks || 0}</div>
            <p className="text-xs text-muted-foreground">Awaiting response</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Errors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.errorTransactions || 0}</div>
            <p className="text-xs text-muted-foreground">Needs attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Active Partners
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.activePartners || 0}</div>
            <p className="text-xs text-muted-foreground">Connected</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions & Document Flow */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* EDI Document Flow */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>EDI Document Flow</CardTitle>
            <CardDescription>Common retail EDI transaction sets</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-blue-600" />
                  <h3 className="font-semibold">850 - Purchase Order</h3>
                </div>
                <p className="text-sm text-muted-foreground">Inbound POs from retail partners. Auto-parsed into sales orders.</p>
                <Badge variant="outline" className="text-xs">Inbound</Badge>
              </div>

              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <h3 className="font-semibold">855 - PO Acknowledgment</h3>
                </div>
                <p className="text-sm text-muted-foreground">Confirm, accept, or reject PO line items to the retailer.</p>
                <Badge variant="outline" className="text-xs">Outbound</Badge>
              </div>

              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <FileOutput className="h-5 w-5 text-purple-600" />
                  <h3 className="font-semibold">810 - Invoice</h3>
                </div>
                <p className="text-sm text-muted-foreground">Send electronic invoices matching shipped quantities.</p>
                <Badge variant="outline" className="text-xs">Outbound</Badge>
              </div>

              <div className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Truck className="h-5 w-5 text-orange-600" />
                  <h3 className="font-semibold">856 - Advance Ship Notice</h3>
                </div>
                <p className="text-sm text-muted-foreground">Notify retailer of incoming shipment details and contents.</p>
                <Badge variant="outline" className="text-xs">Outbound</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Trading Partners Quick View */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Trading Partners</CardTitle>
              <Link href="/edi/partners">
                <Button variant="ghost" size="sm">
                  View All <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {partners && partners.length > 0 ? (
              partners.slice(0, 5).map((partner) => (
                <div key={partner.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <div>
                    <p className="font-medium text-sm">{partner.name}</p>
                    <p className="text-xs text-muted-foreground">{partner.partnerType} &middot; ISA: {partner.isaId}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      partner.status === "active" ? "bg-green-50 text-green-700 border-green-200" :
                      partner.status === "testing" ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                      partner.status === "onboarding" ? "bg-blue-50 text-blue-700 border-blue-200" :
                      "bg-gray-50 text-gray-700 border-gray-200"
                    }
                  >
                    {partner.status}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No trading partners yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* EDI Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              <div>
                <CardTitle>Company EDI Settings</CardTitle>
                <CardDescription>Your company's EDI identifiers used for all outbound documents</CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)}>
              {showSettings ? "Hide" : ediSettings ? "Edit" : "Configure"}
            </Button>
          </div>
        </CardHeader>
        {!showSettings && ediSettings && (
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">ISA ID:</span>
                <span className="ml-2 font-mono font-medium">{ediSettings.isaId}</span>
              </div>
              <div>
                <span className="text-muted-foreground">ISA Qualifier:</span>
                <span className="ml-2 font-mono">{ediSettings.isaQualifier}</span>
              </div>
              <div>
                <span className="text-muted-foreground">GS App Code:</span>
                <span className="ml-2 font-mono font-medium">{ediSettings.gsApplicationCode}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Auto-997:</span>
                <Badge variant="outline" className={ediSettings.autoSend997 ? "bg-green-50 text-green-700 ml-2" : "bg-gray-50 text-gray-700 ml-2"}>
                  {ediSettings.autoSend997 ? "Enabled" : "Disabled"}
                </Badge>
              </div>
            </div>
          </CardContent>
        )}
        {!showSettings && !ediSettings && (
          <CardContent>
            <p className="text-sm text-muted-foreground text-center py-2">
              No EDI settings configured yet. Click "Configure" to set your company's EDI identifiers.
            </p>
          </CardContent>
        )}
        {showSettings && (
          <CardContent>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="isaId">ISA Interchange ID</Label>
                  <Input id="isaId" name="isaId" placeholder="Your ISA ID" maxLength={15} required defaultValue={ediSettings?.isaId || ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="isaQualifier">ISA Qualifier</Label>
                  <Input id="isaQualifier" name="isaQualifier" placeholder="ZZ" maxLength={2} defaultValue={ediSettings?.isaQualifier || "ZZ"} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gsApplicationCode">GS Application Code</Label>
                  <Input id="gsApplicationCode" name="gsApplicationCode" placeholder="Your GS ID" maxLength={15} required defaultValue={ediSettings?.gsApplicationCode || ""} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name (for reference)</Label>
                  <Input id="companyName" name="companyName" placeholder="Your Company Name" defaultValue={ediSettings?.companyName || ""} />
                </div>
                <div className="flex items-center space-x-2 pt-6">
                  <Switch id="autoSend997" name="autoSend997" defaultChecked={ediSettings?.autoSend997 ?? true} />
                  <Label htmlFor="autoSend997">Auto-send 997 Functional Acknowledgments</Label>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowSettings(false)}>Cancel</Button>
                <Button type="submit" disabled={upsertSettings.isPending}>
                  {upsertSettings.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Settings
                </Button>
              </div>
            </form>
          </CardContent>
        )}
      </Card>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>Latest EDI document exchanges</CardDescription>
            </div>
            <Link href="/edi/transactions">
              <Button variant="outline" size="sm">
                View All <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recentTransactions && recentTransactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 text-sm font-medium text-muted-foreground">Type</th>
                    <th className="pb-2 text-sm font-medium text-muted-foreground">Direction</th>
                    <th className="pb-2 text-sm font-medium text-muted-foreground">PO #</th>
                    <th className="pb-2 text-sm font-medium text-muted-foreground">Control #</th>
                    <th className="pb-2 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="pb-2 text-sm font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recentTransactions.map((txn) => (
                    <tr key={txn.id} className="hover:bg-muted/50">
                      <td className="py-3 text-sm">
                        <span className="font-mono font-medium">{txn.transactionSetCode}</span>
                        <span className="text-muted-foreground ml-2">{txnSetLabels[txn.transactionSetCode] || ""}</span>
                      </td>
                      <td className="py-3 text-sm">
                        <Badge variant={txn.direction === "inbound" ? "default" : "secondary"}>
                          {txn.direction}
                        </Badge>
                      </td>
                      <td className="py-3 text-sm font-mono">{txn.purchaseOrderNumber || "-"}</td>
                      <td className="py-3 text-sm font-mono text-muted-foreground">{txn.interchangeControlNumber || "-"}</td>
                      <td className="py-3">
                        <Badge className={statusColors[txn.status] || "bg-gray-100 text-gray-800"} variant="outline">
                          {txn.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-sm text-muted-foreground">
                        {new Date(txn.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <ArrowLeftRight className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No EDI transactions yet</p>
              <p className="text-sm">Process your first EDI document to get started</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
