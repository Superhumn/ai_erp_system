import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  BarChart3,
  Activity,
  Waves,
  Target,
  Cable,
  Code2,
  Plus,
  Settings,
  Unplug,
  RefreshCw,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

type Provider = "google_analytics" | "mixpanel" | "amplitude" | "posthog" | "segment" | "custom";

interface ProviderInfo {
  id: Provider;
  name: string;
  description: string;
  icon: React.ReactNode;
}

const PROVIDERS: ProviderInfo[] = [
  {
    id: "google_analytics",
    name: "Google Analytics",
    description: "Track website traffic, user behavior, and conversion metrics",
    icon: <BarChart3 className="size-8 text-blue-600" />,
  },
  {
    id: "mixpanel",
    name: "Mixpanel",
    description: "Product analytics for tracking user interactions and funnels",
    icon: <Activity className="size-8 text-purple-600" />,
  },
  {
    id: "amplitude",
    name: "Amplitude",
    description: "Behavioral analytics for understanding user journeys",
    icon: <Waves className="size-8 text-indigo-600" />,
  },
  {
    id: "posthog",
    name: "PostHog",
    description: "Open-source product analytics with feature flags and session replay",
    icon: <Target className="size-8 text-orange-600" />,
  },
  {
    id: "segment",
    name: "Segment",
    description: "Customer data platform for collecting and routing analytics data",
    icon: <Cable className="size-8 text-emerald-600" />,
  },
  {
    id: "custom",
    name: "Custom",
    description: "Connect a custom analytics provider via API",
    icon: <Code2 className="size-8 text-gray-600" />,
  },
];

interface ConnectionFormData {
  provider: Provider | "";
  name: string;
  apiKey: string;
  projectId: string;
  propertyId: string;
  config: string;
}

const INITIAL_FORM_DATA: ConnectionFormData = {
  provider: "",
  name: "",
  apiKey: "",
  projectId: "",
  propertyId: "",
  config: "",
};

export default function Analytics() {
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [formData, setFormData] = useState<ConnectionFormData>(INITIAL_FORM_DATA);

  const utils = trpc.useUtils();

  const { data: connections, isLoading: connectionsLoading } =
    trpc.analytics.connections.list.useQuery();

  const { data: metrics, isLoading: metricsLoading } =
    trpc.analytics.metrics.list.useQuery(
      { connectionId: undefined as any, metricType: undefined as any, period: "30d", limit: 20 },
    );

  const createConnection = trpc.analytics.connections.create.useMutation({
    onSuccess: () => {
      toast.success("Analytics connection created successfully");
      utils.analytics.connections.list.invalidate();
      resetDialog();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create connection");
    },
  });

  const updateConnection = trpc.analytics.connections.update.useMutation({
    onSuccess: () => {
      toast.success("Connection updated successfully");
      utils.analytics.connections.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update connection");
    },
  });

  const deleteConnection = trpc.analytics.connections.delete.useMutation({
    onSuccess: () => {
      toast.success("Connection disconnected successfully");
      utils.analytics.connections.list.invalidate();
      utils.analytics.metrics.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to disconnect");
    },
  });

  function resetDialog() {
    setConnectDialogOpen(false);
    setSelectedProvider(null);
    setFormData(INITIAL_FORM_DATA);
  }

  function openConnectDialog(provider?: Provider) {
    setFormData({
      ...INITIAL_FORM_DATA,
      provider: provider || "",
      name: provider ? PROVIDERS.find((p) => p.id === provider)?.name || "" : "",
    });
    setSelectedProvider(provider || null);
    setConnectDialogOpen(true);
  }

  function handleCreateConnection() {
    if (!formData.provider) {
      toast.error("Please select a provider");
      return;
    }
    if (!formData.name.trim()) {
      toast.error("Please enter a connection name");
      return;
    }
    if (!formData.apiKey.trim()) {
      toast.error("Please enter an API key");
      return;
    }

    let parsedConfig: Record<string, unknown> | undefined;
    if (formData.config.trim()) {
      try {
        parsedConfig = JSON.parse(formData.config);
      } catch {
        toast.error("Invalid JSON in configuration field");
        return;
      }
    }

    createConnection.mutate({
      provider: formData.provider as Provider,
      name: formData.name.trim(),
      apiKey: formData.apiKey.trim(),
      projectId: formData.projectId.trim() || undefined,
      propertyId: formData.propertyId.trim() || undefined,
      config: parsedConfig,
    });
  }

  function handleDisconnect(connectionId: string) {
    deleteConnection.mutate({ id: connectionId });
  }

  function getConnectedProviders(): Set<string> {
    if (!connections) return new Set();
    return new Set(connections.map((c: any) => c.provider));
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "active":
        return (
          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">
            Active
          </Badge>
        );
      case "disconnected":
        return (
          <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800">
            Disconnected
          </Badge>
        );
      case "error":
        return (
          <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
            Error
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  function formatLastSync(dateStr: string | null | undefined) {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  function formatMetricValue(value: number | string | null | undefined) {
    if (value == null) return "--";
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(num)) return String(value);
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function computeChange(current: number | null | undefined, previous: number | null | undefined) {
    if (current == null || previous == null || previous === 0) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
  }

  const connectedProviders = getConnectedProviders();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics Integrations</h1>
        <p className="text-muted-foreground mt-1">
          Connect your analytics tools to centralize metrics and gain unified insights across all
          your data sources.
        </p>
      </div>

      {/* Provider Cards Grid */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Available Providers</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PROVIDERS.map((provider) => {
            const isConnected = connectedProviders.has(provider.id);
            return (
              <Card key={provider.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex size-12 items-center justify-center rounded-lg bg-muted">
                        {provider.icon}
                      </div>
                      <div>
                        <CardTitle className="text-base">{provider.name}</CardTitle>
                      </div>
                    </div>
                  </div>
                  <CardDescription className="mt-2">{provider.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  {isConnected ? (
                    <Button variant="outline" className="w-full" disabled>
                      <span className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-emerald-500" />
                        Connected
                      </span>
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={() => openConnectDialog(provider.id)}
                    >
                      <Plus className="size-4 mr-1" />
                      Connect
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Connected Integrations */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Connected Integrations</h2>
          <Button variant="outline" size="sm" onClick={() => openConnectDialog()}>
            <Plus className="size-4 mr-1" />
            Add Connection
          </Button>
        </div>

        {connectionsLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : !connections || connections.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <BarChart3 className="size-12 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground font-medium">No connections yet</p>
              <p className="text-muted-foreground text-sm mt-1">
                Connect an analytics provider above to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {connections.map((connection: any) => {
              const providerInfo = PROVIDERS.find((p) => p.id === connection.provider);
              return (
                <Card key={connection.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-4">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                        {providerInfo?.icon || <Code2 className="size-6 text-gray-600" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{connection.name}</span>
                          {getStatusBadge(connection.status)}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                          <span>{providerInfo?.name || connection.provider}</span>
                          <span className="text-muted-foreground/40">|</span>
                          <span className="flex items-center gap-1">
                            <RefreshCw className="size-3" />
                            Last sync: {formatLastSync(connection.lastSyncAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          updateConnection.mutate({
                            id: connection.id,
                            name: connection.name,
                          });
                        }}
                      >
                        <Settings className="size-4 mr-1" />
                        Configure
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDisconnect(connection.id)}
                        disabled={deleteConnection.isPending}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                      >
                        {deleteConnection.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <>
                            <Unplug className="size-4 mr-1" />
                            Disconnect
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Metrics */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Recent Metrics</h2>
        <Card>
          {metricsLoading ? (
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </CardContent>
          ) : !metrics || metrics.length === 0 ? (
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <TrendingUp className="size-12 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground font-medium">No metrics available</p>
              <p className="text-muted-foreground text-sm mt-1">
                Metrics will appear here once your connected integrations begin syncing data.
              </p>
            </CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Previous</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead>Period</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.map((metric: any, index: number) => {
                  const change = computeChange(metric.value, metric.previousValue);
                  return (
                    <TableRow key={metric.id || index}>
                      <TableCell className="font-medium">{metric.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{metric.type}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatMetricValue(metric.value)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {formatMetricValue(metric.previousValue)}
                      </TableCell>
                      <TableCell className="text-right">
                        {change != null ? (
                          <span
                            className={`inline-flex items-center gap-1 font-mono text-sm ${
                              change > 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : change < 0
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {change > 0 ? (
                              <ArrowUpRight className="size-3.5" />
                            ) : change < 0 ? (
                              <ArrowDownRight className="size-3.5" />
                            ) : (
                              <Minus className="size-3.5" />
                            )}
                            {change > 0 ? "+" : ""}
                            {change.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{metric.period}</span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      {/* Connect Dialog */}
      <Dialog open={connectDialogOpen} onOpenChange={(open) => !open && resetDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect Analytics Provider</DialogTitle>
            <DialogDescription>
              Enter the credentials for your analytics integration. You can find these in your
              provider's dashboard.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="connect-provider">Provider</Label>
              <Select
                value={formData.provider}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    provider: value as Provider,
                    name:
                      prev.name === "" || PROVIDERS.some((p) => p.name === prev.name)
                        ? PROVIDERS.find((p) => p.id === value)?.name || ""
                        : prev.name,
                  }))
                }
              >
                <SelectTrigger id="connect-provider" className="w-full">
                  <SelectValue placeholder="Select a provider" />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="connect-name">Connection Name</Label>
              <Input
                id="connect-name"
                placeholder="e.g. Production GA4"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="connect-api-key">API Key</Label>
              <Input
                id="connect-api-key"
                type="password"
                placeholder="Enter your API key"
                value={formData.apiKey}
                onChange={(e) => setFormData((prev) => ({ ...prev, apiKey: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="connect-project-id">Project ID</Label>
                <Input
                  id="connect-project-id"
                  placeholder="Optional"
                  value={formData.projectId}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, projectId: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="connect-property-id">Property ID</Label>
                <Input
                  id="connect-property-id"
                  placeholder="Optional"
                  value={formData.propertyId}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, propertyId: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="connect-config">Additional Configuration (JSON)</Label>
              <Textarea
                id="connect-config"
                placeholder='{"endpoint": "https://...", "region": "us-east-1"}'
                value={formData.config}
                onChange={(e) => setFormData((prev) => ({ ...prev, config: e.target.value }))}
                className="font-mono text-sm min-h-[80px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetDialog}>
              Cancel
            </Button>
            <Button onClick={handleCreateConnection} disabled={createConnection.isPending}>
              {createConnection.isPending ? (
                <>
                  <Loader2 className="size-4 mr-1 animate-spin" />
                  Connecting...
                </>
              ) : (
                "Connect"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
