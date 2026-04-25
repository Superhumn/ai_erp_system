import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Send, CheckCircle2, ChevronDown, ChevronRight, Upload, Trash2, FileText,
} from "lucide-react";
import { toast } from "sonner";

// Admin-only: invite investor stakeholders to the portal, manage their
// per-investor documents (executed agreements, K-1s, capital-call notices),
// and set entitlement tier (ordinary / major / board) which gates future
// portal sections.
//
// Non-investor stakeholder types are hidden here — this is about investor
// portal access, not employee options or founder accounts.

type StakeholderRow = {
  id: number;
  name: string;
  email: string | null | undefined;
  type: string | undefined;
  userId: number | null | undefined;
  relationship: string | null | undefined;
  tier: "ordinary" | "major" | "board" | undefined;
};

export default function InvestorPortalAdmin() {
  const utils = trpc.useUtils();
  const { data: stakeholders, isLoading } = trpc.capTable.stakeholders.list.useQuery(undefined);

  const inviteMutation = trpc.investorPortal.inviteToPortal.useMutation({
    onSuccess: () => {
      toast.success("Portal invitation sent");
      utils.capTable.stakeholders.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const investors = ((stakeholders ?? []) as unknown as StakeholderRow[])
    .filter((s) => s.type === "investor");
  const unlinked = investors.filter((s) => !s.userId);
  const linked = investors.filter((s) => !!s.userId);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite investors to the portal</CardTitle>
          <CardDescription>
            Sends a secure login link so each investor can check their equity position and
            the company's current financials whenever they'd like. Invitations expire in 14 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {unlinked.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Every investor stakeholder already has portal access. New ones added to the cap
              table will appear here for inviting.
            </p>
          ) : (
            <div className="space-y-2">
              {unlinked.map((s) => {
                const pendingForThisRow = inviteMutation.isPending
                  && (inviteMutation.variables as { stakeholderId?: number } | undefined)?.stakeholderId === s.id;
                return (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {s.email || <span className="italic">no email on file</span>}
                        {s.relationship ? ` · ${s.relationship}` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!s.email || pendingForThisRow}
                      onClick={() => inviteMutation.mutate({ stakeholderId: s.id })}
                    >
                      {pendingForThisRow ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Invite
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {linked.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activated investors</CardTitle>
            <CardDescription>
              Manage per-investor documents and portal entitlement tier. Click an investor
              to expand.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {linked.map((s) => (
                <ActivatedInvestorRow key={s.id} stakeholder={s} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Activated investor row ──────────────────────────────────────────
//
// Collapsible row: collapsed shows name + email + tier badge; expanded
// reveals tier dropdown + the per-stakeholder document locker.
function ActivatedInvestorRow({ stakeholder }: { stakeholder: StakeholderRow }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded
            ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{stakeholder.name}</p>
            <p className="text-xs text-muted-foreground truncate">{stakeholder.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge variant="outline" className="capitalize">{stakeholder.tier ?? "ordinary"}</Badge>
          <Badge variant="outline" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Activated
          </Badge>
        </div>
      </button>
      {expanded && (
        <div className="border-t p-3 space-y-4 bg-muted/20">
          <TierEditor stakeholder={stakeholder} />
          <DocumentManager stakeholderId={stakeholder.id} />
        </div>
      )}
    </div>
  );
}

function TierEditor({ stakeholder }: { stakeholder: StakeholderRow }) {
  const utils = trpc.useUtils();
  const [tier, setTier] = useState<"ordinary" | "major" | "board">(stakeholder.tier ?? "ordinary");
  const updateMutation = trpc.capTable.stakeholders.update.useMutation({
    onSuccess: () => {
      toast.success("Tier updated");
      utils.capTable.stakeholders.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  return (
    <div>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
        Entitlement tier
      </Label>
      <div className="flex items-center gap-2">
        <Select
          value={tier}
          onValueChange={(v) => setTier(v as "ordinary" | "major" | "board")}
        >
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ordinary">Ordinary</SelectItem>
            <SelectItem value="major">Major</SelectItem>
            <SelectItem value="board">Board seat</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={updateMutation.isPending || tier === (stakeholder.tier ?? "ordinary")}
          onClick={() => updateMutation.mutate({ id: stakeholder.id, tier })}
        >
          {updateMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Save tier
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Drives which gated portal sections (board materials, sensitive cap-table detail) are visible.
      </p>
    </div>
  );
}

// ─── Document manager (admin) ────────────────────────────────────────
//
// Lists and uploads per-stakeholder documents. Files come up the wire
// as base64 (capped at 25MB by the server) — fine for typical investor
// PDFs and saves a presigned-URL round trip.
function DocumentManager({ stakeholderId }: { stakeholderId: number }) {
  const utils = trpc.useUtils();
  const { data: docs, isLoading } = trpc.capTable.stakeholders.documents.list.useQuery({ stakeholderId });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<"agreement" | "side_letter" | "k1" | "capital_call" | "distribution" | "other">("agreement");

  const uploadMutation = trpc.capTable.stakeholders.documents.upload.useMutation({
    onSuccess: () => {
      toast.success("Document uploaded");
      setTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      utils.capTable.stakeholders.documents.list.invalidate({ stakeholderId });
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.capTable.stakeholders.documents.delete.useMutation({
    onSuccess: () => {
      toast.success("Document deleted");
      utils.capTable.stakeholders.documents.list.invalidate({ stakeholderId });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return toast.error("Pick a file first");
    if (!title.trim()) return toast.error("Give the document a title");
    if (file.size > 25 * 1024 * 1024) return toast.error("File exceeds 25MB upload limit");

    // Read file as base64. arrayBuffer → Uint8Array → base64; the
    // FileReader.readAsDataURL alternative includes a MIME prefix we'd
    // have to strip, so going through the buffer is cleaner.
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);

    uploadMutation.mutate({
      stakeholderId,
      title: title.trim(),
      category,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      base64,
    });
  };

  return (
    <div>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
        Documents
      </Label>

      {/* Existing docs */}
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : !docs || docs.length === 0 ? (
        <p className="text-xs text-muted-foreground mb-3">No documents uploaded yet.</p>
      ) : (
        <div className="space-y-2 mb-3">
          {docs.map((d) => {
            const pendingDelete = deleteMutation.isPending
              && (deleteMutation.variables as { id?: number } | undefined)?.id === d.id;
            return (
              <div key={d.id} className="flex items-center justify-between gap-3 rounded border bg-background p-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{d.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {d.category}{d.fileSize ? ` · ${(d.fileSize / 1024).toFixed(0)} KB` : ""}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pendingDelete}
                  onClick={() => {
                    if (confirm(`Delete "${d.title}"? The investor will no longer see it in their portal.`)) {
                      deleteMutation.mutate({ id: d.id });
                    }
                  }}
                >
                  {pendingDelete
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload form */}
      <div className="space-y-2 rounded-lg border bg-background p-3">
        <p className="text-xs font-medium">Upload a new document</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input
            placeholder="Title (e.g. 'Series A SPA — executed')"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="agreement">Agreement</SelectItem>
              <SelectItem value="side_letter">Side letter</SelectItem>
              <SelectItem value="k1">K-1</SelectItem>
              <SelectItem value="capital_call">Capital call</SelectItem>
              <SelectItem value="distribution">Distribution</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
          className="block text-xs text-muted-foreground file:mr-3 file:py-1 file:px-2 file:rounded file:border file:text-xs file:bg-muted file:cursor-pointer"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={uploadMutation.isPending}
            onClick={handleUpload}
          >
            {uploadMutation.isPending
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <Upload className="h-3.5 w-3.5 mr-1.5" />}
            Upload
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">25MB max · the investor sees this in their portal "My Documents" section.</p>
      </div>
    </div>
  );
}
