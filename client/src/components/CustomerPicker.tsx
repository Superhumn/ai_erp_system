import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SEARCH_DEBOUNCE_MS = 300;
const RESULT_LIMIT = 50;

type Props = {
  /** Selected customer id; 0 / null / undefined = none. */
  value: number | null | undefined;
  onChange: (id: number) => void;
  /** Show the email next to each name. */
  showEmail?: boolean;
  placeholder?: string;
};

/**
 * Customer select that searches on the server instead of loading every customer.
 * Shows the first 50 matches by name; typing narrows them. The selected customer stays
 * listed even when the current search no longer matches it.
 */
export function CustomerPicker({ value, onChange, showEmail, placeholder = "Select customer" }: Props) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data } = trpc.customers.listPaged.useQuery({
    search: search || undefined,
    limit: RESULT_LIMIT,
    sortBy: "name",
    sortDir: "asc",
  });
  const rows = data?.rows ?? [];
  const selectedId = value || 0;
  const selectedOnPage = rows.some((c) => c.id === selectedId);
  const { data: selected } = trpc.customers.get.useQuery(
    { id: selectedId },
    { enabled: selectedId > 0 && !selectedOnPage },
  );

  const options = useMemo(() => {
    if (!selectedId || selectedOnPage || !selected) return rows;
    return [selected, ...rows];
  }, [rows, selected, selectedId, selectedOnPage]);

  return (
    <div className="space-y-1">
      <Input
        placeholder="Search customers..."
        aria-label="Search customers"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className="h-8 text-sm"
      />
      <Select value={selectedId ? String(selectedId) : ""} onValueChange={(v) => onChange(parseInt(v))}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.name}
              {showEmail && c.email ? ` (${c.email})` : ""}
            </SelectItem>
          ))}
          {options.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">No matching customers</div>
          )}
        </SelectContent>
      </Select>
      {data && data.total > rows.length && (
        <p className="text-xs text-muted-foreground">
          Showing {rows.length} of {data.total.toLocaleString()}. Type to narrow.
        </p>
      )}
    </div>
  );
}
