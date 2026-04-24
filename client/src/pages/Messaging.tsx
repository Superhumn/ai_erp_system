import { useState, useRef, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  MessageSquare,
  Search,
  Send,
  Loader2,
  Phone,
  Mail,
  Building2,
  User,
  MessageCircle,
  Clock,
  CheckCheck,
  Check,
  ExternalLink,
  Wifi,
  WifiOff,
  Hash,
  ArrowRight,
  Smartphone,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

type ChannelTab = "all" | "whatsapp" | "gchat";

function channelIcon(channel?: string) {
  switch (channel) {
    case "whatsapp":
      return <MessageCircle className="h-3.5 w-3.5 text-green-600" />;
    case "email":
      return <Mail className="h-3.5 w-3.5 text-blue-500" />;
    case "phone":
      return <Phone className="h-3.5 w-3.5 text-orange-500" />;
    default:
      return <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function channelBadge(channel?: string) {
  const variants: Record<string, { label: string; className: string }> = {
    whatsapp: { label: "WhatsApp", className: "bg-green-100 text-green-700 border-green-200" },
    email: { label: "Email", className: "bg-blue-100 text-blue-700 border-blue-200" },
    phone: { label: "Phone", className: "bg-orange-100 text-orange-700 border-orange-200" },
    sms: { label: "SMS", className: "bg-purple-100 text-purple-700 border-purple-200" },
  };
  const v = variants[channel || ""] || { label: channel || "Unknown", className: "" };
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${v.className}`}>
      {v.label}
    </Badge>
  );
}

function messageStatusIcon(status?: string) {
  switch (status) {
    case "read":
      return <CheckCheck className="h-3 w-3 text-blue-500" />;
    case "delivered":
      return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    case "sent":
      return <Check className="h-3 w-3 text-muted-foreground" />;
    case "failed":
      return <span className="text-[10px] text-destructive">Failed</span>;
    default:
      return <Clock className="h-3 w-3 text-muted-foreground" />;
  }
}

function truncate(text: string, maxLen: number) {
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
}

export default function Messaging() {
  const [search, setSearch] = useState("");
  const [channelTab, setChannelTab] = useState<ChannelTab>("all");
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [messageText, setMessageText] = useState("");
  const [showGchatIframe, setShowGchatIframe] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch contacts
  const { data: contactsRaw, isLoading: contactsLoading } = trpc.crm.contacts.list.useQuery({});
  const contacts = (contactsRaw as any[] | undefined) || [];

  // Fetch WhatsApp conversations for last-message previews
  const { data: conversationsRaw } = trpc.crm.whatsapp.conversations.useQuery({});
  const conversations = (conversationsRaw as any[] | undefined) || [];

  // Build a map of contactId -> last WhatsApp message
  const lastMessageMap = useMemo(() => {
    const map = new Map<number, any>();
    for (const conv of conversations) {
      if (conv.contactId && !map.has(conv.contactId)) {
        map.set(conv.contactId, conv);
      }
    }
    return map;
  }, [conversations]);

  // Fetch messages for the selected contact
  const { data: messagesRaw, isLoading: messagesLoading, refetch: refetchMessages } =
    trpc.crm.contacts.getMessagingHistory.useQuery(
      { contactId: selectedContactId! },
      { enabled: !!selectedContactId }
    );
  const messages = (messagesRaw as any[] | undefined) || [];

  // Send message mutation
  const sendMutation = trpc.crm.whatsapp.sendMessage.useMutation({
    onSuccess: () => {
      toast.success("Message sent");
      setMessageText("");
      refetchMessages();
    },
    onError: (err) => toast.error(err.message),
  });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectedContact = contacts.find((c: any) => c.id === selectedContactId);

  // Filter contacts by search and channel tab
  const filteredContacts = useMemo(() => {
    let list = contacts;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c: any) => {
        const name = (c.fullName || c.firstName || "").toLowerCase();
        const org = (c.organization || "").toLowerCase();
        const email = (c.email || "").toLowerCase();
        const phone = (c.phone || c.whatsappNumber || "").toLowerCase();
        return name.includes(q) || org.includes(q) || email.includes(q) || phone.includes(q);
      });
    }

    if (channelTab === "whatsapp") {
      list = list.filter((c: any) => c.whatsappNumber || c.preferredChannel === "whatsapp");
    }

    // Sort: contacts with recent messages first
    list = [...list].sort((a: any, b: any) => {
      const aMsg = lastMessageMap.get(a.id);
      const bMsg = lastMessageMap.get(b.id);
      if (aMsg && !bMsg) return -1;
      if (!aMsg && bMsg) return 1;
      if (aMsg && bMsg) {
        return new Date(bMsg.createdAt).getTime() - new Date(aMsg.createdAt).getTime();
      }
      return (a.fullName || "").localeCompare(b.fullName || "");
    });

    return list;
  }, [contacts, search, channelTab, lastMessageMap]);

  function handleSendMessage() {
    if (!messageText.trim() || !selectedContact) return;

    const waNumber = selectedContact.whatsappNumber || selectedContact.phone;
    if (!waNumber) {
      toast.error("No WhatsApp number found for this contact");
      return;
    }

    sendMutation.mutate({
      contactId: selectedContact.id,
      whatsappNumber: waNumber,
      contactName: selectedContact.fullName,
      content: messageText.trim(),
      messageType: "text",
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  function formatMessageTime(dateStr: string) {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
      if (diffDays === 0) return format(d, "h:mm a");
      if (diffDays === 1) return "Yesterday " + format(d, "h:mm a");
      if (diffDays < 7) return format(d, "EEE h:mm a");
      return format(d, "MMM d, h:mm a");
    } catch {
      return "";
    }
  }

  function formatPreviewTime(dateStr: string) {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
    } catch {
      return "";
    }
  }

  // ----- Render -----

  return (
    <div className="animate-fade-in space-y-2">
      {/* Header — single consolidated row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-sm font-bold tracking-[-0.02em]">Messaging</h1>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5">
            <Wifi className="h-3 w-3 text-green-500" />
            WhatsApp Connected
          </Badge>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex gap-0 border rounded-lg overflow-hidden bg-background" style={{ height: "calc(100vh - 180px)" }}>
        {/* Left Panel - Contact List */}
        <div className="w-80 border-r flex flex-col shrink-0">
          {/* Search */}
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>

          {/* Channel Tabs */}
          <div className="px-3 pt-2">
            <Tabs value={channelTab} onValueChange={(v) => setChannelTab(v as ChannelTab)}>
              <TabsList className="w-full">
                <TabsTrigger value="all" className="flex-1 text-xs">All</TabsTrigger>
                <TabsTrigger value="whatsapp" className="flex-1 text-xs">
                  <MessageCircle className="h-3 w-3 mr-1" />
                  WhatsApp
                </TabsTrigger>
                <TabsTrigger value="gchat" className="flex-1 text-xs">
                  <Hash className="h-3 w-3 mr-1" />
                  Google Chat
                </TabsTrigger>
              </TabsList>

              {/* All & WhatsApp contact lists */}
              <TabsContent value="all" className="mt-0">
                <ContactList />
              </TabsContent>
              <TabsContent value="whatsapp" className="mt-0">
                <ContactList />
              </TabsContent>
              <TabsContent value="gchat" className="mt-0">
                <GoogleChatPlaceholder />
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Right Panel - Conversation */}
        <div className="flex-1 flex flex-col min-w-0">
          {channelTab === "gchat" ? (
            <GoogleChatPanel />
          ) : selectedContactId && selectedContact ? (
            <>
              {/* Conversation Header */}
              <div className="px-4 py-3 border-b flex items-center justify-between bg-muted/30">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {selectedContact.fullName || selectedContact.firstName}
                      </span>
                      {channelBadge(selectedContact.preferredChannel || "whatsapp")}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {selectedContact.organization && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {selectedContact.organization}
                        </span>
                      )}
                      {selectedContact.whatsappNumber && (
                        <span className="flex items-center gap-1">
                          <Smartphone className="h-3 w-3" />
                          {selectedContact.whatsappNumber}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Messages Area */}
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-3">
                  {messagesLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <MessageSquare className="h-10 w-10 mb-3 opacity-40" />
                      <p className="text-sm font-medium">No messages yet</p>
                      <p className="text-xs mt-1">Send a message to start the conversation</p>
                    </div>
                  ) : (
                    messages.map((msg: any, idx: number) => {
                      const isOutbound = msg.direction === "outbound" || msg.direction === "sent";
                      return (
                        <div
                          key={msg.id || idx}
                          className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[70%] rounded-lg px-3 py-2 ${
                              isOutbound
                                ? "bg-primary text-primary-foreground rounded-br-sm"
                                : "bg-muted rounded-bl-sm"
                            }`}
                          >
                            {msg.channel && msg.channel !== "whatsapp" && (
                              <div className="flex items-center gap-1 mb-1">
                                {channelIcon(msg.channel)}
                                <span className="text-[10px] opacity-70 uppercase">
                                  {msg.channel}
                                </span>
                              </div>
                            )}
                            {msg.subject && (
                              <p className={`text-xs font-medium mb-1 ${isOutbound ? "text-primary-foreground/80" : "text-foreground/70"}`}>
                                {msg.subject}
                              </p>
                            )}
                            <p className="text-sm whitespace-pre-wrap break-words">
                              {msg.content || msg.body || msg.summary || ""}
                            </p>
                            <div className={`flex items-center gap-1 mt-1 ${isOutbound ? "justify-end" : "justify-start"}`}>
                              <span className={`text-[10px] ${isOutbound ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                                {formatMessageTime(msg.sentAt || msg.createdAt || msg.timestamp)}
                              </span>
                              {isOutbound && messageStatusIcon(msg.status)}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Message Input */}
              <div className="p-3 border-t bg-muted/20">
                <div className="flex gap-2 items-end">
                  <Textarea
                    placeholder="Type a message..."
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="min-h-[40px] max-h-[120px] resize-none text-sm"
                    rows={1}
                  />
                  <Button
                    size="icon"
                    onClick={handleSendMessage}
                    disabled={!messageText.trim() || sendMutation.isPending}
                    className="shrink-0 h-10 w-10"
                  >
                    {sendMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Press Enter to send, Shift+Enter for new line
                </p>
              </div>
            </>
          ) : (
            /* Empty State */
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mb-4 opacity-30" />
              <p className="text-sm font-medium">Select a conversation</p>
              <p className="text-xs mt-1">Choose a contact from the left to view messages</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ----- Inline sub-components -----

  function ContactList() {
    if (contactsLoading) {
      return (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (filteredContacts.length === 0) {
      return (
        <div className="text-center py-10 text-muted-foreground text-sm">
          <User className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p>No contacts found</p>
        </div>
      );
    }

    return (
      <ScrollArea className="h-[calc(100vh-320px)]">
        <div className="py-1">
          {filteredContacts.map((contact: any) => {
            const lastMsg = lastMessageMap.get(contact.id);
            const isActive = contact.id === selectedContactId;
            const channel = contact.preferredChannel || (contact.whatsappNumber ? "whatsapp" : "email");

            return (
              <button
                key={contact.id}
                onClick={() => setSelectedContactId(contact.id)}
                className={`w-full text-left px-3 py-2.5 flex items-start gap-3 transition-colors hover:bg-accent/50 ${
                  isActive ? "bg-accent" : ""
                }`}
              >
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-medium truncate">
                      {contact.fullName || contact.firstName || "Unknown"}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      {channelIcon(channel)}
                    </span>
                  </div>
                  {contact.organization && (
                    <p className="text-[11px] text-muted-foreground truncate">
                      {contact.organization}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <p className="text-xs text-muted-foreground truncate flex-1">
                      {lastMsg
                        ? truncate(lastMsg.content || lastMsg.body || "", 40)
                        : contact.email || contact.whatsappNumber || "No messages"}
                    </p>
                    {lastMsg && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatPreviewTime(lastMsg.createdAt || lastMsg.sentAt)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    );
  }

  function GoogleChatPlaceholder() {
    return (
      <div className="py-6 px-2">
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-6 text-center">
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center mb-3">
              <Hash className="h-5 w-5 text-blue-600" />
            </div>
            <p className="text-sm font-medium">Google Chat</p>
            <p className="text-xs text-muted-foreground mt-1">
              Connect your Google Workspace to see chats here
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 text-xs"
              onClick={() => setShowGchatIframe(true)}
            >
              <ExternalLink className="h-3 w-3 mr-1.5" />
              Open Google Chat
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  function GoogleChatPanel() {
    return (
      <div className="flex-1 flex flex-col">
        {showGchatIframe ? (
          <>
            <div className="px-4 py-3 border-b flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium">Google Chat</span>
                <Badge variant="outline" className="text-[10px] bg-yellow-50 text-yellow-700 border-yellow-200">
                  Embedded Preview
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => window.open("https://chat.google.com", "_blank")}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Open in New Tab
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setShowGchatIframe(false)}
                >
                  Close
                </Button>
              </div>
            </div>
            <div className="flex-1 relative">
              <iframe
                src="https://chat.google.com"
                className="absolute inset-0 w-full h-full border-0"
                title="Google Chat"
                sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground px-6">
            <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
              <Hash className="h-8 w-8 text-blue-400" />
            </div>
            <h3 className="text-base font-medium text-foreground mb-1">Connect Google Chat</h3>
            <p className="text-sm text-center max-w-sm mb-4">
              Google Chat API integration is not yet configured. You can embed Google Chat
              directly or wait for the API connector to be set up.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowGchatIframe(true)}
              >
                <Hash className="h-3.5 w-3.5 mr-1.5" />
                Open Embedded Chat
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open("https://chat.google.com", "_blank")}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Open in Browser
              </Button>
            </div>
            <Card className="mt-6 w-full max-w-md border-dashed">
              <CardContent className="py-4 px-4">
                <p className="text-xs font-medium text-foreground mb-2">To connect via API:</p>
                <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                  <li>Enable Google Chat API in Google Cloud Console</li>
                  <li>Create OAuth credentials for Google Workspace</li>
                  <li>Add credentials in Settings <ArrowRight className="h-3 w-3 inline mx-0.5" /> Integrations</li>
                  <li>Authorize the Google Chat scope for your account</li>
                </ol>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    );
  }
}
