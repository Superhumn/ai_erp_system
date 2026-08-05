import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SpreadsheetTable, Column } from "@/components/SpreadsheetTable";
import { DetailSheet } from "@/components/DetailSheet";
import { TrendingUp, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";

// COGS-related keywords to identify COGS expenses
const COGS_KEYWORDS = [
  "cogs", "cost of goods", "cost of sales", "raw material", "freight",
  "customs", "duty", "shipping cost", "packaging", "manufacturing",
  "production cost", "ingredient", "landed cost",
];

function isCOGSTransaction(tx: any): boolean {
  const desc = (tx.description || "").toLowerCase();
  const ref = (tx.referenceType || "").toLowerCase();
  return COGS_KEYWORDS.some((kw) => desc.includes(kw)) ||
    ref === "purchase_order" || ref === "purchaseorder" ||
    ref === "cogs" || ref === "inventory";
}

const typeOptions = [
  { value: "journal", label: "Journal", color: "bg-muted text-muted-foreground" },
  { value: "invoice", label: "Invoice", color: "bg-primary/10 text-primary" },
  { value: "payment", label: "Payment", color: "bg-muted text-muted-foreground" },
  { value: "expense", label: "Expense", color: "bg-muted text-muted-foreground" },
  { value: "transfer", label: "Transfer", color: "bg-muted text-muted-foreground" },
  { value: "adjustment", label: "Adjustment", color: "bg-muted text-muted-foreground" },
];

const statusOptions = [
  { value: "draft", label: "Draft", color: "bg-muted text-muted-foreground" },
  { value: "posted", label: "Posted", color: "bg-muted text-muted-foreground" },
  { value: "void", label: "Void", color: "bg-[oklch(0.30_0.02_262)] text-white" },
  { value: "reconciled", label: "Reconciled", color: "bg-primary/10 text-primary" },
];

function TransactionSummaryBody({ tx }: { tx: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Date</div>
          <div className="font-medium">
            {tx.date ? format(new Date(tx.date), "MMM d, yyyy") : "—"}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Reference</div>
          <div className="font-mono text-sm">
            {tx.referenceType ? `${tx.referenceType} #${tx.referenceId ?? "—"}` : "—"}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 col-span-2">
          <div className="text-xs text-muted-foreground mb-1">Amount</div>
          <div className="font-mono text-lg font-semibold">
            {formatCurrency(tx.totalAmount)}
          </div>
        </div>
      </div>
      {tx.description && (
        <div>
          <h4 className="text-sm font-medium mb-1">Description</h4>
          <p className="text-sm text-muted-foreground bg-muted/30 rounded p-2 whitespace-pre-wrap">
            {tx.description}
          </p>
        </div>
      )}
    </div>
  );
}

export default function Transactions() {
  const [cogsOnly, setCogsOnly] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any | null>(null);

  const { data: transactions, isLoading } = trpc.transactions.list.useQuery();

  const filteredTransactions = useMemo(
    () => (cogsOnly ? (transactions || []).filter(isCOGSTransaction) : transactions || []),
    [transactions, cogsOnly],
  );

  const columns: Column<any>[] = [
    { key: "transactionNumber", header: "Transaction #", type: "text", sortable: true },
    { key: "date", header: "Date", type: "date", sortable: true },
    {
      key: "description",
      header: "Description",
      type: "text",
      render: (_row, val) => {
        const s = typeof val === "string" ? val : "";
        return s.length > 60 ? s.slice(0, 60) + "…" : s || "—";
      },
    },
    { key: "type", header: "Type", type: "badge", options: typeOptions, filterable: true },
    { key: "referenceType", header: "Reference", type: "text" },
    { key: "totalAmount", header: "Amount", type: "currency", sortable: true },
    { key: "status", header: "Status", type: "status", options: statusOptions, filterable: true },
  ];

  const selectedStatus = selectedTx
    ? statusOptions.find((s) => s.value === selectedTx.status)
    : null;
  const selectedType = selectedTx
    ? typeOptions.find((t) => t.value === selectedTx.type)
    : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-8 w-8" />
            Transactions
          </h1>
          <p className="text-muted-foreground mt-1">
            View all financial transactions — click any row for details.
          </p>
        </div>
        <button
          type="button"
          aria-pressed={cogsOnly}
          onClick={() => setCogsOnly(!cogsOnly)}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border transition-colors ${
            cogsOnly
              ? "border-primary bg-primary/10 text-primary"
              : "border-muted hover:border-muted-foreground/50 text-muted-foreground"
          }`}
        >
          <DollarSign className="h-3.5 w-3.5" />
          COGS Only
        </button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <SpreadsheetTable
            data={filteredTransactions as any[]}
            columns={columns}
            isLoading={isLoading}
            emptyMessage="No transactions yet — they appear as you record invoices and payments."
            showSearch
            showFilters
            showExport
            onRowClick={(row) => setSelectedTx(row)}
            expandedRowId={selectedTx?.id ?? null}
            compact
          />
        </CardContent>
      </Card>

      <DetailSheet
        open={!!selectedTx}
        onOpenChange={(o) => !o && setSelectedTx(null)}
        width="md"
        title={
          selectedTx && (
            <span className="flex items-center gap-2 font-mono">
              {selectedTx.transactionNumber}
              {selectedStatus && <Badge className={selectedStatus.color}>{selectedStatus.label}</Badge>}
            </span>
          )
        }
        subtitle={selectedType?.label}
      >
        {selectedTx && <TransactionSummaryBody tx={selectedTx} />}
      </DetailSheet>
    </div>
  );
}
