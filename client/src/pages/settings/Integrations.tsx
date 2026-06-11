import { useState, useEffect } from "react";
import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { 
  Mail, 
  ShoppingBag, 
  FileSpreadsheet, 
  Calculator, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Plus,
  Trash2,
  TestTube,
  History,
  Settings,
  Loader2,
  ExternalLink
} from "lucide-react";
export default function IntegrationsPage() {
  const [testEmail, setTestEmail] = useState("");
  const [showAddShopify, setShowAddShopify] = useState(false);
  const [shopifyShopDomain, setShopifyShopDomain] = useState("");
  const [shopifyConnecting, setShopifyConnecting] = useState(false);
  const [activeTab, setActiveTab] = useState("connections");

  const { data: status, isLoading, refetch } = trpc.integrations.getStatus.useQuery();
  const { data: syncHistory } = trpc.integrations.getSyncHistory.useQuery({ limit: 20 });
  const testSendgridMutation = trpc.integrations.testSendgrid.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
    },
  });

  const shopifyInitiateOAuthMutation = trpc.integrations.shopify.initiateOAuth.useMutation({
    onSuccess: (data) => {
      // Redirect to Shopify OAuth page
      window.location.href = data.authUrl;
    },
    onError: (error) => {
      toast.error(error.message);
      setShopifyConnecting(false);
    },
  });

  const shopifyDisconnectMutation = trpc.integrations.shopify.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Store disconnected successfully");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const shopifyTestConnectionMutation = trpc.integrations.shopify.testConnection.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const clearHistoryMutation = trpc.integrations.clearSyncHistory.useMutation({
    onSuccess: () => {
      toast.success("Sync history cleared");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Check for OAuth callback success/error in URL
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shopifySuccess = params.get('shopify_success');
    const shopifyError = params.get('shopify_error');
    const shopName = params.get('shop');

    if (shopifySuccess === 'connected') {
      toast.success(`Successfully connected to ${shopName || 'Shopify store'}!`);
      refetch();
      // Clean up URL
      window.history.replaceState({}, '', '/settings/integrations');
    } else if (shopifyError) {
      const errorMessages: Record<string, string> = {
        'missing_params': 'Missing required parameters from Shopify',
        'not_configured': 'Shopify integration is not configured. Please contact your administrator.',
        'not_authenticated': 'You must be logged in to connect a Shopify store',
        'user_mismatch': 'User session mismatch during OAuth flow',
        'company_mismatch': 'Company mismatch during OAuth flow',
        'invalid_domain': 'Invalid Shopify domain',
        'invalid_state': 'Invalid OAuth state parameter',
        'shop_mismatch': 'Shop domain mismatch in OAuth flow',
        'state_expired': 'OAuth session expired. Please try connecting again.',
        'token_exchange_failed': 'Failed to exchange authorization code for access token',
        'failed_to_fetch_shop_info': 'Failed to fetch shop information',
        'oauth_failed': 'OAuth authentication failed',
      };
      toast.error(errorMessages[shopifyError] || 'Failed to connect Shopify store');
      // Clean up URL
      window.history.replaceState({}, '', '/settings/integrations');
    }
  }, [refetch]);

  const handleConnectShopify = () => {
    if (!shopifyShopDomain.trim()) {
      toast.error("Please enter your Shopify store domain");
      return;
    }
    setShopifyConnecting(true);
    shopifyInitiateOAuthMutation.mutate({ shop: shopifyShopDomain });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "connected":
  const shopifyDisconnectMutation = trpc.integrations.shopify.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Store disconnected successfully");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const shopifyTestConnectionMutation = trpc.integrations.shopify.testConnection.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const clearHistoryMutation = trpc.integrations.clearSyncHistory.useMutation({
    onSuccess: () => {
      toast.success("Sync history cleared");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Check for OAuth callback success/error in URL
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shopifySuccess = params.get('shopify_success');
    const shopifyError = params.get('shopify_error');
    const shopName = params.get('shop');

    if (shopifySuccess === 'connected') {
      toast.success(`Successfully connected to ${shopName || 'Shopify store'}!`);
      refetch();
      // Clean up URL
      window.history.replaceState({}, '', '/settings/integrations');
    } else if (shopifyError) {
      const errorMessages: Record<string, string> = {
        'missing_params': 'Missing required parameters from Shopify',
        'not_configured': 'Shopify integration is not configured. Please contact your administrator.',
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="connections">Connections</TabsTrigger>
            <TabsTrigger value="shopify">Shopify</TabsTrigger>
        'token_exchange_failed': 'Failed to exchange authorization code for access token',
        'failed_to_fetch_shop_info': 'Failed to fetch shop information',
        'oauth_failed': 'OAuth authentication failed',
      };
      toast.error(errorMessages[shopifyError] || 'Failed to connect Shopify store');
      // Clean up URL
      window.history.replaceState({}, '', '/settings/integrations');
    }
  }, [refetch]);

  const handleConnectShopify = () => {
    if (!shopifyShopDomain.trim()) {
      toast.error("Please enter your Shopify store domain");
      return;
    }
    setShopifyConnecting(true);
    shopifyInitiateOAuthMutation.mutate({ shop: shopifyShopDomain });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "connected":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Connected</Badge>;
      case "error":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Error</Badge>;
      case "not_configured":
        return <Badge variant="secondary"><AlertCircle className="w-3 h-3 mr-1" /> Not Configured</Badge>;
      default:
                    variant="outline" 
                    size="sm"
                    disabled={!status?.sendgrid?.configured}
                    onClick={() => setActiveTab("email")}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Configure
      case "warning":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Warning</Badge>;
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Integration Settings</h1>
            <p className="text-muted-foreground mt-1">
              Manage API connections, sync configurations, and external services
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setActiveTab("shopify")}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Configure
            <TabsTrigger value="connections">Connections</TabsTrigger>
            <TabsTrigger value="shopify">Shopify</TabsTrigger>
            <TabsTrigger value="email">Email (SendGrid)</TabsTrigger>
            <TabsTrigger value="history">Sync History</TabsTrigger>
          </TabsList>

          {/* Connections Overview Tab */}
          <TabsContent value="connections" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* SendGrid Card */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                      <Mail className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">SendGrid</CardTitle>
                      <CardDescription>Email delivery service</CardDescription>
                    </div>
                  </div>
                  {getStatusBadge(status?.sendgrid?.status || "not_configured")}
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    {status?.sendgrid?.configured 
                      ? "SendGrid is configured and ready to send emails."
                      : "Add SENDGRID_API_KEY and SENDGRID_FROM_EMAIL in Settings â Secrets to enable email sending."}
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    disabled={!status?.sendgrid?.configured}
                    onClick={() => setActiveTab("email")}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Configure
                  </Button>
                </CardContent>
              </Card>

              {/* Shopify Card */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-500/10 rounded-lg">
                      <ShoppingBag className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Shopify</CardTitle>
                      <CardDescription>E-commerce platform</CardDescription>
                    </div>
                  </div>
                  {getStatusBadge(status?.shopify?.status || "not_configured")}
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    {status?.shopify?.configured 
                      ? `${status.shopify.storeCount} store(s) connected for order and inventory sync.`
                      : "Connect your Shopify store to sync orders and inventory."}
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setActiveTab("shopify")}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Configure
                  </Button>
                </CardContent>
              </Card>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Connect Shopify Store</DialogTitle>
                        <DialogDescription>
                          Enter your Shopify store domain to securely connect via OAuth
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="shopDomain">Shopify Store Domain</Label>
                          <Input
                            id="shopDomain"
                            placeholder="mystore.myshopify.com"
                            value={shopifyShopDomain}
                            onChange={(e) => setShopifyShopDomain(e.target.value)}
                            disabled={shopifyConnecting}
                          />
                          <p className="text-xs text-muted-foreground">
                            Enter your store name or full domain (e.g., "mystore" or "mystore.myshopify.com")
                          </p>
                        </div>
                        <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                          <h4 className="font-medium text-sm mb-2 text-blue-900 dark:text-blue-100">Secure OAuth Connection</h4>
                          <p className="text-xs text-blue-700 dark:text-blue-300">
                            You'll be redirected to Shopify to authorize this connection. No need to manually copy access tokens - the integration will be set up automatically.
                          </p>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            setShowAddShopify(false);
                            setShopifyShopDomain("");
                            setShopifyConnecting(false);
                          }}
                          disabled={shopifyConnecting}
                        >
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleConnectShopify}
                          disabled={shopifyConnecting || !shopifyShopDomain.trim()}
                        >
                          {shopifyConnecting ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            <>
                              <ShoppingBag className="w-4 h-4 mr-2" />
                              Connect to Shopify
                            </>
                          )}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  <div>
                    <CardTitle>Shopify Stores</CardTitle>
                    <CardDescription>Manage connected Shopify stores for order and inventory sync</CardDescription>
                  </div>
                  <Dialog open={showAddShopify} onOpenChange={setShowAddShopify}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Store
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Connect Shopify Store</DialogTitle>
                        <DialogDescription>
                          Enter your Shopify store domain to securely connect via OAuth
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="shopDomain">Shopify Store Domain</Label>
                          <Input
                            id="shopDomain"
                            placeholder="mystore.myshopify.com"
                            value={shopifyShopDomain}
                            onChange={(e) => setShopifyShopDomain(e.target.value)}
                            disabled={shopifyConnecting}
                          />
                          <p className="text-xs text-muted-foreground">
                            Enter your store name or full domain (e.g., "mystore" or "mystore.myshopify.com")
                          </p>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => shopifyTestConnectionMutation.mutate({ storeId: store.id })}
                                disabled={shopifyTestConnectionMutation.isPending || !store.isEnabled}
                                title="Test connection"
                              >
                                <TestTube className="w-4 h-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-destructive"
                                onClick={() => {
                                  if (confirm(`Are you sure you want to disconnect ${store.storeName || store.storeDomain}?`)) {
                                    shopifyDisconnectMutation.mutate({ storeId: store.id });
                                  }
                                }}
                                disabled={shopifyDisconnectMutation.isPending}
                                title="Disconnect store"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                            setShopifyShopDomain("");
                            setShopifyConnecting(false);
                          }}
                          disabled={shopifyConnecting}
                        >
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleConnectShopify}
                          disabled={shopifyConnecting || !shopifyShopDomain.trim()}
                        >
                          {shopifyConnecting ? (

                <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-medium mb-2">Sync Settings</h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    Default settings for new store connections. Editing existing store settings coming soon.
                  </p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Sync Orders</Label>
                        <p className="text-xs text-muted-foreground">Automatically import orders from Shopify</p>
                      </div>
                      <Switch defaultChecked disabled />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Sync Inventory</Label>
                        <p className="text-xs text-muted-foreground">Push inventory levels to Shopify</p>
                      </div>
                      <Switch defaultChecked disabled />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Auto-fulfill Orders</Label>
                        <p className="text-xs text-muted-foreground">Mark orders as fulfilled when shipped</p>
                      </div>
                      <Switch disabled />
                    </div>
                  </div>
                </div>
                    </TableHeader>
                    <TableBody>
                      {status.shopify.stores.map((store: any) => (
                        <TableRow key={store.id}>
                          <TableCell className="font-medium">{store.storeName || store.storeDomain}</TableCell>
                          <TableCell>{store.storeDomain}</TableCell>
                          <TableCell>
                            {store.isEnabled ? (
                              <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Active</Badge>
                            ) : (
                              <Badge variant="secondary">Disabled</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {store.lastSyncAt 
                              ? new Date(store.lastSyncAt).toLocaleString()
                              : "Never"}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => shopifyTestConnectionMutation.mutate({ storeId: store.id })}
                                disabled={shopifyTestConnectionMutation.isPending || !store.isEnabled}
                                title="Test connection"
                              >
                                <TestTube className="w-4 h-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-destructive"
                                onClick={() => {
                                  if (confirm(`Are you sure you want to disconnect ${store.storeName || store.storeDomain}?`)) {
                                    shopifyDisconnectMutation.mutate({ storeId: store.id });
                                  }
                                }}
                                disabled={shopifyDisconnectMutation.isPending}
                                title="Disconnect store"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <ShoppingBag className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No Shopify stores connected</p>
                    <p className="text-sm">Click "Add Store" to connect your first store</p>
                  </div>
                )}

                <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-medium mb-2">Sync Settings</h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    Default settings for new store connections. Editing existing store settings coming soon.
                  </p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Sync Orders</Label>
                        <p className="text-xs text-muted-foreground">Automatically import orders from Shopify</p>
                      </div>
                      <Switch defaultChecked disabled />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Sync Inventory</Label>
                        <p className="text-xs text-muted-foreground">Push inventory levels to Shopify</p>
                      </div>
                      <Switch defaultChecked disabled />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Auto-fulfill Orders</Label>
                        <p className="text-xs text-muted-foreground">Mark orders as fulfilled when shipped</p>
                      </div>
                      <Switch disabled />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Email (SendGrid) Tab */}
          <TabsContent value="email" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>SendGrid Configuration</CardTitle>
                <CardDescription>
                  Configure SendGrid for sending freight RFQ emails and notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                  <div className={`p-3 rounded-full ${status?.sendgrid?.configured ? 'bg-green-500/10' : 'bg-yellow-500/10'}`}>
                    {status?.sendgrid?.configured ? (
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                    ) : (
                      <AlertCircle className="w-6 h-6 text-yellow-500" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium">
                      {status?.sendgrid?.configured ? "SendGrid is configured" : "SendGrid not configured"}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {status?.sendgrid?.configured 
                        ? "Your SendGrid API key is set and ready to send emails."
                        : "Add your SendGrid credentials in Settings â Secrets to enable email sending."}
                    </p>
                  </div>
                </div>

                {!status?.sendgrid?.configured && (
                  <div className="space-y-4 p-4 border rounded-lg">
                    <h4 className="font-medium">Setup Instructions</h4>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                      <li>Create a SendGrid account at <a href="https://sendgrid.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">sendgrid.com</a></li>
                      <li>Go to Settings â API Keys and create a new API key with "Mail Send" permissions</li>
                      <li>Verify a sender email address in Settings â Sender Authentication</li>
                      <li>Add the following secrets in Settings â Secrets:
                        <ul className="list-disc list-inside ml-4 mt-1">
                          <li><code className="bg-muted px-1 rounded">SENDGRID_API_KEY</code> - Your API key (starts with SG.)</li>
                          <li><code className="bg-muted px-1 rounded">SENDGRID_FROM_EMAIL</code> - Your verified sender email</li>
                        </ul>
                      </li>
                    </ol>
                    <Button variant="outline" asChild>
                      <a href="https://app.sendgrid.com/settings/api_keys" target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Open SendGrid Dashboard
                      </a>
                    </Button>
                  </div>
                )}

                {status?.sendgrid?.configured && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="testEmail">Test Email</Label>
                      <div className="flex gap-2">
                        <Input
                          id="testEmail"
                          type="email"
                          placeholder="test@example.com"
                          value={testEmail}
                          onChange={(e) => setTestEmail(e.target.value)}
                        />
                        <Button 
                          onClick={() => testSendgridMutation.mutate({ testEmail })}
                          disabled={!testEmail || testSendgridMutation.isPending}
                        >
                          {testSendgridMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <TestTube className="w-4 h-4 mr-2" />
                          )}
                          Send Test
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Send a test email to verify your SendGrid configuration
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sync History Tab */}
          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Sync History</CardTitle>
                    <CardDescription>Recent integration sync events and status</CardDescription>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => clearHistoryMutation.mutate()}
                    disabled={clearHistoryMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear History
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {syncHistory && syncHistory.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Integration</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {syncHistory.map((log: any) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-muted-foreground">
                            {new Date(log.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {log.integration}
                            </Badge>
                          </TableCell>
                          <TableCell className="capitalize">
                            {log.action.replace(/_/g, ' ')}
                          </TableCell>
                          <TableCell>
                            {getSyncStatusBadge(log.status)}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {log.details || log.errorMessage || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No sync history yet</p>
                    <p className="text-sm">Sync events will appear here as they occur</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
  );
}
