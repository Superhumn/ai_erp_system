import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Streamdown } from "streamdown";
import {
  Bot,
  Send,
  User,
  Loader2,
  Sparkles,
  MessageSquare,
  Plus,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  BarChart3,
  Package,
  Users,
  Truck,
  Mail,
  DollarSign,
  ShoppingCart,
  Factory,
  FileText,
  Search,
  ChevronRight,
  History,
} from "lucide-react";

// ============================================
// TYPES
// ============================================

interface AIAction {
  type: string;
  description: string;
  status: "pending" | "completed" | "failed";
  result?: any;
  error?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: AIAction[];
  suggestions?: string[];
  timestamp: Date;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================
// ACTION STATUS INDICATOR
// ============================================

function ActionIndicator({ action }: { action: AIAction }) {
  const icons = {
    pending: Clock,
    completed: CheckCircle2,
    failed: XCircle,
  };
  const colors = {
    pending: "text-yellow-500 bg-yellow-500/10",
    completed: "text-green-500 bg-green-500/10",
    failed: "text-red-500 bg-red-500/10",
  };

  const Icon = icons[action.status];
  const color = colors[action.status];

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${color}`}>
      <Icon className="h-3 w-3" />
      <span className="capitalize">{action.type.replace(/_/g, " ")}</span>
    </div>
  );
}

// ============================================
// MAIN AI ASSISTANT PAGE
// ============================================

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"prompts" | "history">("prompts");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const agentChat = trpc.ai.agentChat.useMutation();

  const scrollToBottom = () => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement;
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(async (text?: string) => {
    const userMessage = (text || input).trim();
    if (!userMessage) return;
    if (!text) setInput("");

    const userMsg: Message = {
      id: generateId(),
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);

    try {
      const conversationHistory = messages.map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      }));

      const response = await agentChat.mutateAsync({
        message: userMessage,
        conversationHistory,
      });

      const assistantMsg: Message = {
        id: generateId(),
        role: "assistant",
        content: response.message,
        actions: response.actions as AIAction[] | undefined,
        suggestions: response.suggestions,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Update conversation title from first message
      if (messages.length === 0 && activeConversationId) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConversationId
              ? { ...c, title: userMessage.slice(0, 50) + (userMessage.length > 50 ? "..." : "") }
              : c
          )
        );
      }
    } catch (error) {
      const errorMsg: Message = {
        id: generateId(),
        role: "assistant",
        content: "I encountered an error processing your request. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }
  }, [input, messages, agentChat, activeConversationId]);

  const handleNewConversation = () => {
    // Save current conversation if it has messages
    if (messages.length > 0) {
      const conv: Conversation = {
        id: activeConversationId || generateId(),
        title: messages[0]?.content.slice(0, 50) || "New Conversation",
        messages: [...messages],
        createdAt: new Date(),
      };
      setConversations((prev) => {
        const existing = prev.find((c) => c.id === conv.id);
        if (existing) {
          return prev.map((c) => (c.id === conv.id ? conv : c));
        }
        return [conv, ...prev];
      });
    }

    const newId = generateId();
    setActiveConversationId(newId);
    setMessages([]);
    inputRef.current?.focus();
  };

  const handleLoadConversation = (conv: Conversation) => {
    // Save current conversation
    if (messages.length > 0 && activeConversationId) {
      const current: Conversation = {
        id: activeConversationId,
        title: messages[0]?.content.slice(0, 50) || "Conversation",
        messages: [...messages],
        createdAt: new Date(),
      };
      setConversations((prev) => {
        const existing = prev.find((c) => c.id === current.id);
        if (existing) {
          return prev.map((c) => (c.id === current.id ? current : c));
        }
        return [current, ...prev];
      });
    }

    setActiveConversationId(conv.id);
    setMessages(conv.messages);
  };

  const isLoading = agentChat.isPending;

  // Prompt categories
  const promptCategories = [
    {
      title: "Data Analysis",
      icon: BarChart3,
      color: "text-blue-500",
      prompts: [
        "Analyze sales data for this month",
        "Show me inventory status and low stock items",
        "Compare vendor performance metrics",
        "Generate a financial overview report",
      ],
    },
    {
      title: "Email & Communication",
      icon: Mail,
      color: "text-green-500",
      prompts: [
        "Draft a follow-up email to vendors with pending POs",
        "Send a payment reminder for overdue invoices",
        "Create an RFQ email for new raw materials",
        "Draft a welcome email for a new customer",
      ],
    },
    {
      title: "Tracking & Logistics",
      icon: Truck,
      color: "text-purple-500",
      prompts: [
        "Track all active shipments",
        "Show me pending purchase orders",
        "Which orders need fulfillment?",
        "What work orders are in progress?",
      ],
    },
    {
      title: "Vendors & Suppliers",
      icon: Users,
      color: "text-orange-500",
      prompts: [
        "List all active vendors and their status",
        "Create a purchase order for packaging supplies",
        "Which vendors have the best delivery track record?",
        "Search for vendors supplying organic ingredients",
      ],
    },
    {
      title: "Copackers & Production",
      icon: Factory,
      color: "text-pink-500",
      prompts: [
        "Show copacker production status",
        "Create a work order for contract manufacturing",
        "Track production batch progress",
        "Compare copacker capacity and costs",
      ],
    },
    {
      title: "Finance & Invoicing",
      icon: DollarSign,
      color: "text-emerald-500",
      prompts: [
        "Show overdue invoices and amounts",
        "Generate an accounts receivable summary",
        "What is our current cash position?",
        "Reconcile recent payments",
      ],
    },
  ];

  return (
    <div className="h-[calc(100vh-8rem)] flex animate-fade-in">
      {/* Sidebar */}
      <div className="w-72 border-r flex flex-col bg-muted/20 shrink-0">
        {/* Sidebar Header */}
        <div className="p-4 border-b">
          <Button onClick={handleNewConversation} className="w-full gap-2" variant="outline">
            <Plus className="h-4 w-4" />
            New Conversation
          </Button>
        </div>

        {/* Sidebar Tabs */}
        <Tabs value={sidebarTab} onValueChange={(v) => setSidebarTab(v as typeof sidebarTab)} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-4 mt-3 grid grid-cols-2">
            <TabsTrigger value="prompts" className="text-xs gap-1">
              <Sparkles className="h-3 w-3" />
              Prompts
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs gap-1">
              <History className="h-3 w-3" />
              History
            </TabsTrigger>
          </TabsList>

          {/* Prompts Tab */}
          <TabsContent value="prompts" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full">
              <div className="p-3 space-y-4">
                {promptCategories.map((category, idx) => (
                  <div key={idx}>
                    <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                      <category.icon className={`h-3.5 w-3.5 ${category.color}`} />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {category.title}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {category.prompts.map((prompt, pidx) => (
                        <button
                          key={pidx}
                          onClick={() => handleSend(prompt)}
                          disabled={isLoading}
                          className="w-full text-left text-xs px-3 py-2 rounded-md hover:bg-muted transition-colors disabled:opacity-50 text-muted-foreground hover:text-foreground"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full">
              <div className="p-3 space-y-1">
                {conversations.length === 0 ? (
                  <div className="text-center py-8">
                    <History className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No conversation history</p>
                  </div>
                ) : (
                  conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => handleLoadConversation(conv)}
                      className={`w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors ${
                        activeConversationId === conv.id
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <p className="truncate text-xs font-medium">{conv.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {conv.messages.length} messages
                      </p>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Chat Header */}
        <div className="border-b px-6 py-3 flex items-center justify-between bg-background">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold">AI Assistant</h1>
              <p className="text-xs text-muted-foreground">
                Analyze data, send emails, track items, manage vendors & copackers
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Online
            </Badge>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                <Bot className="h-10 w-10 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">How can I help you today?</h3>
              <p className="text-muted-foreground text-sm mb-8 max-w-lg">
                I can analyze your business data, send emails, track inventory and orders,
                manage vendors and copackers, generate reports, and more. Try one of the prompts
                in the sidebar or type your own question below.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full max-w-2xl">
                {[
                  { icon: BarChart3, label: "Analyze sales data", msg: "Analyze sales data for this month and show me key metrics" },
                  { icon: Package, label: "Check inventory", msg: "Show me inventory status and items that need restocking" },
                  { icon: Users, label: "Vendor overview", msg: "Give me an overview of all vendors and their performance" },
                  { icon: Mail, label: "Draft email", msg: "Help me draft a follow-up email to vendors with pending shipments" },
                  { icon: Factory, label: "Production status", msg: "Show me current production and work order status" },
                  { icon: DollarSign, label: "Financial summary", msg: "Give me a financial summary with invoices and payment status" },
                ].map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(item.msg)}
                    disabled={isLoading}
                    className="flex items-center gap-3 p-4 rounded-xl border hover:bg-muted transition-all hover:shadow-sm disabled:opacity-50 text-left"
                  >
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <item.icon className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-sm">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6 max-w-4xl mx-auto">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-4 ${message.role === "user" ? "justify-end" : ""}`}
                >
                  {message.role === "assistant" && (
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                      <Sparkles className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[80%] space-y-2`}>
                    <div
                      className={`rounded-2xl px-5 py-3 ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {message.role === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <Streamdown>{message.content}</Streamdown>
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      )}
                    </div>

                    {/* Actions */}
                    {message.actions && message.actions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 px-2">
                        {message.actions.map((action, idx) => (
                          <ActionIndicator key={idx} action={action} />
                        ))}
                      </div>
                    )}

                    {/* Suggestions */}
                    {message.suggestions && message.suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 px-2">
                        {message.suggestions.map((suggestion, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSend(suggestion)}
                            disabled={isLoading}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-full border border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary transition-colors disabled:opacity-50"
                          >
                            <ChevronRight className="h-3 w-3" />
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {message.role === "user" && (
                    <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-1">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-4">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div className="rounded-2xl bg-muted px-5 py-4">
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">Analyzing and processing your request...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t bg-background px-6 py-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-3 max-w-4xl mx-auto"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your data, manage vendors, send emails, track items..."
              disabled={isLoading}
              className="flex-1 h-11"
            />
            <Button type="submit" disabled={isLoading || !input.trim()} size="lg">
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
          <div className="flex items-center justify-center gap-4 mt-2">
            <span className="text-[10px] text-muted-foreground">
              AI can analyze data, send emails, track items, and manage vendors & copackers
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
