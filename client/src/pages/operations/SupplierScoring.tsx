import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Brain, BarChart3, Loader2 } from "lucide-react";

export default function SupplierScoring() {
  const scoreMutation = trpc.supplierScoring.scoreSuppliers.useMutation();

  const gradeColor = (grade: string) => {
    switch (grade) {
      case "A": return "bg-primary/10 text-primary";
      case "B": return "bg-muted text-foreground";
      case "C": return "bg-muted text-muted-foreground";
      case "D": return "bg-muted text-foreground font-semibold";
      case "F": return "bg-[oklch(0.30_0.02_262)] text-white";
      default: return "";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="h-8 w-8 text-muted-foreground" />
            AI Supplier Scoring
          </h1>
          <p className="text-muted-foreground mt-1">
            ML-based multi-dimensional supplier performance scoring
          </p>
        </div>
        <Button onClick={() => scoreMutation.mutate({})} disabled={scoreMutation.isPending} size="lg">
          {scoreMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BarChart3 className="mr-2 h-4 w-4" />}
          Score All Suppliers
        </Button>
      </div>

      {scoreMutation.data && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{scoreMutation.data.summary}</p>

          <div className="grid grid-cols-2 gap-4">
            {scoreMutation.data.topPerformers.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Top Performers</CardTitle></CardHeader>
                <CardContent>
                  {scoreMutation.data.topPerformers.map((n, i) => (
                    <Badge key={i} variant="outline" className="mr-1 mb-1 bg-muted">{n}</Badge>
                  ))}
                </CardContent>
              </Card>
            )}
            {scoreMutation.data.needsImprovement.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Needs Improvement</CardTitle></CardHeader>
                <CardContent>
                  {scoreMutation.data.needsImprovement.map((n, i) => (
                    <Badge key={i} variant="outline" className="mr-1 mb-1 bg-muted text-foreground font-semibold">{n}</Badge>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Overall</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead>Quality</TableHead>
                <TableHead>Pricing</TableHead>
                <TableHead>Responsiveness</TableHead>
                <TableHead>Compliance</TableHead>
                <TableHead>Trend</TableHead>
                <TableHead>Risk</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scoreMutation.data.scores.map((s, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{s.vendorName}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded text-sm font-bold ${gradeColor(s.grade)}`}>{s.grade}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={s.overallScore} className="w-16" />
                      <span className="text-sm">{s.overallScore}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{s.dimensions.delivery.score}</TableCell>
                  <TableCell className="text-sm">{s.dimensions.quality.score}</TableCell>
                  <TableCell className="text-sm">{s.dimensions.pricing.score}</TableCell>
                  <TableCell className="text-sm">{s.dimensions.responsiveness.score}</TableCell>
                  <TableCell className="text-sm">{s.dimensions.compliance.score}</TableCell>
                  <TableCell>
                    <Badge variant={s.trend === "improving" ? "default" : s.trend === "declining" ? "destructive" : "outline"}>
                      {s.trend}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.riskLevel === "high" ? "destructive" : s.riskLevel === "medium" ? "secondary" : "outline"}>
                      {s.riskLevel}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
