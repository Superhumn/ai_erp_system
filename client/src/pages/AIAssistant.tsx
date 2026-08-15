import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot,
  Send,
  User,
  Loader2,
  Sparkles,
  MessageSquare,
  Square,
  Plus,
  History,
  LayoutDashboard,
  AlertCircle,
  Lightbulb,
  BarChart3,
  RefreshCw,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";
import type { AgentStreamEvent } from "@shared/aiChat";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const ANALYSIS_TYPES = [
  "sales",
  "inventory",
  "vendors",
  "customers",
  "finances",
  "orders",
  "procurement",
  "production",
] as const;

type AnalysisType = (typeof ANALYSIS_TYPES)[number];

function priorityVariant(priority?: string): "default" | "secondary" | "destructive" | "outline" {
  if (priority === "high" || priority === "urgent") return "destructive";
  if (priority === "medium") return "default";
  return "secondary";
}

// Untyped agent output — render arbitrary values compactly.
function renderValue(value: any) {
  if (value == null) return null;
  if (typeof value === "string") {
    return <Streamdown>{value}</Streamdown>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <p className="text-sm text-muted-foreground">Nothing to show.</p>;
    }
    return (
      <div className="space-y-2">
        {value.map((item: any, i: number) => (
          <div key={i} className="rounded-md border p-2 text-sm">
            {item && typeof item === "object" ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{item.title || item.name || item.type || `Item ${i + 1}`}</span>
                  {item.priority && (
                    <Badge variant={priorityVariant(item.priority)} className="text-[10px]">
                      {item.priority}
                    </Badge>
                  )}
                </div>
                {item.description && (
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                )}
              </div>
            ) : (
              <span>{String(item)}</span>
            )}
          </div>
        ))}
      </div>
    );
  }
  if (typeof value === "object") {
    return (
      <div className="space-y-1">
        {Object.entries(value).map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-3 text-sm">
            <span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
            <span className="font-medium text-right">
              {v != null && typeof v === "object" ? JSON.stringify(v) : String(v)}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return <span className="text-sm">{String(value)}</span>;
}

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [analysisType, setAnalysisType] = useState<AnalysisType | "">("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  // Streamed response state. `isWorking` = waiting/tool-running (no answer text
  // yet); `isStreaming` = the answer is actively typing out.
  const [isWorking, setIsWorking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const query = trpc.ai.query.useMutation();

  // Conversation history
  const conversations = trpc.ai.conversations.useQuery();
  const getConversation = trpc.ai.getConversation.useQuery(
    { id: selectedConversationId ?? 0 },
    { enabled: selectedConversationId != null },
  );
  const createConversation = trpc.ai.createConversation.useMutation();

  // Overview panels
  const systemOverview = trpc.ai.systemOverview.useQuery();
  const suggestedActions = trpc.ai.suggestedActions.useQuery();
  const pendingActions = trpc.ai.pendingActions.useQuery();
  const quickAnalysis = trpc.ai.quickAnalysis.useQuery(
    { dataType: (analysisType || "sales") as AnalysisType },
    { enabled: analysisType !== "" },
  );

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamStatus]);

  // Replace the content of the most recent assistant message (the one we stream into).
  const updateLastAssistant = (content: string) =>
    setMessages((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === "assistant") {
          next[i] = { ...next[i], content };
          break;
        }
      }
      return next;
    });

  // Load messages of the selected past conversation into the view.
  useEffect(() => {
    const data: any = getConversation.data;
    if (data && Array.isArray(data.messages)) {
      setMessages(
        data.messages
          .filter((m: any) => m.role === "user" || m.role === "assistant")
          .map((m: any) => ({ role: m.role, content: m.content })),
      );
    }
  }, [getConversation.data]);

  const handleSelectConversation = (id: number) => {
    setSelectedConversationId(id);
  };

  const handleNewConversation = async () => {
    try {
      const result: any = await createConversation.mutateAsync({});
      await conversations.refetch();
      setMessages([]);
      if (result?.id != null) {
        setSelectedConversationId(result.id);
      } else {
        setSelectedConversationId(null);
      }
      toast.success("Started a new conversation");
    } catch {
      toast.error("Could not create conversation");
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input.trim();
    setInput("");

    // Build conversation history from previous messages for context (before we
    // append the new user turn + assistant placeholder).
    const conversationHistory = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    setMessages((prev) => [
      ...prev,
      { role: "user", content: userMessage },
      { role: "assistant", content: "" },
    ]);
    setIsWorking(true);
    setIsStreaming(false);
    setStreamStatus(null);

    const controller = new AbortController();
    abortRef.current = controller;
    let acc = "";

    try {
      const iterable = (await utils.client.ai.agentChatStream.mutate(
        { message: userMessage, conversationHistory, mode: "act" },
        { signal: controller.signal },
      )) as AsyncIterable<AgentStreamEvent>;
      for await (const ev of iterable) {
        if (ev.type === "token") {
          setIsWorking(false);
          setIsStreaming(true);
          setStreamStatus(null);
          acc += ev.text;
          updateLastAssistant(acc);
        } else if (ev.type === "reset") {
          acc = "";
          updateLastAssistant("");
          setIsStreaming(false);
          setIsWorking(true);
        } else if (ev.type === "status") {
          setStreamStatus(ev.label);
        } else if (ev.type === "done") {
          setIsWorking(false);
          setIsStreaming(false);
          setStreamStatus(null);
          updateLastAssistant(ev.response.message || acc || "Done.");
        }
        // `action` events are not surfaced on this simple chat page.
      }
    } catch (error) {
      setIsWorking(false);
      setIsStreaming(false);
      setStreamStatus(null);
      if (controller.signal.aborted) {
        if (!acc) updateLastAssistant("_(stopped)_");
        return;
      }
      updateLastAssistant("Sorry, I encountered an error. Please try again.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  const handleQuickQuery = async (question: string) => {
    setMessages((prev) => [...prev, { role: "user", content: question }]);

    try {
      const response = await query.mutateAsync({ question });
      setMessages((prev) => [...prev, { role: "assistant", content: response.answer }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I encountered an error. Please try again." },
      ]);
    }
  };

  const quickQuestions = [
    "What is our current cash position?",
    "Which invoices are overdue?",
    "Show me pending purchase orders",
    "Summarize active projects",
    "Which vendors are past due?",
    "What are our top selling products?",
  ];

  const isBusy = isWorking || isStreaming || query.isPending;
  const conversationList: any[] = Array.isArray(conversations.data) ? conversations.data : [];

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col animate-fade-in">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Bot className="h-8 w-8 text-primary" />
          AI Assistant
        </h1>
        <p className="text-muted-foreground mt-1">
          Ask questions about your business data using natural language.
        </p>
        <a href="/ai/recommendations" className="inline-block mt-2 text-sm text-primary hover:underline">
          View AI recommendations →
        </a>
      </div>

      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Conversation history sidebar */}
        <Card className="hidden md:flex w-64 shrink-0 flex-col overflow-hidden">
          <CardHeader className="border-b py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">History</CardTitle>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleNewConversation}
                disabled={createConversation.isPending}
                className="h-7 px-2"
              >
                {createConversation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                <span className="ml-1 text-xs">New</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-hidden">
            <ScrollArea className="h-full p-2">
              {conversations.isLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : conversationList.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center">
                  No conversations yet.
                </p>
              ) : (
                <div className="space-y-1">
                  {conversationList.map((c: any) => (
                    <button
                      key={c.id}
                      onClick={() => handleSelectConversation(c.id)}
                      className={`w-full text-left text-sm p-2 rounded-md transition-colors flex items-center gap-2 ${
                        selectedConversationId === c.id ? "bg-muted" : "hover:bg-muted/60"
                      }`}
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{c.title || "Untitled"}</span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Main area: Chat + Overview tabs */}
        <Tabs defaultValue="chat" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-fit">
            <TabsTrigger value="chat">
              <MessageSquare className="h-4 w-4 mr-1.5" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="overview">
              <LayoutDashboard className="h-4 w-4 mr-1.5" />
              Overview
            </TabsTrigger>
          </TabsList>

          {/* Chat tab */}
          <TabsContent value="chat" className="flex-1 flex flex-col overflow-hidden mt-3">
            <Card className="flex-1 flex flex-col overflow-hidden">
              <CardHeader className="border-b py-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">Chat with your ERP data</CardTitle>
                  {getConversation.isFetching && selectedConversationId != null && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
                <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8">
                      <Bot className="h-16 w-16 text-muted-foreground/30 mb-4" />
                      <h3 className="text-lg font-medium mb-2">How can I help you today?</h3>
                      <p className="text-muted-foreground text-sm mb-6 max-w-md">
                        I can answer questions about your business metrics, generate reports,
                        and provide insights from your ERP data.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full max-w-xl">
                        {quickQuestions.map((question) => (
                          <button
                            key={question}
                            onClick={() => handleQuickQuery(question)}
                            disabled={isBusy}
                            className="text-left text-sm p-3 rounded-lg border hover:bg-muted transition-colors disabled:opacity-50"
                          >
                            <MessageSquare className="h-3 w-3 inline mr-2 text-muted-foreground" />
                            {question}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {messages.map((message, index) => (
                        <div
                          key={index}
                          className={`flex gap-3 ${message.role === "user" ? "justify-end" : ""}`}
                        >
                          {message.role === "assistant" && (
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <Bot className="h-4 w-4 text-primary" />
                            </div>
                          )}
                          <div
                            className={`max-w-[80%] rounded-lg p-3 ${
                              message.role === "user"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            }`}
                          >
                            {message.role === "assistant" ? (
                              <>
                                <Streamdown>{message.content}</Streamdown>
                                {isStreaming && index === messages.length - 1 && (
                                  <span
                                    className="inline-block h-4 w-[2px] ml-0.5 align-middle bg-primary/70 animate-pulse rounded-sm"
                                    aria-hidden
                                  />
                                )}
                              </>
                            ) : (
                              <p className="text-sm">{message.content}</p>
                            )}
                          </div>
                          {message.role === "user" && (
                            <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                              <User className="h-4 w-4" />
                            </div>
                          )}
                        </div>
                      ))}
                      {(isWorking || query.isPending) && (
                        <div className="flex gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <Bot className="h-4 w-4 text-primary" />
                          </div>
                          <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {streamStatus && (
                              <span className="text-sm text-muted-foreground">{streamStatus}</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </ScrollArea>

                {/* Input Area */}
                <div className="border-t p-4">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSend();
                    }}
                    className="flex gap-2"
                  >
                    <Input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Ask about your business data..."
                      disabled={isBusy}
                      className="flex-1"
                    />
                    {isWorking || isStreaming ? (
                      <Button type="button" variant="outline" onClick={stopStreaming}>
                        <Square className="h-4 w-4 mr-1" /> Stop
                      </Button>
                    ) : (
                      <Button type="submit" disabled={isBusy || !input.trim()}>
                        {query.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </form>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Overview tab */}
          <TabsContent value="overview" className="flex-1 overflow-hidden mt-3">
            <ScrollArea className="h-full pr-2">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* System overview */}
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center gap-2">
                      <LayoutDashboard className="h-4 w-4 text-primary" />
                      <CardTitle className="text-base">System Overview</CardTitle>
                    </div>
                    <CardDescription>Current snapshot of your ERP.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {systemOverview.isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      renderValue(systemOverview.data)
                    )}
                  </CardContent>
                </Card>

                {/* Suggested actions */}
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-primary" />
                      <CardTitle className="text-base">Suggested Actions</CardTitle>
                    </div>
                    <CardDescription>Recommendations based on system state.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {suggestedActions.isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      renderValue(suggestedActions.data)
                    )}
                  </CardContent>
                </Card>

                {/* Pending actions */}
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-primary" />
                      <CardTitle className="text-base">Pending Actions</CardTitle>
                    </div>
                    <CardDescription>Items that need your attention.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {pendingActions.isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      renderValue(pendingActions.data)
                    )}
                  </CardContent>
                </Card>

                {/* Quick analysis */}
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-primary" />
                        <CardTitle className="text-base">Quick Analysis</CardTitle>
                      </div>
                      {analysisType !== "" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => quickAnalysis.refetch()}
                          disabled={quickAnalysis.isFetching}
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${quickAnalysis.isFetching ? "animate-spin" : ""}`}
                          />
                        </Button>
                      )}
                    </div>
                    <CardDescription>Pick a data type for an AI-generated insight.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Select
                      value={analysisType || undefined}
                      onValueChange={(v) => setAnalysisType(v as AnalysisType)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a data type" />
                      </SelectTrigger>
                      <SelectContent>
                        {ANALYSIS_TYPES.map((t) => (
                          <SelectItem key={t} value={t} className="capitalize">
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Separator />
                    {analysisType === "" ? (
                      <p className="text-sm text-muted-foreground">
                        Choose a data type above to run an analysis.
                      </p>
                    ) : quickAnalysis.isLoading || quickAnalysis.isFetching ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      renderValue(quickAnalysis.data)
                    )}
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
