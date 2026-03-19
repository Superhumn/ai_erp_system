import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Sparkles,
  Plus,
  RefreshCw,
  Loader2,
  TrendingUp,
  TrendingDown,
  Brain,
  BarChart3,
  ArrowRight,
  Lightbulb,
} from "lucide-react";

export default function ScenarioPlanning() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useState<number | null>(null);
  const [newScenario, setNewScenario] = useState({
    name: "",
    type: "custom",
    revenueGrowthPct: "10",
    cogsChangePct: "0",
    marketingSpendPct: "15",
    headcountChange: "0",
    description: "",
  });

  // Queries
  const { data: scenarios, refetch: refetchScenarios } = trpc.fpa.scenarios.list.useQuery();

  // Mutations
  const createScenarioMutation = trpc.fpa.scenarios.create.useMutation({
    onSuccess: () => {
      toast.success("Scenario created successfully.");
      refetchScenarios();
      setShowCreateDialog(false);
      setNewScenario({
        name: "",
        type: "custom",
        revenueGrowthPct: "10",
        cogsChangePct: "0",
        marketingSpendPct: "15",
        headcountChange: "0",
        description: "",
      });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const generateAIMutation = trpc.fpa.scenarios.generateAI.useMutation({
    onSuccess: () => {
      toast.success("AI scenario generated with projected financials.");
      refetchScenarios();
      setIsGeneratingAI(false);
    },
    onError: (error) => {
      toast.error(error.message);
      setIsGeneratingAI(false);
    },
  });

  const handleCreate = () => {
    createScenarioMutation.mutate({
      name: newScenario.name,
      type: newScenario.type,
      assumptions: {
        revenueGrowthPct: parseFloat(newScenario.revenueGrowthPct),
        cogsChangePct: parseFloat(newScenario.cogsChangePct),
        marketingSpendPct: parseFloat(newScenario.marketingSpendPct),
        headcountChange: parseInt(newScenario.headcountChange),
      },
      description: newScenario.description,
    });
  };

  const handleGenerateAI = () => {
    setIsGeneratingAI(true);
    generateAIMutation.mutate({});
  };

  const formatCurrency = (value: number | string | null | undefined) => {
    const num = Number(value) || 0;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  const getTypeBadge = (type: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      base: { variant: "default", label: "Base" },
      optimistic: { variant: "default", label: "Optimistic" },
      pessimistic: { variant: "destructive", label: "Pessimistic" },
      custom: { variant: "outline", label: "Custom" },
      ai_generated: { variant: "secondary", label: "AI Generated" },
    };
    const c = config[type] || { variant: "secondary", label: type };
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  const selectedScenario = scenarios?.find((s: any) => s.id === selectedScenarioId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Scenario Planning</h1>
          <p className="text-muted-foreground">
            Model financial scenarios and compare projected outcomes
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetchScenarios()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleGenerateAI} disabled={isGeneratingAI}>
            {isGeneratingAI ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate AI Scenario
              </>
            )}
          </Button>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Scenario
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Financial Scenario</DialogTitle>
                <DialogDescription>
                  Define assumptions to model a financial scenario and project P&L outcomes.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Scenario Name</Label>
                  <Input
                    placeholder="Q2 Growth Scenario"
                    value={newScenario.name}
                    onChange={(e) => setNewScenario({ ...newScenario, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Scenario Type</Label>
                  <Select
                    value={newScenario.type}
                    onValueChange={(v) => setNewScenario({ ...newScenario, type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="base">Base</SelectItem>
                      <SelectItem value="optimistic">Optimistic</SelectItem>
                      <SelectItem value="pessimistic">Pessimistic</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Revenue Growth %</Label>
                    <Input
                      type="number"
                      value={newScenario.revenueGrowthPct}
                      onChange={(e) =>
                        setNewScenario({ ...newScenario, revenueGrowthPct: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>COGS Change %</Label>
                    <Input
                      type="number"
                      value={newScenario.cogsChangePct}
                      onChange={(e) =>
                        setNewScenario({ ...newScenario, cogsChangePct: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Marketing Spend %</Label>
                    <Input
                      type="number"
                      value={newScenario.marketingSpendPct}
                      onChange={(e) =>
                        setNewScenario({ ...newScenario, marketingSpendPct: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Headcount Change</Label>
                    <Input
                      type="number"
                      value={newScenario.headcountChange}
                      onChange={(e) =>
                        setNewScenario({ ...newScenario, headcountChange: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    placeholder="Optional description of scenario assumptions"
                    value={newScenario.description}
                    onChange={(e) =>
                      setNewScenario({ ...newScenario, description: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={createScenarioMutation.isPending || !newScenario.name}
                >
                  {createScenarioMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Scenario"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Scenarios List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Financial Scenarios
          </CardTitle>
          <CardDescription>
            Compare different financial scenarios and their projected outcomes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scenarios && scenarios.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scenario</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">COGS</TableHead>
                  <TableHead className="text-right">Gross Profit</TableHead>
                  <TableHead className="text-right">OpEx</TableHead>
                  <TableHead className="text-right">EBITDA</TableHead>
                  <TableHead className="text-right">Net Income</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scenarios.map((scenario: any) => {
                  const netIncome = Number(scenario.projectedNetIncome) || 0;
                  return (
                    <TableRow key={scenario.id}>
                      <TableCell className="font-medium">{scenario.name}</TableCell>
                      <TableCell>{getTypeBadge(scenario.type)}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(scenario.projectedRevenue)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(scenario.projectedCogs)}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        {formatCurrency(scenario.projectedGrossProfit)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(scenario.projectedOpex)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(scenario.projectedEbitda)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium ${
                          netIncome >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        <div className="flex items-center justify-end gap-1">
                          {netIncome >= 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {formatCurrency(netIncome)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedScenarioId(scenario.id)}
                        >
                          <Brain className="h-4 w-4 mr-1" />
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No scenarios created yet.</p>
              <p className="text-sm">
                Create a scenario or generate one with AI to start planning.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scenario Detail / Comparison Cards */}
      {selectedScenario && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Scenario Detail: {selectedScenario.name}
              {getTypeBadge(selectedScenario.type)}
            </CardTitle>
            <CardDescription>
              {selectedScenario.description || "Projected P&L waterfall for this scenario."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Revenue</p>
                  <p className="text-lg font-bold">
                    {formatCurrency(selectedScenario.projectedRevenue)}
                  </p>
                </CardContent>
              </Card>
              <div className="flex items-center justify-center">
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">COGS</p>
                  <p className="text-lg font-bold text-red-600">
                    {formatCurrency(selectedScenario.projectedCogs)}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Gross Profit</p>
                  <p className="text-lg font-bold text-green-600">
                    {formatCurrency(selectedScenario.projectedGrossProfit)}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">EBITDA</p>
                  <p className="text-lg font-bold text-blue-600">
                    {formatCurrency(selectedScenario.projectedEbitda)}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Net Income</p>
                  <p
                    className={`text-lg font-bold ${
                      Number(selectedScenario.projectedNetIncome) >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {formatCurrency(selectedScenario.projectedNetIncome)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Assumptions */}
            {selectedScenario.assumptions && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Assumptions</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Revenue Growth: </span>
                    <span className="font-medium">
                      {selectedScenario.assumptions.revenueGrowthPct}%
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">COGS Change: </span>
                    <span className="font-medium">
                      {selectedScenario.assumptions.cogsChangePct}%
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Marketing Spend: </span>
                    <span className="font-medium">
                      {selectedScenario.assumptions.marketingSpendPct}%
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Headcount Change: </span>
                    <span className="font-medium">
                      {selectedScenario.assumptions.headcountChange}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* AI Analysis */}
            {selectedScenario.aiAnalysis && (
              <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="h-4 w-4 text-yellow-500" />
                  <h3 className="text-sm font-medium">AI Analysis</h3>
                </div>
                <p className="text-sm text-muted-foreground">{selectedScenario.aiAnalysis}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
