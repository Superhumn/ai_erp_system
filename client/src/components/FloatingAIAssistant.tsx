import { useState, useRef, useEffect, useCallback } from 'react';
import { useAIAgent, AIMessage, AIAction } from '@/contexts/AIAgentContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Streamdown } from 'streamdown';
import {
  Bot,
  X,
  Minus,
  Maximize2,
  Send,
  Loader2,
  User,
  Sparkles,
  MessageSquare,
  RefreshCw,
  ChevronRight,
  Mail,
  Package,
  TrendingUp,
  Users,
  Truck,
  FileText,
  DollarSign,
  ClipboardList,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  BarChart3,
  Factory,
} from 'lucide-react';

// ============================================
// QUICK ACTION BUTTONS
// ============================================

interface QuickActionProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

function QuickAction({ icon, label, onClick }: QuickActionProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-border/50 bg-muted/30 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ============================================
// ACTION STATUS BADGE
// ============================================

function ActionStatusBadge({ action }: { action: AIAction }) {
  const statusConfig = {
    pending: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
    completed: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10' },
    failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
  };

  const config = statusConfig[action.status];
  const Icon = config.icon;

  return (
    <div className={cn('flex items-center gap-2 px-2 py-1 rounded text-xs', config.bg)}>
      <Icon className={cn('h-3 w-3', config.color)} />
      <span className={config.color}>{action.type.replace(/_/g, ' ')}</span>
      <span className="text-muted-foreground">- {action.status}</span>
    </div>
  );
}

// ============================================
// SUGGESTION CHIP
// ============================================

function SuggestionChip({ suggestion, onClick }: { suggestion: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-1 text-xs rounded-full border border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary transition-colors"
    >
      <ChevronRight className="h-3 w-3" />
      {suggestion}
    </button>
  );
}

// ============================================
// MESSAGE COMPONENT
// ============================================

function MessageBubble({ message, onSuggestionClick }: { message: AIMessage; onSuggestionClick: (s: string) => void }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
      )}

      <div className={cn('max-w-[85%] space-y-2')}>
        <div
          className={cn(
            'rounded-lg px-4 py-3',
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
          )}
        >
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
              <Streamdown>{message.content}</Streamdown>
            </div>
          )}
        </div>

        {/* Actions performed */}
        {message.actions && message.actions.length > 0 && (
          <div className="space-y-1 px-1">
            <p className="text-xs font-medium text-muted-foreground">Actions:</p>
            {message.actions.map((action, idx) => (
              <ActionStatusBadge key={idx} action={action} />
            ))}
          </div>
        )}

        {/* Suggestions */}
        {message.suggestions && message.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1 px-1">
            {message.suggestions.map((suggestion, idx) => (
              <SuggestionChip
                key={idx}
                suggestion={suggestion}
                onClick={() => onSuggestionClick(suggestion)}
              />
            ))}
          </div>
        )}
      </div>

      {isUser && (
        <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-1">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

// ============================================
// EMPTY STATE
// ============================================

function EmptyState({ onQuickAction }: { onQuickAction: (message: string) => void }) {
  const quickActions = [
    { icon: <BarChart3 className="h-4 w-4" />, label: 'Analyze sales', message: 'Analyze sales data and show me trends' },
    { icon: <Package className="h-4 w-4" />, label: 'Check inventory', message: 'Show me inventory status and low stock items' },
    { icon: <Users className="h-4 w-4" />, label: 'Vendor overview', message: 'Give me an overview of our vendors and their performance' },
    { icon: <DollarSign className="h-4 w-4" />, label: 'Financial summary', message: 'Provide a financial summary including invoices and payments' },
    { icon: <Mail className="h-4 w-4" />, label: 'Draft email', message: 'Help me draft a follow-up email to a vendor' },
    { icon: <Truck className="h-4 w-4" />, label: 'Track shipments', message: 'Show me the status of all shipments' },
    { icon: <ClipboardList className="h-4 w-4" />, label: 'Pending orders', message: 'What orders are pending fulfillment?' },
    { icon: <Factory className="h-4 w-4" />, label: 'Production status', message: 'Show me current production and work order status' },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <Bot className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold mb-2">AI Assistant</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
        I can help you analyze data, send emails, track items, manage vendors and copackers, and more.
        What would you like to do?
      </p>
      <div className="grid grid-cols-2 gap-2 w-full max-w-md">
        {quickActions.map((action, idx) => (
          <QuickAction
            key={idx}
            icon={action.icon}
            label={action.label}
            onClick={() => onQuickAction(action.message)}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================
// MAIN FLOATING ASSISTANT COMPONENT
// ============================================

export function FloatingAIAssistant() {
  const {
    isOpen,
    isMinimized,
    isLoading,
    currentConversation,
    closeAssistant,
    toggleAssistant,
    minimizeAssistant,
    maximizeAssistant,
    sendMessage,
    clearConversation,
    startNewConversation,
  } = useAIAgent();

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [currentConversation?.messages]);

  // Focus input when assistant opens
  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input.trim();
    setInput('');
    await sendMessage(message);
  }, [input, isLoading, sendMessage]);

  const handleQuickAction = useCallback(async (message: string) => {
    await sendMessage(message);
  }, [sendMessage]);

  const handleSuggestionClick = useCallback(async (suggestion: string) => {
    await sendMessage(suggestion);
  }, [sendMessage]);

  const messages = currentConversation?.messages || [];
  const hasMessages = messages.length > 0;

  // Floating button when closed
  if (!isOpen) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleAssistant}
              className="fixed bottom-6 right-6 h-11 w-11 rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:opacity-90 flex items-center justify-center z-50"
            >
              <Bot className="h-6 w-6" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>AI Assistant (Ctrl+J)</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Minimized state
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={maximizeAssistant}
          className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-full bg-card border shadow-lg transition-all hover:bg-accent"
        >
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-medium">AI Assistant</span>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          <Maximize2 className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  // Full assistant panel
  return (
    <div className="fixed bottom-6 right-6 w-[420px] h-[600px] max-h-[calc(100vh-6rem)] bg-card border rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">AI Assistant</h3>
            <p className="text-xs text-muted-foreground">
              {isLoading ? 'Thinking...' : 'Ready to help'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {hasMessages && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={startNewConversation}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New conversation</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={minimizeAssistant}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={closeAssistant}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-hidden" ref={scrollRef}>
        {!hasMessages ? (
          <EmptyState onQuickAction={handleQuickAction} />
        ) : (
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {messages.filter(m => m.role !== 'system').map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onSuggestionClick={handleSuggestionClick}
                />
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div className="rounded-lg bg-muted px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">Processing...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t bg-background/50 p-3">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about your business..."
            disabled={isLoading}
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <Button type="submit" size="icon" disabled={!input.trim() || isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
        <p className="text-[10px] text-muted-foreground mt-2 text-center">
          Press Ctrl+J to toggle | Esc to close
        </p>
      </div>
    </div>
  );
}

// ============================================
// AI TRIGGER BUTTON (for embedding in other components)
// ============================================

interface AITriggerButtonProps {
  message?: string;
  label?: string;
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export function AITriggerButton({
  message,
  label = 'Ask AI',
  variant = 'outline',
  size = 'sm',
  className,
}: AITriggerButtonProps) {
  const { openAssistant, sendMessage } = useAIAgent();

  const handleClick = useCallback(async () => {
    openAssistant();
    if (message) {
      // Small delay to ensure assistant is open
      setTimeout(() => {
        sendMessage(message);
      }, 100);
    }
  }, [openAssistant, sendMessage, message]);

  return (
    <Button
      variant={variant}
      size={size}
      className={cn('gap-2', className)}
      onClick={handleClick}
    >
      <Sparkles className="h-4 w-4" />
      {label}
    </Button>
  );
}

// ============================================
// AI CONTEXT MENU ITEM
// ============================================

interface AIContextActionProps {
  label: string;
  message: string;
  icon?: React.ReactNode;
}

export function AIContextAction({ label, message, icon }: AIContextActionProps) {
  const { openAssistant, sendMessage } = useAIAgent();

  const handleClick = useCallback(async () => {
    openAssistant();
    setTimeout(() => {
      sendMessage(message);
    }, 100);
  }, [openAssistant, sendMessage, message]);

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent"
    >
      {icon || <Sparkles className="h-4 w-4" />}
      {label}
    </button>
  );
}
