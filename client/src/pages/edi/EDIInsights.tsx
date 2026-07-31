import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, AlertTriangle, TrendingUp, Sparkles } from "lucide-react";

function extractArray(result: any): any[] | null {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object") {
    for (const key of ["anomalies", "predictions", "items", "results"]) {
      if (Array.isArray(result[key])) return result[key];
    }
  }
  return null;
}

function renderItem(item: any, index: number) {
  if (item && typeof item === "object") {
    const title =
      item.title || item.name || item.type || item.label || `Result ${index + 1}`;
    const description =
      item.description || item.message || item.detail || item.reason || null;
    const severity = item.severity || item.level || item.confidence || null;
    return (
      <Card key={index}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium">{String(title)}</CardTitle>
            {severity != null && (
              <Badge variant="outline" className="text-xs">{String(severity)}</Badge>
            )}
          </div>
          {description != null && (
            <CardDescription className="text-xs">{String(description)}</CardDescription>
          )}
        </CardHeader>
        {!description && (
          <CardContent>
            <pre className="text-xs whitespace-pre-wrap break-words text-muted-foreground">
              {JSON.stringify(item, null, 2)}
            </pre>
          </CardContent>
        )}
      </Card>
    );
  }
  return (
    <Card key={index}>
      <CardContent className="py-3">
        <p className="text-sm">{String(item)}</p>
      </CardContent>
    </Card>
  );
}

function renderResult(result: any) {
  if (result == null) return null;

  const arr = extractArray(result);
  if (arr) {
    if (arr.length === 0) {
      return (
        <div className="text-center py-6 text-muted-foreground text-sm">
          No items returned.
        </div>
      );
    }
    return <div className="space-y-3">{arr.map((item, i) => renderItem(item, i))}</div>;
  }

  return (
    <Card>
      <CardContent className="py-4">
        <pre className="text-xs whitespace-pre-wrap break-words text-muted-foreground">
          {JSON.stringify(result, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}

export default function EDIInsights() {
  const [anomalies, setAnomalies] = useState<any>(null);
  const [predictions, setPredictions] = useState<any>(null);

  const detect = trpc.ediAi.detectAnomalies.useMutation({
    onSuccess: (d) => setAnomalies(d as any),
    onError: (e) => toast.error(e.message),
  });

  const predict = trpc.ediAi.predictErrors.useMutation({
    onSuccess: (d) => setPredictions(d as any),
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.02em]">EDI AI Insights</h1>
        <p className="text-muted-foreground">
          Detect anomalies and predict errors across your EDI transactions.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Anomaly Detection */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Anomaly Detection</CardTitle>
              </div>
              <Button onClick={() => detect.mutate()} disabled={detect.isPending}>
                {detect.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Run
                  </>
                )}
              </Button>
            </div>
            <CardDescription>
              Scan recent EDI activity for unusual patterns, outliers, and unexpected changes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {detect.isPending ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : anomalies == null ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>Run anomaly detection to see results.</p>
              </div>
            ) : (
              renderResult(anomalies)
            )}
          </CardContent>
        </Card>

        {/* Error Prediction */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Error Prediction</CardTitle>
              </div>
              <Button onClick={() => predict.mutate()} disabled={predict.isPending}>
                {predict.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Predicting...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Run
                  </>
                )}
              </Button>
            </div>
            <CardDescription>
              Forecast likely transaction failures and validation errors before they happen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {predict.isPending ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : predictions == null ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>Run error prediction to see results.</p>
              </div>
            ) : (
              renderResult(predictions)
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
