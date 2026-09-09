import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Loader2, RotateCcw, Play, Send, Ban } from "lucide-react";
import {
  ADJUSTMENT_REASON_CODES, ADJUSTMENT_REASON_LABELS,
  type AdjustmentReasonCode, type CycleCountStatus,
} from "@shared/inventoryAdjustments";
import { STATUS_LABELS, STATUS_VARIANTS, TYPE_LABELS } from "./cycleCountLabels";
import type { CycleCountType } from "@shared/inventoryAdjustments";

export function CycleCountDetail({ countId, onBack }: { countId: number; onBack: () => void }) {
  const utils = trpc.useUtils();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [reasons, setReasons] = useState<Record<number, AdjustmentReasonCode>>({});

  const { data: count, isLoading } = trpc.cycleCounts.getById.useQuery({ id: countId });

  const refresh = () => {
    utils.cycleCounts.getById.invalidate({ id: countId });
    utils.cycleCounts.list.invalidate();
    utils.inventory.list.invalidate();
  };

  const onError = (error: { message: string }) => toast.error(error.message);

  const generateMutation = trpc.cycleCounts.generateLines.useMutation({
    onSuccess: (r) => { toast.success(`${r.linesGenerated} line(s) snapshotted`); refresh(); },
    onError,
  });
  const startMutation = trpc.cycleCounts.start.useMutation({
    onSuccess: () => { toast.success("Count started"); refresh(); },
    onError,
  });
  const recordMutation = trpc.cycleCounts.recordLine.useMutation({
    onSuccess: () => { refresh(); },
    onError,
  });
  const recountMutation = trpc.cycleCounts.flagForRecount.useMutation({
    onSuccess: () => { toast.success("Flagged for recount"); refresh(); },
    onError,
  });
  const submitMutation = trpc.cycleCounts.submitForReview.useMutation({
    onSuccess: () => { toast.success("Submitted for review"); refresh(); },
    onError,
  });
  const approveMutation = trpc.cycleCounts.approve.useMutation({
    onSuccess: (r) => {
      toast.success(
        `${r.countNumber} approved — ${r.adjustmentsPosted} adjustment(s) posted` +
        (r.adjustmentsFailed > 0 ? `, ${r.adjustmentsFailed} failed` : ""),
      );
      refresh();
    },
    onError,
  });
  const cancelMutation = trpc.cycleCounts.cancel.useMutation({
    onSuccess: () => { toast.success("Count cancelled"); refresh(); },
    onError,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!count) {
    return (
      <div className="space-y-4 p-6">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
        <p className="text-sm text-muted-foreground">Count not found.</p>
      </div>
    );
  }

  const status = count.status as CycleCountStatus;
  const isDraft = status === "draft";
  const isCounting = status === "in_progress";
  const isReview = status === "pending_review";
  const isClosed = status === "approved" || status === "cancelled";
  const blindActive = count.blindCount && (isDraft || isCounting);

  const saveLine = (lineId: number) => {
    const raw = drafts[lineId];
    if (raw === undefined || raw === "") return;
    const countedQuantity = parseFloat(raw);
    if (!Number.isFinite(countedQuantity) || countedQuantity < 0) {
      toast.error("Counted quantity must be zero or greater.");
      return;
    }
    recordMutation.mutate({ lineId, countedQuantity, reasonCode: reasons[lineId] });
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="-ml-3" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />All counts
          </Button>
          <h1 className="font-mono text-2xl font-semibold">{count.countNumber}</h1>
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>
            <span className="text-sm text-muted-foreground">
              {TYPE_LABELS[count.countType as CycleCountType]}
            </span>
            {count.blindCount && <Badge variant="outline">Blind</Badge>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {isDraft && (
            <>
              <Button
                variant="outline"
                disabled={generateMutation.isPending}
                onClick={() => generateMutation.mutate({ countId })}
              >
                {generateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate lines
              </Button>
              <Button
                disabled={startMutation.isPending || count.lines.length === 0}
                onClick={() => startMutation.mutate({ id: countId })}
              >
                <Play className="mr-2 h-4 w-4" />Start counting
              </Button>
            </>
          )}
          {isCounting && (
            <Button
              disabled={submitMutation.isPending}
              onClick={() => submitMutation.mutate({ id: countId })}
            >
              <Send className="mr-2 h-4 w-4" />Submit for review
            </Button>
          )}
          {isReview && (
            <Button
              disabled={approveMutation.isPending}
              onClick={() => approveMutation.mutate({ id: countId })}
            >
              {approveMutation.isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Approve &amp; post
            </Button>
          )}
          {!isClosed && (
            <Button
              variant="outline"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate({ id: countId })}
            >
              <Ban className="mr-2 h-4 w-4" />Cancel
            </Button>
          )}
        </div>
      </div>

      {!blindActive && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile label="Lines" value={String(count.summary.totalLines)} />
          <SummaryTile
            label="Counted"
            value={`${count.summary.countedLines} / ${count.summary.totalLines}`}
          />
          <SummaryTile label="Accuracy" value={`${count.summary.accuracyPercent}%`} />
          <SummaryTile
            label="Net variance"
            value={formatCurrency(count.summary.netVarianceValue)}
            sub={`${formatCurrency(count.summary.absoluteVarianceValue)} absolute`}
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Count sheet</CardTitle>
          <CardDescription>
            {isDraft && count.lines.length === 0
              ? "Generate lines to snapshot current book quantities."
              : blindActive
              ? "Book quantity is hidden until this count reaches review."
              : "Variance is the counted quantity minus the book quantity at snapshot time."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {count.lines.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No lines yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Lot</TableHead>
                  {!blindActive && <TableHead className="text-right">Book</TableHead>}
                  <TableHead className="text-right">Counted</TableHead>
                  {!blindActive && <TableHead className="text-right">Variance</TableHead>}
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {count.lines.map((line) => {
                  const variance = line.variance !== null ? parseFloat(line.variance) : null;
                  const editable = (isCounting || isReview) && line.status !== "approved";
                  return (
                    <TableRow key={line.id}>
                      <TableCell className="font-mono">#{line.productId}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {line.lotId ? `#${line.lotId}` : "—"}
                      </TableCell>
                      {!blindActive && (
                        <TableCell className="text-right font-mono">{line.systemQuantity}</TableCell>
                      )}
                      <TableCell className="text-right">
                        {editable ? (
                          <Input
                            type="number"
                            className="ml-auto w-28 text-right font-mono"
                            value={drafts[line.id] ?? line.countedQuantity ?? ""}
                            onChange={(e) => setDrafts({ ...drafts, [line.id]: e.target.value })}
                            onBlur={() => saveLine(line.id)}
                            placeholder="—"
                          />
                        ) : (
                          <span className="font-mono">{line.countedQuantity ?? "—"}</span>
                        )}
                      </TableCell>
                      {!blindActive && (
                        <TableCell className="text-right font-mono">
                          {variance === null ? "—" : (
                            <span className={variance === 0
                              ? "text-muted-foreground"
                              : variance > 0 ? "text-emerald-600" : "text-destructive"}>
                              {variance > 0 ? `+${variance}` : variance}
                            </span>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        {editable && variance !== 0 ? (
                          <Select
                            value={reasons[line.id] ?? (line.reasonCode as AdjustmentReasonCode) ?? undefined}
                            onValueChange={(v) => {
                              const reasonCode = v as AdjustmentReasonCode;
                              setReasons({ ...reasons, [line.id]: reasonCode });
                              if (line.countedQuantity !== null) {
                                recordMutation.mutate({
                                  lineId: line.id,
                                  countedQuantity: parseFloat(line.countedQuantity),
                                  reasonCode,
                                });
                              }
                            }}
                          >
                            <SelectTrigger className="w-44"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              {ADJUSTMENT_REASON_CODES.map((code) => (
                                <SelectItem key={code} value={code}>
                                  {ADJUSTMENT_REASON_LABELS[code]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {line.reasonCode
                              ? ADJUSTMENT_REASON_LABELS[line.reasonCode as AdjustmentReasonCode]
                              : "—"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={line.status === "approved" ? "default" : "outline"}>
                          {line.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {editable && line.countedQuantity !== null && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDrafts({ ...drafts, [line.id]: "" });
                              recountMutation.mutate({ lineId: line.id });
                            }}
                          >
                            <RotateCcw className="mr-1 h-3.5 w-3.5" />Recount
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}
