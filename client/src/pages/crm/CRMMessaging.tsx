import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MessageSquare, Phone, Mail, Loader2, ArrowLeft,
  Send, MessageCircle, Video, FileText, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useLocation } from "wouter";

export default function CRMMessaging() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("conversations");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [selectedConversation, setSelectedConversation] = useState<any>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isLogCallOpen, setIsLogCallOpen] = useState(false);

  const [composeForm, setComposeForm] = useState({
    whatsappNumber: "",
    contactName: "",
    content: "",
  });

  const [callForm, setCallForm] = useState({
    contactId: 0,
    direction: "outbound" as "outbound" | "inbound",
    duration: 0,
    outcome: "answered" as "answered" | "voicemail" | "no_answer" | "busy" | "wrong_number",
    notes: "",
  });

  // Queries
  const { data: conversations, isLoading: convoLoading } = trpc.crm.whatsapp.conversations.useQuery({ limit: 50 });
  const { data: interactions, isLoading: interactionsLoading } = trpc.crm.interactions.list.useQuery({
    channel: channelFilter !== "all" ? channelFilter : undefined,
    limit: 50,
  });
  const { data: contacts } = trpc.crm.contacts.list.useQuery({ limit: 100 });

  const { data: conversationMessages } = trpc.crm.whatsapp.messages.useQuery(
    { whatsappNumber: selectedConversation?.whatsappNumber, limit: 50 },
    { enabled: !!selectedConversation?.whatsappNumber },
  );

  // Mutations
  const sendMessage = trpc.crm.whatsapp.sendMessage.useMutation({
    onSuccess: () => {
      toast.success("Message sent");
      setIsComposeOpen(false);
      setComposeForm({ whatsappNumber: "", contactName: "", content: "" });
    },
    onError: (error) => toast.error(error.message),
  });

  const logCall = trpc.crm.interactions.logCall.useMutation({
    onSuccess: () => {
      toast.success("Call logged");
      setIsLogCallOpen(false);
      setCallForm({ contactId: 0, direction: "outbound", duration: 0, outcome: "answered", notes: "" });
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeForm.whatsappNumber.trim() || !composeForm.content.trim()) {
      toast.error("Please fill in the number and message");
      return;
    }
    sendMessage.mutate({
      whatsappNumber: composeForm.whatsappNumber,
      contactName: composeForm.contactName || undefined,
      content: composeForm.content,
    });
  };

  const handleLogCall = (e: React.FormEvent) => {
    e.preventDefault();
    if (!callForm.contactId) {
      toast.error("Please select a contact");
      return;
    }
    logCall.mutate(callForm);
  };

  const channelIcons: Record<string, any> = {
    whatsapp: MessageSquare,
    email: Mail,
    phone: Phone,
    sms: MessageCircle,
    meeting: Video,
    linkedin: FileText,
    note: FileText,
    task: Clock,
  };

  const channelColors: Record<string, string> = {
    whatsapp: "text-green-600",
    email: "text-blue-600",
    phone: "text-orange-500",
    sms: "text-purple-600",
    meeting: "text-indigo-600",
    linkedin: "text-blue-700",
    note: "text-gray-600",
    task: "text-yellow-600",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button variant="ghost" size="sm" onClick={() => navigate("/crm/hub")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              CRM Hub
            </Button>
          </div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <MessageCircle className="h-8 w-8" />
            Messaging
          </h1>
          <p className="text-muted-foreground mt-1">
            Track conversations across WhatsApp, email, phone, and other channels.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsLogCallOpen(true)}>
            <Phone className="h-4 w-4 mr-2" />
            Log Call
          </Button>
          <Button onClick={() => setIsComposeOpen(true)}>
            <Send className="h-4 w-4 mr-2" />
            Send WhatsApp
          </Button>
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="conversations" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            WhatsApp
          </TabsTrigger>
          <TabsTrigger value="interactions" className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            All Interactions
          </TabsTrigger>
        </TabsList>

        {/* WhatsApp Conversations Tab */}
        <TabsContent value="conversations" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {/* Conversation List */}
            <Card className="md:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-green-600" />
                  Conversations
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {convoLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !conversations || conversations.length === 0 ? (
                  <div className="text-center py-8 px-4 text-muted-foreground text-sm">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No WhatsApp conversations yet.</p>
                    <p className="text-xs mt-1">Send a message to get started.</p>
                  </div>
                ) : (
                  <div className="max-h-[500px] overflow-y-auto">
                    {conversations.map((convo: any) => (
                      <div
                        key={convo.conversationId || convo.whatsappNumber}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 border-b ${
                          selectedConversation?.whatsappNumber === convo.whatsappNumber ? "bg-muted" : ""
                        }`}
                        onClick={() => setSelectedConversation(convo)}
                      >
                        <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                          <MessageSquare className="h-4 w-4 text-green-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {convo.contactName || convo.whatsappNumber}
                          </div>
                          {convo.lastMessage && (
                            <div className="text-xs text-muted-foreground truncate">{convo.lastMessage}</div>
                          )}
                        </div>
                        {convo.lastMessageAt && (
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(convo.lastMessageAt), "MMM d")}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Message Thread */}
            <Card className="md:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {selectedConversation
                    ? (selectedConversation.contactName || selectedConversation.whatsappNumber)
                    : "Select a conversation"
                  }
                </CardTitle>
                {selectedConversation && (
                  <CardDescription>{selectedConversation.whatsappNumber}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {!selectedConversation ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Select a conversation from the left to view messages.</p>
                  </div>
                ) : !conversationMessages || conversationMessages.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No messages in this conversation.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {conversationMessages.map((msg: any) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                            msg.direction === "outbound"
                              ? "bg-green-600 text-white"
                              : "bg-muted"
                          }`}
                        >
                          <div>{msg.content}</div>
                          <div className={`text-xs mt-1 ${msg.direction === "outbound" ? "text-green-200" : "text-muted-foreground"}`}>
                            {msg.sentAt ? format(new Date(msg.sentAt), "MMM d, h:mm a") : ""}
                            {msg.status && (
                              <span className="ml-2 capitalize">{msg.status}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* All Interactions Tab */}
        <TabsContent value="interactions" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>All Interactions</CardTitle>
                  <CardDescription>View activity across all communication channels</CardDescription>
                </div>
                <Select value={channelFilter} onValueChange={setChannelFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Channel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Channels</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="note">Notes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {interactionsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !interactions || interactions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No interactions recorded yet. Log a call or send a message to get started.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Subject / Content</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {interactions.map((item: any) => {
                      const ChannelIcon = channelIcons[item.channel] || MessageCircle;
                      const color = channelColors[item.channel] || "text-gray-500";
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <ChannelIcon className={`h-4 w-4 ${color}`} />
                              <span className="capitalize text-sm">{item.channel}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize text-xs">
                              {item.interactionType?.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-[400px]">
                              {item.subject && <div className="font-medium text-sm">{item.subject}</div>}
                              {item.content && (
                                <div className="text-sm text-muted-foreground line-clamp-1">{item.content}</div>
                              )}
                              {!item.subject && !item.content && (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {item.createdAt ? (
                              <span className="text-sm text-muted-foreground">
                                {format(new Date(item.createdAt), "MMM d, yyyy h:mm a")}
                              </span>
                            ) : "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Compose WhatsApp Dialog */}
      <Dialog open={isComposeOpen} onOpenChange={setIsComposeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send WhatsApp Message</DialogTitle>
            <DialogDescription>Send a message via WhatsApp Business API.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSendMessage}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>WhatsApp Number *</Label>
                <Input
                  placeholder="+1234567890"
                  value={composeForm.whatsappNumber}
                  onChange={(e) => setComposeForm({ ...composeForm, whatsappNumber: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Contact Name</Label>
                <Input
                  placeholder="Recipient name (optional)"
                  value={composeForm.contactName}
                  onChange={(e) => setComposeForm({ ...composeForm, contactName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Message *</Label>
                <Textarea
                  placeholder="Type your message..."
                  value={composeForm.content}
                  onChange={(e) => setComposeForm({ ...composeForm, content: e.target.value })}
                  rows={4}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setIsComposeOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={sendMessage.isPending}>
                {sendMessage.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Send className="h-4 w-4 mr-2" />
                Send
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Log Call Dialog */}
      <Dialog open={isLogCallOpen} onOpenChange={setIsLogCallOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log a Call</DialogTitle>
            <DialogDescription>Record a phone call with a contact.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleLogCall}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Contact *</Label>
                <Select
                  value={callForm.contactId ? String(callForm.contactId) : ""}
                  onValueChange={(v) => setCallForm({ ...callForm, contactId: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a contact" />
                  </SelectTrigger>
                  <SelectContent>
                    {contacts?.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Direction</Label>
                  <Select
                    value={callForm.direction}
                    onValueChange={(v) => setCallForm({ ...callForm, direction: v as "outbound" | "inbound" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="outbound">Outbound</SelectItem>
                      <SelectItem value="inbound">Inbound</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Duration (min)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={callForm.duration}
                    onChange={(e) => setCallForm({ ...callForm, duration: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Outcome</Label>
                <Select
                  value={callForm.outcome}
                  onValueChange={(v) => setCallForm({ ...callForm, outcome: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="answered">Answered</SelectItem>
                    <SelectItem value="voicemail">Voicemail</SelectItem>
                    <SelectItem value="no_answer">No Answer</SelectItem>
                    <SelectItem value="busy">Busy</SelectItem>
                    <SelectItem value="wrong_number">Wrong Number</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Call notes..."
                  value={callForm.notes}
                  onChange={(e) => setCallForm({ ...callForm, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setIsLogCallOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={logCall.isPending}>
                {logCall.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Log Call
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
