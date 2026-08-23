import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Brain, Scale, FileSearch, AlertTriangle, Shield, Loader2,
} from "lucide-react";

export default function LegalAI() {
  const [activeTab, setActiveTab] = useState("contract");
  const [contractId, setContractId] = useState("");

  const contractMutation = trpc.legalAi.analyzeContract.useMutation();
  const clauseMutation = trpc.legalAi.extractClauses.useMutation();
  const disputeMutation = trpc.legalAi.predictDisputes.useMutation();
  const complianceMutation = trpc.legalAi.checkCompliance.useMutation();

  const severityColor = (s: string) => {
    switch (s) { case "critical": case "high": return "destructive"; case "medium": return "secondary"; default: return "outline"; }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Brain className="h-8 w-8 text-primary" />
          Legal AI Analytics
        </h1>
        <p className="text-muted-foreground mt-1">
          AI-powered contract analysis, risk flagging, and compliance monitoring
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="contract">Contract Analysis</TabsTrigger>
          <TabsTrigger value="disputes">Dispute Prediction</TabsTrigger>
          <TabsTrigger value="compliance">Compliance Check</TabsTrigger>
        </TabsList>

        <TabsContent value="contract" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileSearch className="h-5 w-5" /> Contract Analysis</CardTitle>
              <CardDescription>Analyze a specific contract for risks, key terms, and missing clauses</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Enter contract ID"
                  value={contractId}
                  onChange={(e) => setContractId(e.target.value)}
                  className="w-48"
                />
                <Button
                  onClick={() => {
                    const id = parseInt(contractId);
                    if (id > 0) {
                      contractMutation.mutate({ contractId: id });
                      clauseMutation.mutate({ contractId: id });
                    }
                  }}
                  disabled={contractMutation.isPending || !contractId}
                >
                  {contractMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSearch className="mr-2 h-4 w-4" />}
                  Analyze Contract
                </Button>
              </div>

              {contractMutation.data && (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center gap-4">
                    <span className="text-sm">Risk Score:</span>
                    <Progress value={contractMutation.data.riskScore} className="w-48" />
                    <Badge variant={severityColor(contractMutation.data.riskLevel)}>{contractMutation.data.riskLevel}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{contractMutation.data.summary}</p>

                  {contractMutation.data.keyTerms.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Key Terms</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Term</TableHead>
                            <TableHead>Value</TableHead>
                            <TableHead>Favorability</TableHead>
                            <TableHead>Notes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {contractMutation.data.keyTerms.map((t, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{t.term}</TableCell>
                              <TableCell>{t.value}</TableCell>
                              <TableCell>
                                <Badge variant={t.favorability === "unfavorable" ? "destructive" : t.favorability === "favorable" ? "default" : "outline"}>
                                  {t.favorability}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">{t.notes}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {contractMutation.data.risks.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Risks</h4>
                      {contractMutation.data.risks.map((r, i) => (
                        <div key={i} className="p-3 rounded border mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant={severityColor(r.severity)}>{r.severity}</Badge>
                            <span className="font-medium text-sm">{r.category}</span>
                          </div>
                          <p className="text-sm mt-1">{r.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">Mitigation: {r.mitigation}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {contractMutation.data.missingClauses.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-foreground" /> Missing Clauses</h4>
                      <ul className="list-disc pl-5 text-sm space-y-1">
                        {contractMutation.data.missingClauses.map((c, i) => <li key={i}>{c}</li>)}
                      </ul>
                    </div>
                  )}

                  {contractMutation.data.recommendations.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Recommendations</h4>
                      <ul className="list-disc pl-5 text-sm space-y-1">
                        {contractMutation.data.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {clauseMutation.data && clauseMutation.data.clauses.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-medium mb-2">Extracted Clauses</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Importance</TableHead>
                        <TableHead>Text</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clauseMutation.data.clauses.map((c, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{c.type}</TableCell>
                          <TableCell><Badge variant={c.importance === "critical" ? "destructive" : c.importance === "important" ? "secondary" : "outline"}>{c.importance}</Badge></TableCell>
                          <TableCell className="max-w-md text-sm">{c.text.slice(0, 200)}{c.text.length > 200 ? "..." : ""}</TableCell>
                          <TableCell className="text-sm">{c.notes}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="disputes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Scale className="h-5 w-5" /> Dispute Prediction</CardTitle>
              <CardDescription>Predict dispute risks across active contracts</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => disputeMutation.mutate({})} disabled={disputeMutation.isPending}>
                {disputeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Scale className="mr-2 h-4 w-4" />}
                Predict Disputes
              </Button>

              {disputeMutation.data && (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center gap-4">
                    <span className="text-sm">Overall Dispute Risk:</span>
                    <Progress value={disputeMutation.data.overallDisputeRisk} className="w-48" />
                    <span className="text-sm font-medium">{disputeMutation.data.overallDisputeRisk}%</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{disputeMutation.data.summary}</p>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Contract</TableHead>
                        <TableHead>Risk</TableHead>
                        <TableHead>Likely Areas</TableHead>
                        <TableHead>Preventive Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {disputeMutation.data.predictions.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{p.contractTitle}</TableCell>
                          <TableCell>
                            <Badge variant={p.disputeRiskPercent > 50 ? "destructive" : p.disputeRiskPercent > 25 ? "secondary" : "outline"}>
                              {p.disputeRiskPercent}%
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs text-sm">{p.likelyDisputeAreas.join(", ")}</TableCell>
                          <TableCell className="max-w-xs text-sm">{p.preventiveActions.join("; ")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Compliance Monitoring</CardTitle>
              <CardDescription>AI-powered compliance status assessment</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => complianceMutation.mutate({})} disabled={complianceMutation.isPending}>
                {complianceMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Shield className="mr-2 h-4 w-4" />}
                Check Compliance
              </Button>

              {complianceMutation.data && (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center gap-4">
                    <span className="text-sm">Compliance Score:</span>
                    <Progress value={complianceMutation.data.overallComplianceScore} className="w-48" />
                    <span className="text-sm font-medium">{complianceMutation.data.overallComplianceScore}/100</span>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Area</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Required Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {complianceMutation.data.checks.map((c, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{c.area}</TableCell>
                          <TableCell>
                            <Badge variant={c.status === "non_compliant" ? "destructive" : c.status === "at_risk" ? "secondary" : "outline"}>
                              {c.status.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs text-sm">{c.description}</TableCell>
                          <TableCell className="text-sm">{c.requiredAction || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
