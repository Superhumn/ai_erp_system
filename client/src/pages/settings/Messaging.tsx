import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  MessageSquare,
  Phone,
  Send,
  TestTube,
  History,
  Settings,
  Loader2,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Smartphone,
  MessageCircle,
  Bot,
} from "lucide-react";

const CHANNEL_INFO = {
  sms: {
    label: "SMS",
    icon: Phone,
    description: "Send and receive text messages via Twilio",
    color: "bg-blue-100 text-blue-800",
  },
  whatsapp: {
    label: "WhatsApp",
    icon: MessageCircle,
    description: "WhatsApp Business messaging via Twilio",
    color: "bg-green-100 text-green-800",
  },
  google_chat: {
    label: "Google Chat",
    icon: Bot,
    description: "Google Workspace Chat bot integration",
    color: "bg-yellow-100 text-yellow-800",
  },
};

export default function MessagingPage() {
  const [activeTab, setActiveTab] = useState("channels");

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="h-6 w-6" />
          Natural Language Messaging
        </h1>
        <p className="text-muted-foreground mt-1">
          Send text messages, WhatsApp messages, or Google Chat messages to your ERP system in plain English.
          The AI interprets your commands and executes them automatically.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="channels">
            <Settings className="h-4 w-4 mr-1" /> Channels
          </TabsTrigger>
          <TabsTrigger value="identities">
            <Smartphone className="h-4 w-4 mr-1" /> Identities
          </TabsTrigger>
          <TabsTrigger value="test">
            <TestTube className="h-4 w-4 mr-1" /> Test
          </TabsTrigger>
          <TabsTrigger value="logs">
            <History className="h-4 w-4 mr-1" /> Message Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="channels">
          <ChannelsTab />
        </TabsContent>
        <TabsContent value="identities">
          <IdentitiesTab />
        </TabsContent>
        <TabsContent value="test">
          <TestTab />
        </TabsContent>
        <TabsContent value="logs">
          <LogsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================
// CHANNELS TAB
// ============================================

function ChannelsTab() {
  const { data: channels, isLoading, refetch } = trpc.messaging.getChannels.useQuery();
  const upsertChannel = trpc.messaging.upsertChannel.useMutation({
    onSuccess: () => {
      toast.success("Channel updated");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleChannel = (channel: "sms" | "whatsapp" | "google_chat", currentlyEnabled: boolean) => {
    upsertChannel.mutate({ channel, isEnabled: !currentlyEnabled });
  };

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Messaging Channels</CardTitle>
          <CardDescription>
            Enable channels to receive natural language commands via SMS, WhatsApp, or Google Chat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {(["sms", "whatsapp", "google_chat"] as const).map((channelKey) => {
                const info = CHANNEL_INFO[channelKey];
                const Icon = info.icon;
                const existing = channels?.find((c: any) => c.channel === channelKey);
                const isEnabled = existing?.isEnabled ?? false;

                return (
                  <div key={channelKey} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${info.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-medium">{info.label}</div>
                        <div className="text-sm text-muted-foreground">{info.description}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={isEnabled ? "default" : "secondary"}>
                        {isEnabled ? "Active" : "Inactive"}
                      </Badge>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={() => toggleChannel(channelKey, isEnabled)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Setup Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Phone className="h-4 w-4" /> SMS Setup (Twilio)
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>Set <code className="bg-muted px-1 rounded">TWILIO_ACCOUNT_SID</code>, <code className="bg-muted px-1 rounded">TWILIO_AUTH_TOKEN</code>, and <code className="bg-muted px-1 rounded">TWILIO_PHONE_NUMBER</code> in your environment</li>
              <li>In Twilio Console, go to your phone number settings</li>
              <li>Set "A Message Comes In" webhook to: <code className="bg-muted px-1 rounded">https://yourdomain.com/webhooks/messaging/sms</code></li>
              <li>Register your phone number in the Identities tab below</li>
            </ol>
          </div>

          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <MessageCircle className="h-4 w-4" /> WhatsApp Setup (Twilio)
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>Set <code className="bg-muted px-1 rounded">TWILIO_WHATSAPP_NUMBER</code> (e.g., <code className="bg-muted px-1 rounded">whatsapp:+14155238886</code>)</li>
              <li>In Twilio Console, configure WhatsApp Sandbox or Business Number</li>
              <li>Set webhook to: <code className="bg-muted px-1 rounded">https://yourdomain.com/webhooks/messaging/whatsapp</code></li>
              <li>Register your WhatsApp number in the Identities tab</li>
            </ol>
          </div>

          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Bot className="h-4 w-4" /> Google Chat Setup
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>Create a Google Chat Bot in the Google Cloud Console</li>
              <li>Set the bot URL to: <code className="bg-muted px-1 rounded">https://yourdomain.com/webhooks/messaging/google-chat</code></li>
              <li>Set <code className="bg-muted px-1 rounded">GOOGLE_CHAT_WEBHOOK_TOKEN</code> for verification</li>
              <li>Add the bot to your Google Workspace Chat spaces</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Example Commands</CardTitle>
          <CardDescription>Send these as text/WhatsApp/Chat messages to interact with your ERP</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { category: "Inventory", example: "What's the stock level for SKU-123?" },
              { category: "Orders", example: "Show me today's pending orders" },
              { category: "PO Creation", example: "Order 500kg flour from Vendor ABC by Friday" },
              { category: "Invoices", example: "What invoices are overdue?" },
              { category: "Payments", example: "Record $5000 payment from Acme Corp" },
              { category: "Production", example: "Create work order for 200 units of Widget A" },
              { category: "Shipments", example: "Track shipment FedEx #123456789" },
              { category: "Reports", example: "What's our revenue this month?" },
            ].map(({ category, example }) => (
              <div key={category} className="p-3 bg-muted/50 rounded-lg">
                <div className="text-xs font-semibold text-muted-foreground mb-1">{category}</div>
                <div className="text-sm italic">"{example}"</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// IDENTITIES TAB
// ============================================

function IdentitiesTab() {
  const [newChannel, setNewChannel] = useState<"sms" | "whatsapp" | "google_chat">("sms");
  const [newIdentifier, setNewIdentifier] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");

  const { data: identities, isLoading, refetch } = trpc.messaging.getIdentities.useQuery();
  const registerIdentity = trpc.messaging.registerIdentity.useMutation({
    onSuccess: () => {
      toast.success("Identity registered");
      setNewIdentifier("");
      setNewDisplayName("");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteIdentity = trpc.messaging.deleteIdentity.useMutation({
    onSuccess: () => {
      toast.success("Identity removed");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Registered Identities</CardTitle>
          <CardDescription>
            Link your phone number or chat ID to your ERP user account so the system recognizes you when you message.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 mb-4">
            <select
              value={newChannel}
              onChange={(e) => setNewChannel(e.target.value as any)}
              className="border rounded-md px-3 py-2 text-sm"
            >
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="google_chat">Google Chat</option>
            </select>
            <Input
              placeholder={newChannel === "google_chat" ? "users/123456" : "+1234567890"}
              value={newIdentifier}
              onChange={(e) => setNewIdentifier(e.target.value)}
              className="max-w-xs"
            />
            <Input
              placeholder="Display name (optional)"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              className="max-w-xs"
            />
            <Button
              onClick={() =>
                registerIdentity.mutate({
                  channel: newChannel,
                  identifier: newIdentifier,
                  displayName: newDisplayName || undefined,
                })
              }
              disabled={!newIdentifier || registerIdentity.isPending}
            >
              <Plus className="h-4 w-4 mr-1" />
              Register
            </Button>
          </div>

          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead>Identifier</TableHead>
                  <TableHead>Display Name</TableHead>
                  <TableHead>Verified</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {identities && identities.length > 0 ? (
                  identities.map((identity: any) => {
                    const info = CHANNEL_INFO[identity.channel as keyof typeof CHANNEL_INFO];
                    return (
                      <TableRow key={identity.id}>
                        <TableCell>
                          <Badge className={info?.color}>{info?.label || identity.channel}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{identity.identifier}</TableCell>
                        <TableCell>{identity.displayName || "-"}</TableCell>
                        <TableCell>
                          {identity.isVerified ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-yellow-500" />
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteIdentity.mutate({ id: identity.id })}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No identities registered. Add your phone number or chat ID above.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// TEST TAB
// ============================================

function TestTab() {
  const [testMessage, setTestMessage] = useState("");
  const [testChannel, setTestChannel] = useState<"sms" | "whatsapp" | "google_chat">("sms");
  const [interpretation, setInterpretation] = useState<any>(null);
  const [processResult, setProcessResult] = useState<any>(null);

  const interpretMutation = trpc.messaging.interpretMessage.useMutation({
    onSuccess: (data) => {
      setInterpretation(data);
      toast.success("Message interpreted");
    },
    onError: (err) => toast.error(err.message),
  });

  const processMutation = trpc.messaging.testProcess.useMutation({
    onSuccess: (data) => {
      setProcessResult(data);
      toast.success("Message processed");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Test Message Interpretation</CardTitle>
          <CardDescription>
            Test how the AI interprets a natural language message before connecting real channels.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Message</Label>
            <Textarea
              placeholder="Type a message like you would text it... e.g., 'What's our flour inventory?' or 'Order 200 units from Vendor X'"
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex gap-3">
            <select
              value={testChannel}
              onChange={(e) => setTestChannel(e.target.value as any)}
              className="border rounded-md px-3 py-2 text-sm"
            >
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="google_chat">Google Chat</option>
            </select>

            <Button
              onClick={() => interpretMutation.mutate({ message: testMessage })}
              disabled={!testMessage || interpretMutation.isPending}
              variant="outline"
            >
              {interpretMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <TestTube className="h-4 w-4 mr-1" />
              )}
              Interpret Only
            </Button>

            <Button
              onClick={() =>
                processMutation.mutate({
                  channel: testChannel,
                  message: testMessage,
                })
              }
              disabled={!testMessage || processMutation.isPending}
            >
              {processMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Send className="h-4 w-4 mr-1" />
              )}
              Process & Execute
            </Button>
          </div>

          {interpretation && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <h3 className="font-semibold mb-2">Interpretation Result</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Intent:</span>{" "}
                  <Badge variant="outline">{interpretation.intent}</Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Confidence:</span>{" "}
                  <Badge
                    variant={
                      interpretation.confidence > 0.8
                        ? "default"
                        : interpretation.confidence > 0.5
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {(interpretation.confidence * 100).toFixed(0)}%
                  </Badge>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Summary:</span> {interpretation.summary}
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Entities:</span>
                  <pre className="bg-background p-2 rounded mt-1 text-xs overflow-auto">
                    {JSON.stringify(interpretation.entities, null, 2)}
                  </pre>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Suggested Response:</span>
                  <div className="bg-background p-2 rounded mt-1 text-sm whitespace-pre-wrap">
                    {interpretation.suggestedResponse}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Requires Confirmation:</span>{" "}
                  {interpretation.requiresConfirmation ? "Yes" : "No"}
                </div>
              </div>
            </div>
          )}

          {processResult && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <h3 className="font-semibold mb-2">Processing Result</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Status:</span>
                  {processResult.success ? (
                    <Badge className="bg-green-100 text-green-800">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Success
                    </Badge>
                  ) : (
                    <Badge className="bg-red-100 text-red-800">
                      <XCircle className="h-3 w-3 mr-1" /> Failed
                    </Badge>
                  )}
                </div>
                {processResult.agentRunId && (
                  <div>
                    <span className="text-muted-foreground">Agent Run ID:</span> {processResult.agentRunId}
                  </div>
                )}
                {processResult.actionTaken && (
                  <div>
                    <span className="text-muted-foreground">Action:</span> {processResult.actionTaken}
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Response:</span>
                  <div className="bg-background p-2 rounded mt-1 whitespace-pre-wrap">
                    {processResult.response}
                  </div>
                </div>
                {processResult.error && (
                  <div className="text-red-600">
                    <span className="text-muted-foreground">Error:</span> {processResult.error}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// LOGS TAB
// ============================================

function LogsTab() {
  const [channelFilter, setChannelFilter] = useState<string>("");
  const { data: logs, isLoading } = trpc.messaging.getLogs.useQuery(
    channelFilter ? { channel: channelFilter as any } : undefined,
  );
  const { data: stats } = trpc.messaging.getStats.useQuery();

  return (
    <div className="space-y-4 mt-4">
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-sm text-muted-foreground">Total Messages</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-600">{stats.successful}</div>
              <div className="text-sm text-muted-foreground">Successful</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
              <div className="text-sm text-muted-foreground">Failed</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Message Logs</CardTitle>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="border rounded-md px-3 py-2 text-sm"
            >
              <option value="">All Channels</option>
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="google_chat">Google Chat</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
          ) : logs && logs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Intent</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log: any) => {
                  const info = CHANNEL_INFO[log.channel as keyof typeof CHANNEL_INFO];
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge className={info?.color} variant="outline">
                          {info?.label || log.channel}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[120px] truncate">
                        {log.senderIdentifier}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">
                        {log.rawMessage}
                      </TableCell>
                      <TableCell>
                        {log.interpretedIntent ? (
                          <Badge variant="outline">{log.interpretedIntent}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {log.actionSuccess === true ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : log.actionSuccess === false ? (
                          <XCircle className="h-4 w-4 text-red-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-yellow-500" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              No messages logged yet. Send a test message or connect a channel to get started.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
