import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Send, MessageCircle, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useOfflineMutation } from "@/hooks/useOfflineMutation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: number;
  whatsappNumber: string;
  contactName?: string;
  subtitle?: string;
}

export default function WhatsAppDrawer({ open, onOpenChange, contactId, whatsappNumber, contactName, subtitle }: Props) {
  const online = useOnlineStatus();
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: messagesRaw, isLoading, refetch } = trpc.crm.contacts.getMessagingHistory.useQuery(
    { contactId },
    { enabled: open && !!contactId }
  );
  const messages = (messagesRaw as any[] | undefined) || [];

  const sendMutationTrpc = trpc.crm.whatsapp.sendMessage.useMutation({
    onSuccess: () => {
      toast.success("Message sent");
      refetch();
    },
  });
  const sendMutation = useOfflineMutation<{
    contactId: number;
    whatsappNumber: string;
    contactName?: string;
    content: string;
    messageType: "text";
  }>({
    path: "crm.whatsapp.sendMessage",
    label: "Message",
    online: (input) => sendMutationTrpc.mutateAsync(input),
  });

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function handleSend() {
    if (!messageText.trim()) return;
    if (!whatsappNumber) {
      toast.error("No WhatsApp number for this contact");
      return;
    }
    const text = messageText.trim();
    setMessageText("");
    try {
      await sendMutation.mutate({
        contactId,
        whatsappNumber,
        contactName,
        content: text,
        messageType: "text",
      });
    } catch (err) {
      setMessageText(text);
      toast.error(err instanceof Error ? err.message : "Failed to send");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function formatMessageTime(dateStr: string) {
    try {
      const d = new Date(dateStr);
      const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
      if (diffDays === 0) return format(d, "h:mm a");
      if (diffDays === 1) return "Yesterday " + format(d, "h:mm a");
      if (diffDays < 7) return format(d, "EEE h:mm a");
      return format(d, "MMM d, h:mm a");
    } catch {
      return "";
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <MessageCircle className="h-4 w-4 text-green-600" />
            {contactName || "WhatsApp"}
          </SheetTitle>
          <div className="flex items-center justify-between gap-2 mt-1">
            <div className="text-xs text-muted-foreground font-mono">{whatsappNumber}</div>
            {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-muted/20">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-8">
              No messages yet. Send the first one below.
            </div>
          ) : (
            messages.map((msg: any) => {
              const isOutbound = msg.direction === "outbound";
              const channelLabel = msg.type;
              return (
                <div key={`${msg.type}-${msg.id}`} className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      isOutbound ? "bg-green-600 text-white" : "bg-background border"
                    }`}
                  >
                    {channelLabel && channelLabel !== "whatsapp" && (
                      <Badge variant="outline" className="mb-1 text-[10px] h-4">
                        {channelLabel}
                      </Badge>
                    )}
                    <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                    <div className={`text-[10px] mt-1 ${isOutbound ? "text-green-100" : "text-muted-foreground"}`}>
                      {formatMessageTime(msg.timestamp)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t px-3 py-2 bg-background">
          {!online && (
            <div className="text-[11px] text-amber-600 mb-1">Offline — messages will queue and send when you reconnect.</div>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message…"
              className="min-h-[40px] max-h-32 text-sm resize-none"
              rows={1}
            />
            <Button onClick={handleSend} size="icon" disabled={!messageText.trim()} className="h-9 w-9 shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
