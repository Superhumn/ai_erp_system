import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "../../lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Label } from "../../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { AlertCircle, Check, RefreshCw, Settings, DollarSign } from "lucide-react";
import { toast } from "sonner";

const MAPPING_TYPE_LABELS: Record<string, string> = {
  cogs_product: "COGS - Product Cost",
  cogs_freight: "COGS - Freight/Shipping",
  cogs_customs: "COGS - Customs/Duties",
  inventory_asset: "Inventory Asset",
  freight_expense: "Freight Expense",
  income_sales: "Sales Income",
  expense_other: "Other Expenses",
};

export default function QuickBooksIntegration() {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();
  const [selectedMappingType, setSelectedMappingType] = useState<string>("");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");

  // Check connection status
  const { data: connectionStatus, isLoading: connectionLoading } = trpc.quickbooks.getConnectionStatus.useQuery();

  // Get QuickBooks accounts
  const { data: qbAccounts, isLoading: accountsLoading } = trpc.quickbooks.getAccounts.useQuery(
    undefined,
    { enabled: connectionStatus?.connected ?? false }
  );

  // Get current account mappings
  const { data: accountMappings, isLoading: mappingsLoading } = trpc.quickbooks.getAccountMappings.useQuery(
    {},
    { enabled: connectionStatus?.connected ?? false }
  );

  // Sync accounts mutation
  const syncAccountsMutation = trpc.quickbooks.syncAccounts.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      utils.quickbooks.getAccounts.invalidate();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to sync accounts from QuickBooks");
    },
  });

  // Sync items mutation
  const syncItemsMutation = trpc.quickbooks.syncItems.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to sync items from QuickBooks");
    },
  });

  // Save mapping mutation
  const saveMappingMutation = trpc.quickbooks.upsertAccountMapping.useMutation({
    onSuccess: () => {
      toast.success("Account mapping has been updated");
      utils.quickbooks.getAccountMappings.invalidate();
      setSelectedMappingType("");
      setSelectedAccountId("");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to save account mapping");
    },
  });

  const handleSaveMapping = () => {
    if (!selectedMappingType || !selectedAccountId) {
      toast.error("Please select both a mapping type and QuickBooks account");
      return;
    }

    saveMappingMutation.mutate({
      mappingType: selectedMappingType as any,
      quickbooksAccountId: selectedAccountId,
      isDefault: true,
    });
  };

  if (connectionLoading) {
    return <div className="p-6">Loading QuickBooks connection status...</div>;
  }

  if (!connectionStatus?.connected) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>QuickBooks Integration</CardTitle>
            <CardDescription>
              QuickBooks is not connected. Please connect to QuickBooks to configure COGS data integration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.href = '/settings'}>
              Go to Settings to Connect
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get current mapping for each type
  const getMappingForType = (type: string) => {
    return accountMappings?.find((m: any) => 
      m.quickbooksAccountMappings.mappingType === type && 
      m.quickbooksAccountMappings.isDefault
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.025em]">QuickBooks COGS Integration</h1>
          <p className="text-muted-foreground mt-2">
            Configure how COGS data is sourced from QuickBooks
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => syncAccountsMutation.mutate({})}
            disabled={syncAccountsMutation.isPending}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${syncAccountsMutation.isPending ? 'animate-spin' : ''}`} />
            Sync Accounts
          </Button>
          <Button
            variant="outline"
            onClick={() => syncItemsMutation.mutate({})}
            disabled={syncItemsMutation.isPending}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${syncItemsMutation.isPending ? 'animate-spin' : ''}`} />
            Sync Items
          </Button>
        </div>
      </div>

      <Tabs defaultValue="mappings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="mappings">Account Mappings</TabsTrigger>
          <TabsTrigger value="status">Sync Status</TabsTrigger>
        </TabsList>

        <TabsContent value="mappings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>COGS Account Mappings</CardTitle>
              <CardDescription>
                Map ERP cost categories to QuickBooks accounts for accurate COGS tracking
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Current Mappings */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Current Mappings</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>QuickBooks Account</TableHead>
                      <TableHead>Account Type</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(MAPPING_TYPE_LABELS).map(([type, label]) => {
                      const mapping = getMappingForType(type);
                      const account = (mapping as any)?.quickbooksAccounts;
                      
                      return (
                        <TableRow key={type}>
                          <TableCell className="font-medium">{label}</TableCell>
                          <TableCell>
                            {account ? account.name : <span className="text-muted-foreground">Not mapped</span>}
                          </TableCell>
                          <TableCell>
                            {account ? (
                              <Badge variant="outline">{account.accountType}</Badge>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            {account ? (
                              <Badge variant="default" className="gap-1 bg-green-600 text-white">
                                <Check className="h-3 w-3" />
                                Configured
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Pending
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Add/Update Mapping */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-3">Add or Update Mapping</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="mappingType">Category</Label>
                    <Select value={selectedMappingType} onValueChange={setSelectedMappingType}>
                      <SelectTrigger id="mappingType">
                        <SelectValue placeholder="Select category..." />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(MAPPING_TYPE_LABELS).map(([type, label]) => (
                          <SelectItem key={type} value={type}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="qbAccount">QuickBooks Account</Label>
                    <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                      <SelectTrigger id="qbAccount">
                        <SelectValue placeholder="Select QuickBooks account..." />
                      </SelectTrigger>
                      <SelectContent>
                        {qbAccounts?.map((account: any) => (
                          <SelectItem key={account.id} value={account.quickbooksAccountId}>
                            {account.name} ({account.accountType})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  onClick={handleSaveMapping}
                  disabled={saveMappingMutation.isPending || !selectedMappingType || !selectedAccountId}
                  className="mt-4"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Save Mapping
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="status" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sync Status</CardTitle>
              <CardDescription>
                QuickBooks data synchronization status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium">Chart of Accounts</p>
                      <p className="text-sm text-muted-foreground">
                        {qbAccounts?.length || 0} accounts synced
                      </p>
                    </div>
                  </div>
                  <Badge variant="default" className="bg-green-600 text-white">Active</Badge>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <DollarSign className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="font-medium">Account Mappings</p>
                      <p className="text-sm text-muted-foreground">
                        {accountMappings?.filter((m: any) => m.quickbooksAccountMappings.isDefault).length || 0} of 7 configured
                      </p>
                    </div>
                  </div>
                  <Badge variant={accountMappings?.length ? "default" : "secondary"} className={accountMappings?.length ? "bg-green-600 text-white" : ""}>
                    {accountMappings?.length ? "Configured" : "Pending"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
