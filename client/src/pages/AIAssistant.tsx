import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, User, Loader2, Sparkles, MessageSquare, Square } from "lucide-react";
import { Streamdown } from "streamdown";
import type { AgentStreamEvent } from "@shared/aiChat";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  // Streamed response state. `isWorking` = waiting/tool-running (no answer text
  // yet); `isStreaming` = the answer is actively typing out.
  const [isWorking, setIsWorking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const query = trpc.ai.query.useMutation();

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

      {/* Chat Area */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="border-b py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Chat with your ERP data</CardTitle>
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
    </div>
  );
}
