import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search } from "lucide-react";

/**
 * Searchable multi-select over CRM contacts (crm.contacts.list). Contacts
 * without an email or opted out of email are shown but not selectable.
 * Used by the campaign recipient picker and the sequence enroll dialog.
 */
export function ContactMultiPicker({
  value,
  onChange,
  excludeIds,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
  /** Contacts already on the campaign/sequence; shown as such and not selectable. */
  excludeIds?: ReadonlySet<number>;
}) {
  const [search, setSearch] = useState("");
  const { data: contacts, isLoading } = trpc.crm.contacts.list.useQuery({ search: search.trim() || undefined, limit: 50 });
  const selected = new Set(value);

  const toggle = (id: number, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id); else next.delete(id);
    onChange(Array.from(next));
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
        <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts by name, email, company…" />
      </div>
      <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : !contacts?.length ? (
          <p className="text-sm text-muted-foreground text-center py-6">No contacts found</p>
        ) : (
          contacts.map((c) => {
            const already = excludeIds?.has(c.id) ?? false;
            const blocked = !c.email ? "no email" : c.optedOutEmail || c.status === "unsubscribed" ? "opted out" : already ? "already added" : null;
            return (
              <label key={c.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${blocked ? "opacity-50" : "cursor-pointer hover:bg-muted/50"}`}>
                <Checkbox
                  checked={selected.has(c.id)}
                  disabled={!!blocked}
                  onCheckedChange={(v) => toggle(c.id, v === true)}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{c.fullName}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[c.email, c.organization].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                {blocked && <span className="text-xs text-muted-foreground shrink-0">{blocked}</span>}
              </label>
            );
          })
        )}
      </div>
      <p className="text-xs text-muted-foreground">{value.length} selected</p>
    </div>
  );
}
