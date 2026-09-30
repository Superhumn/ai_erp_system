import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const FIELD_LABELS = {
  firstName: "First name",
  lastName: "Last name",
  fullName: "Full name",
  email: "Email",
  phone: "Phone",
  organization: "Organization / account",
  jobTitle: "Job title",
  city: "City",
  state: "State",
  country: "Country",
  linkedinUrl: "LinkedIn URL",
  contactType: "Contact type",
  notes: "Notes",
} as const;
type Field = keyof typeof FIELD_LABELS;
type Mapping = Record<string, Field | "">;

const MAX_BYTES = 5_000_000;

/**
 * CSV contact import: pick a file (read in the browser), adjust the column
 * mapping, preview which rows are new / duplicate / invalid, then commit.
 */
export function ContactImportDialog({ open, onOpenChange, onImported }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}) {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [updateDuplicates, setUpdateDuplicates] = useState(false);
  const [createAccounts, setCreateAccounts] = useState(true);

  const preview = trpc.crm.contacts.importPreview.useMutation({
    onSuccess: (r) => { if (!mapping) setMapping(r.mapping as Mapping); },
    onError: (e) => toast.error(e.message),
  });
  const commit = trpc.crm.contacts.importCommit.useMutation({
    onSuccess: (r) => {
      toast.success(`Imported ${r.created} new, updated ${r.updated}, skipped ${r.skipped}${r.accountsCreated ? `, ${r.accountsCreated} accounts created` : ""}`);
      if (r.errors.length) toast.error(`${r.errors.length} row(s) failed — first: row ${r.errors[0].row}: ${r.errors[0].error}`);
      reset();
      onOpenChange(false);
      onImported?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const reset = () => { setCsv(""); setFileName(""); setMapping(null); preview.reset(); };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) { toast.error("File is larger than 5 MB"); return; }
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    setMapping(null);
    preview.mutate({ csv: text });
  };

  const remap = (idx: number, field: Field | "") => {
    const next: Mapping = { ...(mapping ?? {}), [String(idx)]: field };
    // One column per field: clear the field from any other column.
    if (field) for (const k of Object.keys(next)) if (k !== String(idx) && next[k] === field) next[k] = "";
    setMapping(next);
    preview.mutate({ csv, mapping: next });
  };

  const data = preview.data;
  const statusBadge = (s: string) =>
    s === "new" ? <Badge className="text-[10px]">new</Badge>
      : s === "duplicate" ? <Badge variant="secondary" className="text-[10px]">duplicate</Badge>
      : <Badge variant="destructive" className="text-[10px]">invalid</Badge>;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import contacts from CSV</DialogTitle>
          <DialogDescription>Duplicates are matched on email, phone or LinkedIn URL.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">CSV file</Label>
            <Input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
            {fileName && <p className="text-[11px] text-muted-foreground">{fileName}</p>}
          </div>

          {preview.isPending && !data && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}

          {data && (
            <>
              <div>
                <div className="text-xs font-medium mb-1">Column mapping</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {data.headers.map((h, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-1/2 truncate text-muted-foreground" title={h}>{h || `Column ${i + 1}`}</span>
                      <Select value={(mapping ?? {})[String(i)] || "ignore"} onValueChange={(v) => remap(i, v === "ignore" ? "" : (v as Field))}>
                        <SelectTrigger className="h-7 text-xs w-1/2"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ignore">Ignore</SelectItem>
                          {Object.entries(FIELD_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge>{data.counts.new} new</Badge>
                <Badge variant="secondary">{data.counts.duplicate} duplicate</Badge>
                <Badge variant="destructive">{data.counts.invalid} invalid</Badge>
                {preview.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>

              <div className="border rounded-md max-h-[40vh] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr className="text-left">
                      <th className="p-1.5 font-medium">Row</th>
                      <th className="p-1.5 font-medium">Status</th>
                      <th className="p-1.5 font-medium">Name</th>
                      <th className="p-1.5 font-medium hidden sm:table-cell">Email</th>
                      <th className="p-1.5 font-medium hidden md:table-cell">Organization</th>
                      <th className="p-1.5 font-medium">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.slice(0, 300).map((r) => (
                      <tr key={r.row} className="border-t">
                        <td className="p-1.5 tabular-nums text-muted-foreground">{r.row}</td>
                        <td className="p-1.5">{statusBadge(r.status)}</td>
                        <td className="p-1.5 truncate max-w-[140px]">{r.contact?.fullName ?? "—"}</td>
                        <td className="p-1.5 truncate max-w-[180px] hidden sm:table-cell">{r.contact?.email ?? "—"}</td>
                        <td className="p-1.5 truncate max-w-[160px] hidden md:table-cell">{r.contact?.organization ?? "—"}</td>
                        <td className="p-1.5 text-muted-foreground truncate max-w-[200px]">
                          {r.error ?? (r.matchOutOfScope ? "Exists in another entity" : r.matchName ? `Matches ${r.matchName}` : "")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.rows.length > 300 && <p className="p-2 text-[11px] text-muted-foreground">Showing the first 300 of {data.rows.length} rows.</p>}
              </div>

              <div className="space-y-1.5 text-xs">
                <label className="flex items-center gap-2">
                  <Checkbox checked={createAccounts} onCheckedChange={(v) => setCreateAccounts(v === true)} />
                  Create / link accounts from the organization column
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox checked={updateDuplicates} onCheckedChange={(v) => setUpdateDuplicates(v === true)} />
                  Fill in blank fields on duplicates (never overwrites existing values)
                </label>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!data || !mapping || commit.isPending || (data.counts.new === 0 && !(updateDuplicates && data.counts.duplicate > 0))}
            onClick={() => mapping && commit.mutate({ csv, mapping, updateDuplicates, createAccounts })}
          >
            {commit.isPending ? "Importing…" : data ? `Import ${data.counts.new} contact${data.counts.new === 1 ? "" : "s"}` : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
