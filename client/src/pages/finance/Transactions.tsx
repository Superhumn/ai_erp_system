import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { ListPager } from "@/components/ListPager";
import { usePagedList } from "@/hooks/usePagedList";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SpreadsheetTable, Column } from "@/components/SpreadsheetTable";
import { DetailSheet } from "@/components/DetailSheet";
import { TrendingUp, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";

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

// Table column → transactions.listPaged sortBy. Sorting runs on the server across every
// page, so only indexed columns are sortable.
const TRANSACTION_SORT_KEYS: Record<string, "date" | "totalAmount"> = {
  date: "date",
  totalAmount: "totalAmount",
};

export default function Transactions() {
  const [cogsOnly, setCogsOnly] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any | null>(null);

  // Paged on the server, COGS filter included: a full-table load failed outright at ~2M rows.
  const [tableFilters, setTableFilters] = useState<Record<string, string>>({});
  const typeFilter = tableFilters.type && tableFilters.type !== "all" ? tableFilters.type : undefined;
  const statusFilter = tableFilters.status && tableFilters.status !== "all" ? tableFilters.status : undefined;
  const paging = usePagedList(`${typeFilter ?? ""}|${statusFilter ?? ""}|${cogsOnly}`);
  const { data: txPage, isLoading } = trpc.transactions.listPaged.useQuery({
    ...paging.query,
    type: typeFilter,
    status: statusFilter,
    cogsOnly: cogsOnly || undefined,
    ...(paging.sort && TRANSACTION_SORT_KEYS[paging.sort.key]
      ? { sortBy: TRANSACTION_SORT_KEYS[paging.sort.key], sortDir: paging.sort.dir }
      : {}),
  });
  const filteredTransactions = txPage?.rows ?? [];
  useEffect(() => paging.clampTo(txPage?.total), [txPage?.total]);

  const columns: Column<any>[] = [
    { key: "transactionNumber", header: "Transaction #", type: "text" },
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
            searchValue={paging.searchInput}
            onSearchChange={paging.setSearchInput}
            searchPlaceholder="Search #, description or reference…"
            filterValues={tableFilters}
            onFiltersChange={setTableFilters}
            sort={paging.sort ?? { key: null, dir: "asc" }}
            onSortChange={paging.setSort}
            onRowClick={(row) => setSelectedTx(row)}
            expandedRowId={selectedTx?.id ?? null}
            compact
          />
          <ListPager
            page={paging.page}
            pageSize={paging.pageSize}
            total={txPage?.total ?? 0}
            onPageChange={paging.setPage}
            onPageSizeChange={paging.setPageSize}
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
