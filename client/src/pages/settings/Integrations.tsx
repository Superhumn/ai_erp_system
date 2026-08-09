import { useState, useEffect } from "react";
import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useSearch } from "wouter";
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
  const searchParams = useSearch();
  const [testEmail, setTestEmail] = useState("");
  const [showAddShopify, setShowAddShopify] = useState(false);
  const [shopifyShopDomain, setShopifyShopDomain] = useState("");
  const [shopifyConnecting, setShopifyConnecting] = useState(false);
  const [activeTab, setActiveTab] = useState("connections");

  // Gmail: compose draft dialog
  const [showComposeDraft, setShowComposeDraft] = useState(false);
  const [draftTo, setDraftTo] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  // Gmail: message viewer + reply
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");

  // Workspace: new doc dialog
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  // Workspace: new sheet dialog
  const [showNewSheet, setShowNewSheet] = useState(false);
  const [sheetTitle, setSheetTitle] = useState("");
  // Workspace: share dialog
  const [showShareFile, setShowShareFile] = useState(false);
  const [shareFileId, setShareFileId] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState<"reader" | "writer" | "commenter">("reader");
  // Workspace: sheet values tools
  const [sheetToolsId, setSheetToolsId] = useState("");
  const [sheetToolsRange, setSheetToolsRange] = useState("A1");
  const [sheetToolsValues, setSheetToolsValues] = useState("");
  const [sheetValuesQuery, setSheetValuesQuery] = useState<{ spreadsheetId: string; range: string } | null>(null);

  const { data: status, isLoading, refetch } = trpc.integrations.getStatus.useQuery(undefined, { refetchOnWindowFocus: true, refetchOnMount: "always", staleTime: 0 });
  const { data: syncHistory } = trpc.integrations.getSyncHistory.useQuery({ limit: 20 });

  // Get OAuth URLs for Gmail and Google Workspace
  const { data: gmailAuthUrl } = trpc.gmail.getAuthUrl.useQuery();
  const { data: workspaceAuthUrl } = trpc.googleWorkspace.getAuthUrl.useQuery();
  const { data: sheetsAuthUrl } = trpc.sheetsImport.getAuthUrl.useQuery();
  
  // Admin-only diagnostic showing which QuickBooks credentials the deployed
  // server actually loaded from env. Used to confirm a Railway env update
  // actually reached the running process.
  const { data: quickbooksDebug } = trpc.quickbooks.debugConfig.useQuery(undefined, {
    retry: false,
  });

  // Get QuickBooks OAuth URL. The tRPC inferred type lands as `unknown` for
  // this procedure, so narrow it here to keep call sites type-checked.
  const { data: quickbooksAuthUrlData } = trpc.quickbooks.getAuthUrl.useQuery();
  const quickbooksAuthUrl = quickbooksAuthUrlData as
    | { url?: string; redirectUri?: string; error?: string }
    | undefined;

  // Handle OAuth callback
  useEffect(() => {
    if (searchParams) {
      const params = new URLSearchParams(searchParams);
      if (params.get("success") === "connected") {
        toast.success("Google account connected successfully!");
        refetch();
        // Clear query parameters from URL
        window.history.replaceState({}, '', '/settings/integrations');
      } else if (params.get("error")) {
        const error = params.get("error");
        toast.error(`Connection failed: ${error}`);
        // Clear query parameters from URL
        window.history.replaceState({}, '', '/settings/integrations');
      }
    }
  }, [searchParams, refetch]);

  const testSendgridMutation = trpc.integrations.testSendgrid.useMutation({
    onSuccess: (data) => {
      toast.success((data as any).message ?? "Success");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
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
      toast.success((data as any).message ?? "Connection successful");
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

  const quickbooksDisconnectMutation = trpc.quickbooks.disconnect.useMutation({
    onSuccess: () => {
      toast.success("QuickBooks disconnected successfully");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Gmail and Google Workspace share one Google OAuth token, so either
  // disconnect removes the whole Google connection.
  const gmailDisconnectMutation = trpc.gmail.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Google account disconnected");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const workspaceDisconnectMutation = trpc.googleWorkspace.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Google account disconnected");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Live connection status straight from the Google token (shared by Gmail + Workspace).
  const { data: gmailConn } = trpc.gmail.getConnectionStatus.useQuery();
  const { data: workspaceConn } = trpc.googleWorkspace.getConnectionStatus.useQuery();

  // Gmail: recent messages peek (only when connected)
  const gmailConnected = !!status?.gmail?.configured || !!(gmailConn as any)?.connected;
  const {
    data: gmailMessages,
    isLoading: gmailMessagesLoading,
    refetch: refetchGmailMessages,
  } = trpc.gmail.listMessages.useQuery({ maxResults: 10 }, { enabled: gmailConnected });

  // Gmail: full message for the viewer dialog
  const { data: gmailMessage, isLoading: gmailMessageLoading } = trpc.gmail.getMessage.useQuery(
    { messageId: selectedMessageId ?? "" },
    { enabled: !!selectedMessageId },
  );

  const createDraftMutation = trpc.gmail.createDraft.useMutation({
    onSuccess: () => {
      toast.success("Draft created in Gmail");
      setShowComposeDraft(false);
      setDraftTo("");
      setDraftSubject("");
      setDraftBody("");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const replyToMessageMutation = trpc.gmail.replyToMessage.useMutation({
    onSuccess: () => {
      toast.success("Reply sent");
      setReplyBody("");
      setSelectedMessageId(null);
      refetchGmailMessages();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const createDocMutation = trpc.googleWorkspace.createDoc.useMutation({
    onSuccess: (data) => {
      const link = (data as any)?.webViewLink;
      toast.success("Google Doc created");
      if (link) window.open(link, "_blank", "noopener,noreferrer");
      setShowNewDoc(false);
      setDocTitle("");
      setDocContent("");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const createSheetMutation = trpc.googleWorkspace.createSheet.useMutation({
    onSuccess: (data) => {
      const link = (data as any)?.spreadsheetUrl || (data as any)?.webViewLink;
      toast.success("Google Sheet created");
      if (link) window.open(link, "_blank", "noopener,noreferrer");
      setShowNewSheet(false);
      setSheetTitle("");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const shareFileMutation = trpc.googleWorkspace.shareFile.useMutation({
    onSuccess: () => {
      toast.success("File shared");
      setShowShareFile(false);
      setShareFileId("");
      setShareEmail("");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const appendToSheetMutation = trpc.googleWorkspace.appendToSheet.useMutation({
    onSuccess: (data) => {
      toast.success(`Appended (${(data as any)?.updatedCells ?? 0} cells)`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateSheetValuesMutation = trpc.googleWorkspace.updateSheetValues.useMutation({
    onSuccess: (data) => {
      toast.success(`Updated (${(data as any)?.updatedCells ?? 0} cells)`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Workspace: read sheet values on demand (enabled once a query target is set)
  const { data: sheetValues, isFetching: sheetValuesFetching } =
    trpc.googleWorkspace.getSheetValues.useQuery(
      sheetValuesQuery ?? { spreadsheetId: "", range: "" },
      { enabled: !!sheetValuesQuery },
    );

  // Parse the textarea into a 2D array of cells: newline = rows, comma = columns.
  const parseSheetValues = (raw: string): string[][] =>
    raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => line.split(",").map((cell) => cell.trim()));

  const gmailMsg = gmailMessage as any;
  const gmailMsgHeaders: any[] = gmailMsg?.payload?.headers ?? [];
  const getGmailHeader = (name: string): string =>
    gmailMsgHeaders.find((h: any) => (h?.name ?? "").toLowerCase() === name.toLowerCase())?.value ?? "";

  // Check for OAuth callback success/error in URL
  React.useEffect(() => {
    if (!searchParams) return;
    
    const params = new URLSearchParams(searchParams);
    const shopifySuccess = params.get('shopify_success');
    const shopifyError = params.get('shopify_error');
    const shopName = params.get('shop');
    const quickbooksSuccess = params.get('quickbooks_success');
    const quickbooksError = params.get('quickbooks_error');

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

    if (quickbooksSuccess === 'connected') {
      toast.success('Successfully connected to QuickBooks!');
      refetch();
      // Clean up URL
      window.history.replaceState({}, '', '/settings/integrations');
    } else if (quickbooksError) {
      const errorMessages: Record<string, string> = {
        'missing_params': 'Missing required parameters from QuickBooks',
        'not_configured': 'QuickBooks integration is not configured. Please contact your administrator.',
        'not_authenticated': 'You must be logged in to connect QuickBooks',
        'invalid_state': 'Invalid OAuth state — please try connecting again',
        'token_exchange_failed': 'Failed to exchange authorization code for access token',
        'oauth_failed': 'OAuth authentication failed',
        'intuit_error': 'QuickBooks authorization failed',
      };
      const detail = params.get('detail');
      const base = errorMessages[quickbooksError] || 'Failed to connect QuickBooks';
      toast.error(detail ? `${base}: ${detail}` : base);
      // Clean up URL
      window.history.replaceState({}, '', '/settings/integrations');
    }
  }, [searchParams, refetch]);

  const handleConnectShopify = () => {
    if (!shopifyShopDomain.trim()) {
      toast.error("Please enter your Shopify store domain");
      return;
    }
    setShopifyConnecting(true);
    shopifyInitiateOAuthMutation.mutate({ shop: shopifyShopDomain } as any);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "connected":
        return <Badge className="bg-primary/10 text-primary border-primary/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Connected</Badge>;
      case "error":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Error</Badge>;
      case "not_configured":
        return <Badge variant="secondary"><AlertCircle className="w-3 h-3 mr-1" /> Not Configured</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSyncStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge className="bg-primary/10 text-primary border-primary/20">Success</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      case "warning":
        return <Badge className="bg-muted text-foreground font-semibold">Warning</Badge>;
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
            <h1 className="text-lg font-semibold">Integration Settings</h1>
            <p className="text-muted-foreground mt-1">
              Manage API connections, sync configurations, and external services
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh Status
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="connections">Connections</TabsTrigger>
            <TabsTrigger value="shopify">Shopify</TabsTrigger>
            <TabsTrigger value="email">Email (SendGrid)</TabsTrigger>
            <TabsTrigger value="gmail">Gmail</TabsTrigger>
            <TabsTrigger value="workspace">Google Workspace</TabsTrigger>
            <TabsTrigger value="quickbooks">QuickBooks</TabsTrigger>
            <TabsTrigger value="history">Sync History</TabsTrigger>
          </TabsList>

          {/* Connections Overview Tab — compact rows, no scrolling */}
          <TabsContent value="connections">
            <Card>
              <CardContent className="p-0 divide-y">
                {[
                  {
                    icon: <Mail className="w-4 h-4 text-muted-foreground" />,
                    bg: "bg-muted",
                    name: "SendGrid",
                    desc: status?.sendgrid?.configured ? "Configured and ready" : "Email delivery service",
                    status: status?.sendgrid?.status || "not_configured",
                    action: () => setActiveTab("email"),
                    actionLabel: "Configure",
                  },
                  {
                    icon: <ShoppingBag className="w-4 h-4 text-muted-foreground" />,
                    bg: "bg-muted",
                    name: "Shopify",
                    desc: status?.shopify?.configured ? `${status.shopify.storeCount} store(s) connected` : "E-commerce platform",
                    status: status?.shopify?.status || "not_configured",
                    action: () => setActiveTab("shopify"),
                    actionLabel: "Configure",
                  },
                  {
                    icon: <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />,
                    bg: "bg-muted",
                    name: "Google Sheets",
                    desc: status?.google?.configured ? `Connected as ${status.google.email}` : "Data import/export",
                    status: status?.google?.status || "not_configured",
                    action: () => {
                      if (status?.google?.configured) { window.location.href = '/import'; }
                      else if (sheetsAuthUrl?.url) { window.location.href = sheetsAuthUrl.url; }
                      else { toast.error(sheetsAuthUrl?.error || "Google OAuth not configured"); }
                    },
                    actionLabel: status?.google?.configured ? "Import" : "Connect",
                  },
                  {
                    icon: <Mail className="w-4 h-4 text-muted-foreground" />,
                    bg: "bg-muted",
                    name: "Gmail",
                    desc: status?.gmail?.configured ? `Connected as ${status.gmail.email}` : "Email integration",
                    status: status?.gmail?.status || "not_configured",
                    action: () => {
                      if (status?.gmail?.configured) { setActiveTab("gmail"); }
                      else if (gmailAuthUrl?.url) { window.location.href = gmailAuthUrl.url; }
                      else { toast.error(gmailAuthUrl?.error || "Google OAuth not configured"); }
                    },
                    actionLabel: status?.gmail?.configured ? "Configure" : "Connect",
                  },
                  {
                    icon: <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />,
                    bg: "bg-muted",
                    name: "Google Workspace",
                    desc: status?.googleWorkspace?.configured ? `Connected as ${status.googleWorkspace.email}` : "Docs & Sheets",
                    status: status?.googleWorkspace?.status || "not_configured",
                    action: () => {
                      if (status?.googleWorkspace?.configured) { setActiveTab("workspace"); }
                      else if (workspaceAuthUrl?.url) { window.location.href = workspaceAuthUrl.url; }
                      else { toast.error(workspaceAuthUrl?.error || "Google OAuth not configured"); }
                    },
                    actionLabel: status?.googleWorkspace?.configured ? "Configure" : "Connect",
                  },
                  {
                    icon: <Calculator className="w-4 h-4 text-muted-foreground" />,
                    bg: "bg-muted",
                    name: "QuickBooks",
                    desc: status?.quickbooks?.configured ? `Company ${status.quickbooks.realmId}` : "Accounting software",
                    status: status?.quickbooks?.status || "not_configured",
                    action: () => setActiveTab("quickbooks"),
                    actionLabel: "Configure",
                  },
                  {
                    icon: <Settings className="w-4 h-4 text-muted-foreground" />,
                    bg: "bg-muted",
                    name: "Fireflies.ai",
                    desc: "Meeting transcription & actions",
                    status: (status as any)?.fireflies?.status || "not_configured" as string,
                    action: () => { window.location.href = '/settings/fireflies'; },
                    actionLabel: "Configure",
                  },
                ].map((item) => (
                  <div key={item.name} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors">
                    <div className={`p-1.5 rounded-md ${item.bg} shrink-0`}>
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{item.name}</span>
                      <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">{item.desc}</span>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {getStatusBadge(item.status)}
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={item.action}>
                        {item.actionLabel}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Shopify Tab */}
          <TabsContent value="shopify" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
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
                        </div>
                        <div className="p-4 bg-muted/50 rounded-lg border">
                          <h4 className="font-medium text-sm mb-2 text-foreground">Secure OAuth Connection</h4>
                          <p className="text-xs text-muted-foreground">
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
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {status?.shopify?.stores && status.shopify.stores.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Store Name</TableHead>
                        <TableHead>Domain</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Sync</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {status.shopify.stores.map((store: any) => (
                        <TableRow key={store.id}>
                          <TableCell className="font-medium">{store.storeName || store.storeDomain}</TableCell>
                          <TableCell>{store.storeDomain}</TableCell>
                          <TableCell>
                            {store.isEnabled ? (
                              <Badge className="bg-primary/10 text-primary border-primary/20">Active</Badge>
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
                                onClick={() => shopifyTestConnectionMutation.mutate({ storeId: store.id } as any)}
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
                                    shopifyDisconnectMutation.mutate({ storeId: store.id } as any);
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
                  <div className={`p-3 rounded-full ${status?.sendgrid?.configured ? 'bg-primary/10' : 'bg-muted'}`}>
                    {status?.sendgrid?.configured ? (
                      <CheckCircle2 className="w-6 h-6 text-primary" />
                    ) : (
                      <AlertCircle className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium">
                      {status?.sendgrid?.configured ? "SendGrid is configured" : "SendGrid not configured"}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {status?.sendgrid?.configured 
                        ? "Your SendGrid API key is set and ready to send emails."
                        : "Add your SendGrid credentials in Settings → Secrets to enable email sending."}
                    </p>
                  </div>
                </div>

                {!status?.sendgrid?.configured && (
                  <div className="space-y-4 p-4 border rounded-lg">
                    <h4 className="font-medium">Setup Instructions</h4>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                      <li>Create a SendGrid account at <a href="https://sendgrid.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">sendgrid.com</a></li>
                      <li>Go to Settings → API Keys and create a new API key with "Mail Send" permissions</li>
                      <li>Verify a sender email address in Settings → Sender Authentication</li>
                      <li>Add the following secrets in Settings → Secrets:
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

          {/* Gmail Tab */}
          <TabsContent value="gmail" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Gmail Integration</CardTitle>
                <CardDescription>
                  Send emails and manage your inbox via Gmail API
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                  <div className={`p-3 rounded-full ${status?.gmail?.configured ? 'bg-primary/10' : 'bg-muted'}`}>
                    {status?.gmail?.configured ? (
                      <CheckCircle2 className="w-6 h-6 text-primary" />
                    ) : (
                      <AlertCircle className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium">
                      {status?.gmail?.configured ? 'Gmail Connected' : 'Gmail Not Connected'}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {status?.gmail?.configured 
                        ? `Connected as ${status.gmail.email}`
                        : 'Connect your Google account to send and receive emails via Gmail'}
                    </p>
                  </div>
                </div>

                {!status?.gmail?.configured ? (
                  <div className="space-y-4">
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-medium mb-2">Connect Gmail Account</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        Authorize this application to access your Gmail account to send and manage emails.
                      </p>
                      <Button onClick={() => {
                        if (gmailAuthUrl?.url) {
                          window.location.href = gmailAuthUrl.url;
                        } else {
                          toast.error(gmailAuthUrl?.error || "Google OAuth not configured");
                        }
                      }}>
                        <Mail className="w-4 h-4 mr-2" />
                        Connect Gmail
                      </Button>
                    </div>

                    <div className="p-4 bg-muted/50 border rounded-lg">
                      <h4 className="font-medium text-foreground mb-2">
                        What you can do with Gmail integration:
                      </h4>
                      <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                        <li>Send emails directly from the ERP system</li>
                        <li>Create draft emails</li>
                        <li>View and search your email messages</li>
                        <li>Reply to emails with threading support</li>
                        <li>Automate email workflows</li>
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="p-4 border rounded-lg">
                        <h4 className="font-medium mb-2">Account Info</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Email:</span>
                            <span className="font-medium">{status.gmail.email}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Status:</span>
                            <Badge className="bg-primary/10 text-primary border-primary/20">Active</Badge>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 border rounded-lg">
                        <h4 className="font-medium mb-2">Quick Actions</h4>
                        <div className="space-y-2">
                          <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setShowComposeDraft(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            Compose Draft
                          </Button>
                          <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => window.open("https://mail.google.com/mail/?view=cm&fs=1", "_blank", "noopener,noreferrer")}>
                            <Mail className="w-4 h-4 mr-2" />
                            Compose Email
                          </Button>
                          <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => window.open("https://mail.google.com/", "_blank", "noopener,noreferrer")}>
                            <ExternalLink className="w-4 h-4 mr-2" />
                            View in Gmail
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Recent messages peek */}
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">Recent Messages</h4>
                          {(gmailConn as any)?.connected ? (
                            <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <AlertCircle className="w-3 h-3 mr-1" /> Offline
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => refetchGmailMessages()}
                          disabled={gmailMessagesLoading}
                        >
                          <RefreshCw className={`w-4 h-4 ${gmailMessagesLoading ? "animate-spin" : ""}`} />
                        </Button>
                      </div>
                      {gmailMessagesLoading ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : ((gmailMessages as any)?.messages?.length ?? 0) > 0 ? (
                        <div className="divide-y">
                          {((gmailMessages as any).messages as any[]).map((m: any) => (
                            <div key={m.id} className="flex items-center justify-between py-2 gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm truncate">{m.snippet || m.subject || m.id}</p>
                                {m.threadId && (
                                  <p className="text-xs text-muted-foreground truncate">Thread {m.threadId}</p>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="shrink-0 h-7 px-2 text-xs"
                                onClick={() => {
                                  setReplyBody("");
                                  setSelectedMessageId(m.id);
                                }}
                              >
                                View
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground py-2">No recent messages found</p>
                      )}
                    </div>

                    <div className="p-4 bg-muted/50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">Disconnect Gmail</h4>
                          <p className="text-sm text-muted-foreground">
                            Remove Gmail integration from your account
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => gmailDisconnectMutation.mutate()}
                          disabled={gmailDisconnectMutation.isPending}
                        >
                          {gmailDisconnectMutation.isPending ? "Disconnecting…" : "Disconnect"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Compose draft dialog */}
            <Dialog open={showComposeDraft} onOpenChange={setShowComposeDraft}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Compose Draft</DialogTitle>
                  <DialogDescription>Save a draft email to your Gmail account</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="draftTo">To</Label>
                    <Input
                      id="draftTo"
                      placeholder="recipient@example.com"
                      value={draftTo}
                      onChange={(e) => setDraftTo(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="draftSubject">Subject</Label>
                    <Input
                      id="draftSubject"
                      placeholder="Subject"
                      value={draftSubject}
                      onChange={(e) => setDraftSubject(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="draftBody">Body</Label>
                    <textarea
                      id="draftBody"
                      className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Write your message…"
                      value={draftBody}
                      onChange={(e) => setDraftBody(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowComposeDraft(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() =>
                      createDraftMutation.mutate({
                        to: draftTo,
                        subject: draftSubject,
                        body: draftBody,
                      })
                    }
                    disabled={createDraftMutation.isPending || !draftTo.trim() || !draftSubject.trim()}
                  >
                    {createDraftMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    Save Draft
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Message viewer + reply dialog */}
            <Dialog open={!!selectedMessageId} onOpenChange={(open) => { if (!open) setSelectedMessageId(null); }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="truncate">
                    {getGmailHeader("Subject") || "Message"}
                  </DialogTitle>
                  <DialogDescription className="truncate">
                    {getGmailHeader("From")}
                  </DialogDescription>
                </DialogHeader>
                {gmailMessageLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-4 py-2">
                    <div className="p-3 bg-muted/50 rounded-lg text-sm max-h-48 overflow-y-auto whitespace-pre-wrap">
                      {gmailMsg?.snippet || "(no preview available)"}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="replyBody">Reply</Label>
                      <textarea
                        id="replyBody"
                        className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        placeholder="Write a reply…"
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                      />
                    </div>
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setSelectedMessageId(null)}>
                    Close
                  </Button>
                  <Button
                    onClick={() =>
                      replyToMessageMutation.mutate({
                        threadId: gmailMsg?.threadId ?? "",
                        messageId: gmailMsg?.id ?? selectedMessageId ?? "",
                        to: getGmailHeader("From"),
                        subject: getGmailHeader("Subject").startsWith("Re:")
                          ? getGmailHeader("Subject")
                          : `Re: ${getGmailHeader("Subject")}`,
                        body: replyBody,
                      })
                    }
                    disabled={
                      replyToMessageMutation.isPending ||
                      !replyBody.trim() ||
                      !gmailMsg?.threadId ||
                      !getGmailHeader("From")
                    }
                  >
                    {replyToMessageMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Mail className="w-4 h-4 mr-2" />
                    )}
                    Send Reply
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Google Workspace Tab */}
          <TabsContent value="workspace" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Google Workspace Integration</CardTitle>
                <CardDescription>
                  Create and manage Google Docs, Sheets, and other Workspace files
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                  <div className={`p-3 rounded-full ${status?.googleWorkspace?.configured ? 'bg-primary/10' : 'bg-muted'}`}>
                    {status?.googleWorkspace?.configured ? (
                      <CheckCircle2 className="w-6 h-6 text-primary" />
                    ) : (
                      <AlertCircle className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium">
                      {status?.googleWorkspace?.configured ? 'Google Workspace Connected' : 'Google Workspace Not Connected'}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {status?.googleWorkspace?.configured
                        ? `Connected as ${status.googleWorkspace.email}`
                        : 'Connect your Google account to create and manage Workspace files'}
                    </p>
                  </div>
                </div>

                <div className="p-4 border rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 p-2 rounded-full ${status?.googleDriveServiceAccount?.configured ? 'bg-primary/10' : 'bg-muted'}`}>
                      {status?.googleDriveServiceAccount?.configured ? (
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm">Drive Service Account (optional fallback)</h4>
                      {status?.googleDriveServiceAccount?.configured ? (
                        <>
                          <p className="text-sm text-muted-foreground mt-1">
                            Configured. Share private folders with the address below so the server can read them
                            without making the folder public, even if the connected Google account above loses access.
                          </p>
                          <code className="mt-2 inline-block text-xs px-2 py-1 rounded bg-muted break-all">
                            {status.googleDriveServiceAccount.email}
                          </code>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-1">
                          Not configured. Set either <code className="text-xs">GOOGLE_SERVICE_ACCOUNT_JSON</code> or both{" "}
                          <code className="text-xs">GOOGLE_SERVICE_ACCOUNT_EMAIL</code> and{" "}
                          <code className="text-xs">GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY</code> in the server environment
                          to let the app read private Drive folders without relying on a user OAuth grant.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {!status?.googleWorkspace?.configured ? (
                  <div className="space-y-4">
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-medium mb-2">Connect Google Workspace</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        Authorize this application to create and manage Google Docs and Sheets.
                      </p>
                      <Button onClick={() => {
                        if (workspaceAuthUrl?.url) {
                          window.location.href = workspaceAuthUrl.url;
                        } else {
                          toast.error(workspaceAuthUrl?.error || "Google OAuth not configured");
                        }
                      }}>
                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                        Connect Google Workspace
                      </Button>
                    </div>

                    <div className="p-4 bg-muted/50 border rounded-lg">
                      <h4 className="font-medium text-foreground mb-2">
                        What you can do with Google Workspace:
                      </h4>
                      <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                        <li>Create Google Docs documents</li>
                        <li>Create Google Sheets spreadsheets</li>
                        <li>Update document and sheet content</li>
                        <li>Share documents with team members</li>
                        <li>Export ERP data to Google Sheets</li>
                        <li>Generate reports as Google Docs</li>
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="p-4 border rounded-lg">
                        <h4 className="font-medium mb-2">Account Info</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Email:</span>
                            <span className="font-medium">{status.googleWorkspace.email}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Status:</span>
                            <Badge className="bg-primary/10 text-primary border-primary/20">Active</Badge>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 border rounded-lg">
                        <h4 className="font-medium mb-2">Quick Actions</h4>
                        <div className="space-y-2">
                          <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setShowNewDoc(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            New Doc
                          </Button>
                          <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setShowNewSheet(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            New Sheet
                          </Button>
                          <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setShowShareFile(true)}>
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Share a File
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Sheet tools: read / append / update values */}
                    <div className="p-4 border rounded-lg space-y-4">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">Sheet Tools</h4>
                        {(workspaceConn as any)?.connected ? (
                          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <AlertCircle className="w-3 h-3 mr-1" /> Offline
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Read, append, or overwrite cells in a spreadsheet by ID. Rows are separated by new lines,
                        columns by commas.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="sheetToolsId">Spreadsheet ID</Label>
                          <Input
                            id="sheetToolsId"
                            placeholder="1AbC…"
                            value={sheetToolsId}
                            onChange={(e) => setSheetToolsId(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="sheetToolsRange">Range</Label>
                          <Input
                            id="sheetToolsRange"
                            placeholder="Sheet1!A1"
                            value={sheetToolsRange}
                            onChange={(e) => setSheetToolsRange(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sheetToolsValues">Values (rows = lines, columns = commas)</Label>
                        <textarea
                          id="sheetToolsValues"
                          className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          placeholder={"Alice,30\nBob,25"}
                          value={sheetToolsValues}
                          onChange={(e) => setSheetToolsValues(e.target.value)}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSheetValuesQuery({ spreadsheetId: sheetToolsId, range: sheetToolsRange })}
                          disabled={!sheetToolsId.trim() || !sheetToolsRange.trim() || sheetValuesFetching}
                        >
                          {sheetValuesFetching ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4 mr-2" />
                          )}
                          Read
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            appendToSheetMutation.mutate({
                              spreadsheetId: sheetToolsId,
                              range: sheetToolsRange,
                              values: parseSheetValues(sheetToolsValues),
                            })
                          }
                          disabled={
                            appendToSheetMutation.isPending ||
                            !sheetToolsId.trim() ||
                            !sheetToolsRange.trim() ||
                            !sheetToolsValues.trim()
                          }
                        >
                          {appendToSheetMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Plus className="w-4 h-4 mr-2" />
                          )}
                          Append
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateSheetValuesMutation.mutate({
                              spreadsheetId: sheetToolsId,
                              range: sheetToolsRange,
                              values: parseSheetValues(sheetToolsValues),
                            })
                          }
                          disabled={
                            updateSheetValuesMutation.isPending ||
                            !sheetToolsId.trim() ||
                            !sheetToolsRange.trim() ||
                            !sheetToolsValues.trim()
                          }
                        >
                          {updateSheetValuesMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <FileSpreadsheet className="w-4 h-4 mr-2" />
                          )}
                          Update
                        </Button>
                      </div>
                      {sheetValuesQuery && (
                        <div className="p-3 bg-muted/50 rounded-lg text-xs font-mono max-h-40 overflow-auto whitespace-pre">
                          {sheetValuesFetching
                            ? "Loading…"
                            : ((sheetValues as any[] | undefined)?.length ?? 0) > 0
                              ? (sheetValues as any[]).map((row: any) => (Array.isArray(row) ? row.join(", ") : String(row))).join("\n")
                              : "(no values in range)"}
                        </div>
                      )}
                    </div>

                    <div className="p-4 bg-muted/50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">Disconnect Google Workspace</h4>
                          <p className="text-sm text-muted-foreground">
                            Remove Google Workspace integration from your account
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => workspaceDisconnectMutation.mutate()}
                          disabled={workspaceDisconnectMutation.isPending}
                        >
                          {workspaceDisconnectMutation.isPending ? "Disconnecting…" : "Disconnect"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* New Doc dialog */}
            <Dialog open={showNewDoc} onOpenChange={setShowNewDoc}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New Google Doc</DialogTitle>
                  <DialogDescription>Create a Google Doc in the connected account</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="docTitle">Title</Label>
                    <Input
                      id="docTitle"
                      placeholder="Untitled document"
                      value={docTitle}
                      onChange={(e) => setDocTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="docContent">Initial content (optional)</Label>
                    <textarea
                      id="docContent"
                      className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Document body…"
                      value={docContent}
                      onChange={(e) => setDocContent(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowNewDoc(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() =>
                      createDocMutation.mutate({
                        title: docTitle,
                        content: docContent || undefined,
                      })
                    }
                    disabled={createDocMutation.isPending || !docTitle.trim()}
                  >
                    {createDocMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    Create Doc
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* New Sheet dialog */}
            <Dialog open={showNewSheet} onOpenChange={setShowNewSheet}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New Google Sheet</DialogTitle>
                  <DialogDescription>Create a Google Sheet in the connected account</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="sheetTitle">Title</Label>
                    <Input
                      id="sheetTitle"
                      placeholder="Untitled spreadsheet"
                      value={sheetTitle}
                      onChange={(e) => setSheetTitle(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowNewSheet(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => createSheetMutation.mutate({ title: sheetTitle })}
                    disabled={createSheetMutation.isPending || !sheetTitle.trim()}
                  >
                    {createSheetMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    Create Sheet
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Share file dialog */}
            <Dialog open={showShareFile} onOpenChange={setShowShareFile}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Share a File</DialogTitle>
                  <DialogDescription>Grant a user access to a Drive file, Doc, or Sheet by ID</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="shareFileId">File ID</Label>
                    <Input
                      id="shareFileId"
                      placeholder="1AbC…"
                      value={shareFileId}
                      onChange={(e) => setShareFileId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shareEmail">Share with (email)</Label>
                    <Input
                      id="shareEmail"
                      type="email"
                      placeholder="teammate@example.com"
                      value={shareEmail}
                      onChange={(e) => setShareEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shareRole">Role</Label>
                    <select
                      id="shareRole"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={shareRole}
                      onChange={(e) => setShareRole(e.target.value as "reader" | "writer" | "commenter")}
                    >
                      <option value="reader">Reader</option>
                      <option value="commenter">Commenter</option>
                      <option value="writer">Writer</option>
                    </select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowShareFile(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() =>
                      shareFileMutation.mutate({
                        fileId: shareFileId,
                        role: shareRole,
                        type: "user",
                        emailAddress: shareEmail,
                        sendNotificationEmail: true,
                      })
                    }
                    disabled={shareFileMutation.isPending || !shareFileId.trim() || !shareEmail.trim()}
                  >
                    {shareFileMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <ExternalLink className="w-4 h-4 mr-2" />
                    )}
                    Share
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* QuickBooks Tab */}
          <TabsContent value="quickbooks" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>QuickBooks Integration</CardTitle>
                <CardDescription>
                  Connect QuickBooks for automatic financial data synchronization
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                  <div className={`p-3 rounded-full ${status?.quickbooks?.configured ? 'bg-primary/10' : 'bg-muted'}`}>
                    {status?.quickbooks?.configured ? (
                      <CheckCircle2 className="w-6 h-6 text-primary" />
                    ) : (
                      <AlertCircle className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium">
                      {status?.quickbooks?.configured ? 'QuickBooks Connected' : 'QuickBooks Not Connected'}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {status?.quickbooks?.configured 
                        ? `Connected to company ${status.quickbooks.realmId}`
                        : 'Connect your QuickBooks account to sync financial data'}
                    </p>
                  </div>
                </div>

                {!status?.quickbooks?.configured ? (
                  <div className="space-y-4">
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-medium mb-2">Connect QuickBooks</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        To enable QuickBooks integration, add the following environment variables in Settings → Secrets:
                      </p>
                      <ul className="text-sm text-muted-foreground space-y-2 mb-4 list-disc list-inside">
                        <li><code className="bg-muted px-2 py-1 rounded">QUICKBOOKS_CLIENT_ID</code> - Your QuickBooks app client ID</li>
                        <li><code className="bg-muted px-2 py-1 rounded">QUICKBOOKS_CLIENT_SECRET</code> - Your QuickBooks app client secret</li>
                        <li><code className="bg-muted px-2 py-1 rounded">QUICKBOOKS_REDIRECT_URI</code> - OAuth callback URL (optional)</li>
                        <li><code className="bg-muted px-2 py-1 rounded">QUICKBOOKS_ENVIRONMENT</code> - sandbox or production (optional, defaults to production)</li>
                      </ul>
                      <div className="mb-4 p-3 bg-muted/50 border rounded-md text-sm">
                        <p className="font-medium text-foreground mb-1">⚠ Use Production credentials</p>
                        <p className="text-muted-foreground">
                          In the Intuit Developer Portal, make sure your app has been promoted to <strong>Production</strong> and that you are using the <strong>production</strong> Client ID and Secret.
                          Development (sandbox) credentials only work with Intuit sandbox companies — real QuickBooks users will see a "no sandbox companies found" error.
                        </p>
                      </div>
                      {quickbooksDebug && (
                        <div className="mb-4 p-3 bg-slate-500/5 border border-slate-500/20 rounded-md text-xs space-y-1.5">
                          <p className="font-medium text-sm">Live server config (admin diagnostic)</p>
                          <p className="text-muted-foreground">
                            What the deployed server has loaded from env right now. Compare the client_id against your Intuit Developer Dashboard → Keys &amp; OAuth → <strong>Production</strong> tab.
                          </p>
                          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono pt-1">
                            <span className="text-muted-foreground">client_id:</span>
                            <span>{quickbooksDebug.clientIdMasked ?? <em className="text-foreground font-semibold">not set</em>} <span className="text-muted-foreground">({quickbooksDebug.clientIdLength} chars)</span></span>
                            <span className="text-muted-foreground">client_secret:</span>
                            <span>{quickbooksDebug.clientSecretSet ? "set" : <em className="text-foreground font-semibold">not set</em>}</span>
                            <span className="text-muted-foreground">environment:</span>
                            <span>{quickbooksDebug.environment}</span>
                            <span className="text-muted-foreground">redirect_uri:</span>
                            <span className="break-all">{quickbooksDebug.redirectUri}</span>
                          </div>
                        </div>
                      )}
                      {quickbooksAuthUrl?.redirectUri && (
                        <div className="mb-4 p-3 bg-muted/50 border rounded-md">
                          <p className="text-sm font-medium mb-1">Register this Redirect URI in Intuit</p>
                          <p className="text-xs text-muted-foreground mb-2">
                            In the Intuit Developer portal, open your app → <strong>Keys &amp; OAuth</strong> → <strong>Redirect URIs</strong>, and add this exact string. Intuit rejects the connection if it doesn't match character-for-character.
                          </p>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 text-xs bg-muted px-2 py-1.5 rounded break-all">
                              {quickbooksAuthUrl.redirectUri}
                            </code>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                const uri = quickbooksAuthUrl.redirectUri;
                                if (!uri || !navigator.clipboard?.writeText) {
                                  toast.error("Clipboard copy is not supported in this browser");
                                  return;
                                }
                                try {
                                  await navigator.clipboard.writeText(uri);
                                  toast.success("Redirect URI copied");
                                } catch {
                                  toast.error("Failed to copy Redirect URI");
                                }
                              }}
                            >
                              Copy
                            </Button>
                          </div>
                        </div>
                      )}
                      <Button
                        onClick={() => {
                          if (quickbooksAuthUrl?.url) {
                            window.location.href = quickbooksAuthUrl.url;
                          } else {
                            toast.error(quickbooksAuthUrl?.error || "QuickBooks OAuth not configured");
                          }
                        }}
                      >
                        <Calculator className="w-4 h-4 mr-2" />
                        Connect QuickBooks
                      </Button>
                    </div>

                    <div className="p-4 bg-muted/50 border rounded-lg">
                      <h4 className="font-medium text-foreground mb-2">
                        What you can do with QuickBooks:
                      </h4>
                      <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                        <li>Sync customers and vendors automatically</li>
                        <li>Create and manage invoices</li>
                        <li>Track payments and transactions</li>
                        <li>Sync chart of accounts</li>
                        <li>Generate financial reports</li>
                        <li>Reconcile inventory and purchases</li>
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="p-4 border rounded-lg">
                        <h4 className="font-medium mb-2">Connection Info</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Company ID:</span>
                            <span className="font-medium">{status.quickbooks.realmId}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Status:</span>
                            <Badge className="bg-primary/10 text-primary border-primary/20">Active</Badge>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 border rounded-lg">
                        <h4 className="font-medium mb-2">Quick Actions</h4>
                        <div className="space-y-2">
                          <Button variant="outline" size="sm" className="w-full justify-start" disabled>
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Sync Customers
                          </Button>
                          <Button variant="outline" size="sm" className="w-full justify-start" disabled>
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Sync Invoices
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Sync features coming soon
                        </p>
                      </div>
                    </div>

                    <div className="p-4 bg-muted/50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">Disconnect QuickBooks</h4>
                          <p className="text-sm text-muted-foreground">
                            Remove QuickBooks integration from your account
                          </p>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => quickbooksDisconnectMutation.mutate()}
                        >
                          Disconnect
                        </Button>
                      </div>
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
