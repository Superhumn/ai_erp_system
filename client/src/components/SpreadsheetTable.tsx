import { useState, useMemo, useCallback, ReactNode } from "react";
import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  ChevronUp, 
  ChevronDown, 
  ChevronRight,
  MoreHorizontal, 
  Search,
  Filter,
  Download,
  Plus,
  ArrowUpDown,
  X,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";

export type ColumnType = "text" | "number" | "currency" | "date" | "status" | "badge" | "actions" | "checkbox";

export interface Column<T> {
  key: keyof T | string;
  header: string;
  type: ColumnType;
  width?: string;
  editable?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  options?: { value: string; label: string; color?: string }[];
  render?: (row: T, value: any) => React.ReactNode;
  format?: (value: any) => string;
}

export interface BulkAction {
  key: string;
  label: string;
  icon?: React.ReactNode;
  variant?: "default" | "destructive";
}

export interface SpreadsheetTableProps<T extends { id: number | string }> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  onCellEdit?: (rowId: number | string, key: string, value: any) => void;
  onRowAction?: (action: string, row: T) => void;
  actions?: { key: string; label: string; icon?: React.ReactNode }[];
  isLoading?: boolean;
  emptyMessage?: string;
  emptyAction?: React.ReactNode; // Custom action component for empty state
  showSearch?: boolean;
  showFilters?: boolean;
  showExport?: boolean;
  onAdd?: () => void;
  addLabel?: string;
  selectedRows?: Set<number | string>;
  onSelectionChange?: (selected: Set<number | string>) => void;
  stickyHeader?: boolean;
  compact?: boolean;
  maxHeight?: string;
  // Expandable row detail
  expandable?: boolean;
  renderExpanded?: (row: T, onClose: () => void) => ReactNode;
  expandedRowId?: number | string | null;
  onExpandChange?: (rowId: number | string | null) => void;
  // Bulk actions
  bulkActions?: BulkAction[];
  onBulkAction?: (action: string, selectedIds: Set<number | string>) => void;
  // Inline row creation
  enableInlineCreate?: boolean;
  onInlineCreate?: (rowData: Partial<T>) => void | Promise<void>;
  inlineCreatePlaceholder?: string;
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SpreadsheetTable<T extends { id: number | string }>({
  data,
  columns,
  onRowClick,
  onCellEdit,
  onRowAction,
  actions = [],
  isLoading = false,
  emptyMessage = "No data found",
  emptyAction,
  showSearch = true,
  showFilters = false,
  showExport = false,
  onAdd,
  addLabel = "Add",
  selectedRows,
  onSelectionChange,
  stickyHeader = true,
  compact = false,
  maxHeight = "calc(100vh - 300px)",
  expandable = false,
  renderExpanded,
  expandedRowId: controlledExpandedId,
  onExpandChange,
  bulkActions = [],
  onBulkAction,
  enableInlineCreate = false,
  onInlineCreate,
  inlineCreatePlaceholder = "Click to add...",
}: SpreadsheetTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [editingCell, setEditingCell] = useState<{ rowId: number | string; key: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [internalExpandedId, setInternalExpandedId] = useState<number | string | null>(null);
  const [isCreatingNewRow, setIsCreatingNewRow] = useState(false);
  const [newRowData, setNewRowData] = useState<Record<string, any>>({});

  // Use controlled or internal expanded state
  const expandedId = controlledExpandedId !== undefined ? controlledExpandedId : internalExpandedId;
  const setExpandedId = onExpandChange || setInternalExpandedId;

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }, [sortKey, sortDir]);

  const filteredData = useMemo(() => {
    let result = [...data];

    // Apply search
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter((row) =>
        columns.some((col) => {
          const value = (row as any)[col.key];
          return value?.toString().toLowerCase().includes(searchLower);
        })
      );
    }

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== "all") {
        result = result.filter((row) => (row as any)[key] === value);
      }
    });

    // Apply sort
    if (sortKey) {
      result.sort((a, b) => {
        const aVal = (a as any)[sortKey];
        const bVal = (b as any)[sortKey];
        if (aVal === bVal) return 0;
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        const comparison = aVal < bVal ? -1 : 1;
        return sortDir === "asc" ? comparison : -comparison;
      });
    }

    return result;
  }, [data, search, filters, sortKey, sortDir, columns]);

  const startEdit = (rowId: number | string, key: string, currentValue: any) => {
    setEditingCell({ rowId, key });
    setEditValue(currentValue?.toString() || "");
  };

  const commitEdit = () => {
    if (editingCell && onCellEdit) {
      onCellEdit(editingCell.rowId, editingCell.key, editValue);
    }
    setEditingCell(null);
    setEditValue("");
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      commitEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  };

  const startNewRow = () => {
    setIsCreatingNewRow(true);
    setNewRowData({});
  };

  const cancelNewRow = () => {
    setIsCreatingNewRow(false);
    setNewRowData({});
  };

  const updateNewRowField = (key: string, value: any) => {
    setNewRowData((prev) => ({ ...prev, [key]: value }));
  };

  const commitNewRow = async () => {
    if (!onInlineCreate) return;
    
    // Check if at least one field is filled
    const hasData = Object.values(newRowData).some((v) => v !== "" && v !== null && v !== undefined);
    if (!hasData) {
      cancelNewRow();
      return;
    }

    try {
      await onInlineCreate(newRowData as Partial<T>);
      setIsCreatingNewRow(false);
      setNewRowData({});
    } catch (error) {
      // Error handling is left to the parent component
      console.error("Failed to create row:", error);
    }
  };

  const toggleRowSelection = (rowId: number | string) => {
    if (!onSelectionChange || !selectedRows) return;
    const newSelection = new Set(selectedRows);
    if (newSelection.has(rowId)) {
      newSelection.delete(rowId);
    } else {
      newSelection.add(rowId);
    }
    onSelectionChange(newSelection);
  };

  const toggleAllSelection = () => {
    if (!onSelectionChange) return;
    if (selectedRows?.size === filteredData.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(filteredData.map((row) => row.id)));
    }
  };

  const handleRowClick = (row: T, e: React.MouseEvent) => {
    // Don't expand if clicking on editable cell or action
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select')) {
      return;
    }

    if (expandable && renderExpanded) {
      setExpandedId(expandedId === row.id ? null : row.id);
    } else if (onRowClick) {
      onRowClick(row);
    }
  };

  const exportToCsv = () => {
    const headers = columns.filter(c => c.type !== "actions" && c.type !== "checkbox").map(c => c.header);
    const rows = filteredData.map(row => 
      columns
        .filter(c => c.type !== "actions" && c.type !== "checkbox")
        .map(col => {
          const value = (row as any)[col.key];
          if (col.type === "currency") return formatCurrency(value).replace("$", "");
          if (col.type === "date") return formatDate(value);
          return value?.toString() || "";
        })
    );
    
    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "export.csv";
    a.click();
  };

  // Helper to get nested value from object using dot notation
  const getNestedValue = (obj: any, path: string): any => {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
  };

  const renderCell = (row: T, col: Column<T>) => {
    const value = typeof col.key === 'string' && col.key.includes('.') 
      ? getNestedValue(row, col.key) 
      : (row as any)[col.key];
    const isEditing = editingCell?.rowId === row.id && editingCell?.key === col.key;

    if (col.render) {
      return col.render(row, value);
    }

    if (isEditing && col.editable) {
      if (col.type === "status" && col.options) {
        return (
          <Select value={editValue} onValueChange={(v) => { setEditValue(v); onCellEdit?.(row.id, col.key as string, v); setEditingCell(null); }}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {col.options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }
      return (
        <Input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          autoFocus
          className="h-7 text-xs"
          type={col.type === "number" || col.type === "currency" ? "number" : "text"}
        />
      );
    }

    switch (col.type) {
      case "checkbox":
        return (
          <input
            type="checkbox"
            checked={selectedRows?.has(row.id) || false}
            onChange={() => toggleRowSelection(row.id)}
            className="h-4 w-4 rounded border-gray-300"
          />
        );
      case "currency":
        return <span className="font-mono text-right">{formatCurrency(value)}</span>;
      case "date":
        return <span>{formatDate(value)}</span>;
      case "status":
      case "badge":
        const option = col.options?.find((o) => o.value === value);
        return (
          <Badge 
            variant="outline" 
            className={cn("text-xs", option?.color)}
          >
            {option?.label || value || "-"}
          </Badge>
        );
      case "actions":
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {actions.map((action) => (
                <DropdownMenuItem
                  key={action.key}
                  onClick={() => onRowAction?.(action.key, row)}
                >
                  {action.icon}
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      default:
        // Handle object values - don't try to render them directly
        if (value && typeof value === 'object') {
          return <span>-</span>;
        }
        return <span>{col.format ? col.format(value) : value?.toString() || "-"}</span>;
    }
  };

  const renderNewRowCell = (col: Column<T>) => {
    const value = newRowData[col.key as string] || "";

    // Skip rendering for non-editable columns
    if (col.type === "actions" || col.type === "checkbox") {
      return null;
    }

    if (col.type === "status" && col.options) {
      return (
        <Select 
          value={value} 
          onValueChange={(v) => updateNewRowField(col.key as string, v)}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder={inlineCreatePlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {col.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    return (
      <Input
        value={value}
        onChange={(e) => updateNewRowField(col.key as string, e.target.value)}
        placeholder={inlineCreatePlaceholder}
        className="h-7 text-xs"
        type={col.type === "number" || col.type === "currency" ? "number" : "text"}
      />
    );
  };

  const cellPadding = compact ? "px-1.5 py-0.5" : "px-2 py-1";
  const fontSize = compact ? "text-xs" : "text-sm";

  // Calculate total columns for expanded row
  const totalColumns = columns.length + (onSelectionChange ? 1 : 0) + (expandable ? 1 : 0);

  const hasSelection = selectedRows && selectedRows.size > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Bulk Actions Toolbar - shows when items are selected */}
      {hasSelection && bulkActions.length > 0 && (
        <div className="flex items-center gap-2 mb-3 p-2 bg-primary/5 border border-primary/20 rounded-lg animate-in slide-in-from-top-2">
          <span className="text-sm font-medium">
            {selectedRows.size} item{selectedRows.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex-1" />
          {bulkActions.map((action) => (
            <Button
              key={action.key}
              variant={action.variant === "destructive" ? "destructive" : "outline"}
              size="sm"
              onClick={() => onBulkAction?.(action.key, selectedRows)}
              className="h-7 text-xs"
            >
              {action.icon}
              {action.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelectionChange?.(new Set())}
            className="h-7 text-xs"
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {showSearch && (
          <div className="relative flex-1 min-w-[200px] max-w-[300px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        )}
        
        {showFilters && columns.filter(c => c.filterable && c.options).map((col) => (
          <Select
            key={col.key as string}
            value={filters[col.key as string] || "all"}
            onValueChange={(v) => setFilters({ ...filters, [col.key as string]: v })}
          >
            <SelectTrigger className="w-[130px] h-8 text-sm">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue placeholder={col.header} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All {col.header}</SelectItem>
              {col.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}

        <div className="flex-1" />

        {showExport && (
          <Button variant="outline" size="sm" onClick={exportToCsv} className="h-8">
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
        )}

        {onAdd && (
          <Button size="sm" onClick={onAdd} className="h-8">
            <Plus className="h-4 w-4 mr-1" />
            {addLabel}
          </Button>
        )}
      </div>

      {/* Table */}
      <div 
        className="border rounded-lg overflow-auto bg-background"
        style={{ maxHeight }}
      >
        <table className="w-full border-collapse">
          <thead className={cn(stickyHeader && "sticky top-0 z-10 bg-muted/95 backdrop-blur")}>
            <tr className="border-b">
              {expandable && (
                <th className={cn(cellPadding, "w-8")} />
              )}
              {onSelectionChange && (
                <th className={cn(cellPadding, "w-10")}>
                  <input
                    type="checkbox"
                    checked={selectedRows?.size === filteredData.length && filteredData.length > 0}
                    onChange={toggleAllSelection}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key as string}
                  className={cn(
                    cellPadding,
                    fontSize,
                    "text-left font-medium text-muted-foreground whitespace-nowrap",
                    col.sortable && "cursor-pointer hover:text-foreground select-none"
                  )}
                  style={{ width: col.width }}
                  onClick={() => col.sortable && handleSort(col.key as string)}
                >
                  <div className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && sortKey === col.key && (
                      sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                    )}
                    {col.sortable && sortKey !== col.key && (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={totalColumns} className="text-center py-8 text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : filteredData.length === 0 ? (
              <tr>
                <td colSpan={totalColumns} className="text-center py-12 text-muted-foreground">
                  <div className="flex flex-col items-center gap-3">
                    <p>{emptyMessage}</p>
                    {emptyAction}
                  </div>
                </td>
              </tr>
            ) : (
              filteredData.map((row) => (
                <React.Fragment key={row.id}>
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b hover:bg-muted/50 transition-colors",
                      (expandable || onRowClick) && "cursor-pointer",
                      selectedRows?.has(row.id) && "bg-primary/5",
                      expandedId === row.id && "bg-muted/30 border-b-0"
                    )}
                    onClick={(e) => handleRowClick(row, e)}
                  >
                    {expandable && (
                      <td className={cn(cellPadding, "w-8")}>
                        <ChevronRight 
                          className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform",
                            expandedId === row.id && "rotate-90"
                          )} 
                        />
                      </td>
                    )}
                    {onSelectionChange && (
                      <td className={cn(cellPadding, "w-10")} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedRows?.has(row.id) || false}
                          onChange={() => toggleRowSelection(row.id)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={col.key as string}
                        className={cn(
                          cellPadding,
                          fontSize,
                          col.editable && "cursor-text hover:bg-muted/80",
                          col.type === "currency" && "text-right font-mono",
                          col.type === "actions" && "w-10"
                        )}
                        onClick={(e) => {
                          if (col.editable) {
                            e.stopPropagation();
                            startEdit(row.id, col.key as string, (row as any)[col.key]);
                          }
                        }}
                      >
                        {renderCell(row, col)}
                      </td>
                    ))}
                  </tr>
                  {/* Expanded Row Detail */}
                  {expandable && expandedId === row.id && renderExpanded && (
                    <tr key={`${row.id}-expanded`} className="bg-muted/20">
                      <td colSpan={totalColumns} className="p-0">
                        <div className="border-t border-b border-primary/20 bg-card">
                          <div className="p-4">
                            {renderExpanded(row, () => setExpandedId(null))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
            {/* Inline Create Row */}
            {enableInlineCreate && onInlineCreate && !isLoading && (
              isCreatingNewRow ? (
                <tr className="border-b bg-primary/5">
                  {expandable && <td className={cn(cellPadding, "w-8")} />}
                  {onSelectionChange && <td className={cn(cellPadding, "w-10")} />}
                  {columns.map((col) => (
                    <td
                      key={col.key as string}
                      className={cn(
                        cellPadding,
                        fontSize,
                        col.type === "currency" && "text-right font-mono",
                        col.type === "actions" && "w-10"
                      )}
                    >
                      {col.type === "actions" ? (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={commitNewRow}
                            className="h-7 w-7 p-0 text-green-600 hover:text-green-700"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={cancelNewRow}
                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        renderNewRowCell(col)
                      )}
                    </td>
                  ))}
                </tr>
              ) : (
                <tr className="border-b hover:bg-muted/30 cursor-pointer" onClick={startNewRow}>
                  {expandable && <td className={cn(cellPadding, "w-8")} />}
                  {onSelectionChange && <td className={cn(cellPadding, "w-10")} />}
                  <td
                    colSpan={columns.length}
                    className={cn(cellPadding, fontSize, "text-muted-foreground italic text-center")}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Plus className="h-4 w-4" />
                      <span>{inlineCreatePlaceholder}</span>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
        <span>{filteredData.length} of {data.length} rows</span>
        {selectedRows && selectedRows.size > 0 && (
          <span>{selectedRows.size} selected</span>
        )}
      </div>
    </div>
  );
}

export default SpreadsheetTable;
