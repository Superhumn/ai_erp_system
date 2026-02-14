import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAIAgent } from "@/contexts/AIAgentContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLocation } from "wouter";
import {
  Bot,
  Sparkles,
  BarChart3,
  Package,
  Users,
  Truck,
  Mail,
  DollarSign,
  ShoppingCart,
  Factory,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Zap,
  Brain,
  MessageSquare,
  ClipboardList,
  Search,
  FileText,
  Activity,
  Target,
  Eye,
} from "lucide-react";

function formatCurrency(value: number | string | null | undefined) {
  const num = typeof value === "string" ? parseFloat(value) : (value || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
}

// ============================================
// STAT CARD
// ============================================

function StatCard({
  title, value, icon: Icon, description, color, loading, onClick,
}: {
  title: string; value: string | number; icon: React.ElementType; description?: string; color?: string; loading?: boolean; onClick?: () => void;
}) {
  return (
    <Card className={`${onClick ? "cursor-pointer hover:shadow-md transition-all hover:-translate-y-0.5" : ""}`} onClick={onClick}>
      <CardContent className="p-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-16" />
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{title}</p>
              <p className="text-2xl font-bold">{value}</p>
              {description && <p className="text-xs text-muted-foreground">{description}</p>}
            </div>
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${color || "bg-primary/10"}`}>
              <Icon className={`h-5 w-5 ${color?.includes("text-") ? "" : "text-primary"}`} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// SUGGESTED ACTION CARD
// ============================================

function SuggestedActionCard({
  type, title, description, priority, onClick,
}: {
  type: string; title: string; description: string; priority: string; onClick: () => void;
}) {
  const priorityColors: Record<string, string> = {
    high: "border-l-red-500",
    medium: "border-l-yellow-500",
    low: "border-l-blue-500",
  };

  const typeIcons: Record<string, React.ElementType> = {
    inventory: Package,
    procurement: ShoppingCart,
    approvals: ClipboardList,
    finance: DollarSign,
    production: Factory,
    freight: Truck,
  };

  const Icon = typeIcons[type] || AlertTriangle;

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-all border-l-4 ${priorityColors[priority] || "border-l-gray-500"}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-semibold truncate">{title}</p>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {priority}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// QUICK ANALYSIS CARD
// ============================================

function QuickAnalysisCard({
  icon: Icon, title, description, dataType, color,
}: {
  icon: React.ElementType; title: string; description: string; dataType: string; color: string;
}) {
  const { openAssistant, sendMessage } = useAIAgent();

  const handleClick = () => {
    openAssistant();
    setTimeout(() => {
      sendMessage(`Analyze ${dataType} data and provide detailed insights with recommendations`);
    }, 150);
  };

  return (
    <button
      onClick={handleClick}
      className="group text-left p-4 rounded-xl border bg-card hover:shadow-md transition-all hover:-translate-y-0.5"
    >
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center mb-3 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-semibold mb-1 group-hover:text-primary transition-colors">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  );
}

// ============================================
// AI CAPABILITY CARD
// ============================================

function AICapabilityCard({
  icon: Icon, title, description, examples, onExampleClick,
}: {
  icon: React.ElementType; title: string; description: string; examples: string[]; onExampleClick: (msg: string) => void;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        <div className="space-y-1.5 mt-3">
          {examples.map((example, idx) => (
            <button
              key={idx}
              onClick={() => onExampleClick(example)}
              className="w-full text-left text-xs px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex items-center gap-2"
            >
              <MessageSquare className="h-3 w-3 shrink-0" />
              <span className="truncate">{example}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// MAIN AI HUB PAGE
// ============================================

export default function AIHub() {
  const [, setLocation] = useLocation();
  const { openAssistant, sendMessage } = useAIAgent();
  const [activeTab, setActiveTab] = useState("overview");

  // Data queries
  const { data: metrics, isLoading: metricsLoading } = trpc.dashboard.metrics.useQuery();
  const { data: overview, isLoading: overviewLoading } = trpc.ai.systemOverview.useQuery();
  const { data: suggestions, isLoading: suggestionsLoading } = trpc.ai.suggestedActions.useQuery();
  const { data: pendingActions, isLoading: pendingLoading } = trpc.ai.pendingActions.useQuery();

  const handleAskAI = (message: string) => {
    openAssistant();
    setTimeout(() => sendMessage(message), 150);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Brain className="h-6 w-6 text-primary" />
            </div>
            AI Command Center
          </h1>
          <p className="text-muted-foreground mt-2">
            Your AI-powered hub for managing operations, analyzing data, and automating workflows.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLocation("/ai/approvals")}>
            <ClipboardList className="h-4 w-4 mr-2" />
            Approvals
            {pendingActions?.pendingApprovals ? (
              <Badge variant="destructive" className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
                {pendingActions.pendingApprovals}
              </Badge>
            ) : null}
          </Button>
          <Button onClick={() => openAssistant()}>
            <Sparkles className="h-4 w-4 mr-2" />
            Open Assistant
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <Activity className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="capabilities" className="gap-2">
            <Zap className="h-4 w-4" />
            Capabilities
          </TabsTrigger>
          <TabsTrigger value="analyze" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Quick Analysis
          </TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          {/* System Stats Row */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <StatCard
              title="Active Vendors"
              value={overview?.vendors?.active ?? 0}
              icon={Users}
              description={`${overview?.vendors?.total ?? 0} total`}
              color="bg-blue-500/10 text-blue-500"
              loading={overviewLoading}
              onClick={() => setLocation("/operations/vendors")}
            />
            <StatCard
              title="Active Customers"
              value={overview?.customers?.active ?? 0}
              icon={Users}
              description={`${overview?.customers?.total ?? 0} total`}
              color="bg-green-500/10 text-green-500"
              loading={overviewLoading}
              onClick={() => setLocation("/sales/customers")}
            />
            <StatCard
              title="Pending Orders"
              value={overview?.orders?.pending ?? 0}
              icon={ShoppingCart}
              description={`${overview?.orders?.total ?? 0} total`}
              color="bg-purple-500/10 text-purple-500"
              loading={overviewLoading}
              onClick={() => setLocation("/sales/orders")}
            />
            <StatCard
              title="Low Stock Items"
              value={overview?.inventory?.lowStock ?? 0}
              icon={Package}
              description={`${overview?.inventory?.totalItems ?? 0} tracked`}
              color="bg-orange-500/10 text-orange-500"
              loading={overviewLoading}
              onClick={() => handleAskAI("Show me all low stock items with reorder recommendations")}
            />
            <StatCard
              title="Pending POs"
              value={overview?.procurement?.pending ?? 0}
              icon={FileText}
              description={`${overview?.procurement?.totalPOs ?? 0} total`}
              color="bg-indigo-500/10 text-indigo-500"
              loading={overviewLoading}
              onClick={() => setLocation("/operations/purchase-orders")}
            />
            <StatCard
              title="Active Work Orders"
              value={overview?.production?.inProgress ?? 0}
              icon={Factory}
              description={`${overview?.production?.totalWorkOrders ?? 0} total`}
              color="bg-pink-500/10 text-pink-500"
              loading={overviewLoading}
              onClick={() => setLocation("/operations/work-orders")}
            />
          </div>

          {/* Suggested Actions + Pending Approvals */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    AI Suggestions
                  </h2>
                  <p className="text-sm text-muted-foreground">Recommended actions based on your current data</p>
                </div>
              </div>

              {suggestionsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : suggestions && suggestions.length > 0 ? (
                <div className="space-y-3">
                  {suggestions.map((suggestion: any, idx: number) => (
                    <SuggestedActionCard
                      key={idx}
                      type={suggestion.type}
                      title={suggestion.title}
                      description={suggestion.description}
                      priority={suggestion.priority}
                      onClick={() => handleAskAI(`Help me address this: ${suggestion.title} - ${suggestion.description}`)}
                    />
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-8 text-center">
                    <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
                    <p className="text-sm font-medium">All clear!</p>
                    <p className="text-xs text-muted-foreground mt-1">No immediate actions needed</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Pending Approvals Panel */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Clock className="h-5 w-5 text-yellow-600" />
                  Pending Approvals
                </h2>
                <Button variant="ghost" size="sm" onClick={() => setLocation("/ai/approvals")}>
                  View All
                </Button>
              </div>

              <Card>
                <CardContent className="p-0">
                  {pendingLoading ? (
                    <div className="p-4 space-y-3">
                      {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                    </div>
                  ) : pendingActions?.tasks && pendingActions.tasks.length > 0 ? (
                    <ScrollArea className="max-h-[300px]">
                      <div className="divide-y">
                        {pendingActions.tasks.slice(0, 5).map((task: any) => {
                          const taskTypeLabels: Record<string, string> = {
                            generate_po: "Generate PO",
                            send_rfq: "Send RFQ",
                            send_email: "Send Email",
                            update_inventory: "Update Inventory",
                            vendor_followup: "Vendor Follow-up",
                            create_work_order: "Work Order",
                          };
                          return (
                            <div
                              key={task.id}
                              className="p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                              onClick={() => setLocation("/ai/approvals")}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-sm font-medium">{taskTypeLabels[task.taskType] || task.taskType}</p>
                                <Badge variant="outline" className="text-[10px]">{task.priority}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {task.aiReasoning?.slice(0, 60) || "Pending review"}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="p-6 text-center">
                      <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No pending approvals</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Quick AI Prompts */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Quick Actions
            </h2>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Show me overdue invoices and suggest follow-up actions", icon: DollarSign },
                { label: "Which vendors have pending purchase orders?", icon: Users },
                { label: "Analyze sales trends for the past month", icon: TrendingUp },
                { label: "Draft a follow-up email to vendors with overdue shipments", icon: Mail },
                { label: "What items need to be restocked?", icon: Package },
                { label: "Show copacker production status", icon: Factory },
                { label: "Generate a financial summary report", icon: BarChart3 },
                { label: "Track all active shipments", icon: Truck },
              ].map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAskAI(prompt.label)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-card hover:bg-muted transition-colors text-left"
                >
                  <prompt.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">{prompt.label}</span>
                </button>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* CAPABILITIES TAB */}
        <TabsContent value="capabilities" className="space-y-6 mt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <AICapabilityCard
              icon={BarChart3}
              title="Data Analysis"
              description="Analyze business data across all modules with AI-powered insights"
              examples={[
                "Analyze sales trends for last quarter",
                "Compare vendor performance metrics",
                "Show me financial health overview",
                "Which products are trending up?",
              ]}
              onExampleClick={handleAskAI}
            />
            <AICapabilityCard
              icon={Mail}
              title="Email Management"
              description="Draft, send, and manage emails to vendors, customers, and team"
              examples={[
                "Draft a follow-up email to vendor about PO delays",
                "Send a payment reminder to customers with overdue invoices",
                "Create an RFQ email for raw materials",
                "Draft an introduction email to a new supplier",
              ]}
              onExampleClick={handleAskAI}
            />
            <AICapabilityCard
              icon={Search}
              title="Item Tracking"
              description="Track inventory, orders, shipments, and purchase orders in real-time"
              examples={[
                "Track all pending shipments",
                "Where is purchase order PO-2024-001?",
                "Show me inventory levels for all warehouses",
                "Which orders are delayed?",
              ]}
              onExampleClick={handleAskAI}
            />
            <AICapabilityCard
              icon={Users}
              title="Vendor & Supplier Management"
              description="Manage vendor relationships, create POs, and monitor performance"
              examples={[
                "List all active vendors and their performance",
                "Create a purchase order for packaging materials",
                "Which vendors offer the best pricing?",
                "Search for vendors that supply organic ingredients",
              ]}
              onExampleClick={handleAskAI}
            />
            <AICapabilityCard
              icon={Factory}
              title="Copacker Management"
              description="Manage co-packers, production runs, and manufacturing workflows"
              examples={[
                "Show all co-packers and their current work orders",
                "Create a work order for contract manufacturing",
                "Track production progress for active batches",
                "Compare copacker performance and costs",
              ]}
              onExampleClick={handleAskAI}
            />
            <AICapabilityCard
              icon={FileText}
              title="Reports & Automation"
              description="Generate reports, create tasks, and automate recurring workflows"
              examples={[
                "Generate a vendor performance report",
                "Create an inventory status report",
                "Summarize all outstanding purchase orders",
                "What tasks need my approval?",
              ]}
              onExampleClick={handleAskAI}
            />
          </div>
        </TabsContent>

        {/* QUICK ANALYSIS TAB */}
        <TabsContent value="analyze" className="space-y-6 mt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <QuickAnalysisCard
              icon={TrendingUp}
              title="Sales Analysis"
              description="Revenue, order volume, and trends"
              dataType="sales"
              color="bg-green-500/10 text-green-500"
            />
            <QuickAnalysisCard
              icon={Package}
              title="Inventory Analysis"
              description="Stock levels, low stock alerts, and valuation"
              dataType="inventory"
              color="bg-blue-500/10 text-blue-500"
            />
            <QuickAnalysisCard
              icon={Users}
              title="Vendor Analysis"
              description="Vendor performance and spend breakdown"
              dataType="vendors"
              color="bg-purple-500/10 text-purple-500"
            />
            <QuickAnalysisCard
              icon={Users}
              title="Customer Analysis"
              description="Customer activity and order patterns"
              dataType="customers"
              color="bg-indigo-500/10 text-indigo-500"
            />
            <QuickAnalysisCard
              icon={DollarSign}
              title="Financial Analysis"
              description="Invoices, payments, and cash flow"
              dataType="finances"
              color="bg-emerald-500/10 text-emerald-500"
            />
            <QuickAnalysisCard
              icon={ShoppingCart}
              title="Order Analysis"
              description="Order status and fulfillment metrics"
              dataType="orders"
              color="bg-orange-500/10 text-orange-500"
            />
            <QuickAnalysisCard
              icon={ShoppingCart}
              title="Procurement Analysis"
              description="Purchase orders and procurement spend"
              dataType="procurement"
              color="bg-pink-500/10 text-pink-500"
            />
            <QuickAnalysisCard
              icon={Factory}
              title="Production Analysis"
              description="Work orders and manufacturing output"
              dataType="production"
              color="bg-amber-500/10 text-amber-500"
            />
          </div>

          {/* Custom Analysis */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Custom Analysis
              </CardTitle>
              <CardDescription>Ask any business question and get AI-powered analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  "What are my top 5 most profitable products?",
                  "Which customers haven't ordered in 30 days?",
                  "Show me vendor spend breakdown by category",
                  "What's the average order fulfillment time?",
                  "Which purchase orders are overdue?",
                  "Forecast next month's inventory needs",
                ].map((question, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAskAI(question)}
                    className="text-left text-sm px-4 py-3 rounded-lg border hover:bg-muted transition-colors flex items-center gap-2"
                  >
                    <Sparkles className="h-4 w-4 text-primary shrink-0" />
                    {question}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
