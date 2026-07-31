import { useState } from "react";
import { trpc } from "@/lib/trpc";
import InlineEdit from "@/components/InlineEdit";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SpreadsheetTable, Column } from "@/components/SpreadsheetTable";
import { DetailSheet } from "@/components/DetailSheet";
import { DollarSign, Plus, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";

const typeOptions = [
  { value: "asset", label: "Asset", color: "bg-blue-500/10 text-blue-600" },
  { value: "liability", label: "Liability", color: "bg-red-500/10 text-red-600" },
  { value: "equity", label: "Equity", color: "bg-purple-500/10 text-purple-600" },
  { value: "revenue", label: "Revenue", color: "bg-green-500/10 text-green-600" },
  { value: "expense", label: "Expense", color: "bg-amber-500/10 text-amber-600" },
];

function AccountSummaryBody({ account, onUpdate }: { account: any; onUpdate: (patch: { name?: string; description?: string }) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs text-muted-foreground mb-1">Name</div>
        <div className="font-medium">
          <InlineEdit value={account.name ?? ""} type="text" onSave={(v) => onUpdate({ name: v })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Code</div>
          <div className="font-mono font-medium">{account.code}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Subtype</div>
          <div className="font-medium">{account.subtype || "—"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 col-span-2">
          <div className="text-xs text-muted-foreground mb-1">Balance</div>
          <div className="font-mono text-lg font-semibold">{formatCurrency(account.balance)}</div>
        </div>
      </div>
      <div>
        <h4 className="text-sm font-medium mb-1">Description</h4>
        <InlineEdit value={account.description ?? ""} type="text" placeholder="No description" onSave={(v) => onUpdate({ description: v })} />
      </div>
    </div>
  );
}

export default function Accounts() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    type: "asset" as "asset" | "liability" | "equity" | "revenue" | "expense",
    subtype: "",
    description: "",
  });

  const utils = trpc.useUtils();
  const { data: accounts, isLoading } = trpc.accounts.list.useQuery();
  const createAccount = trpc.accounts.create.useMutation({
    onSuccess: () => {
      toast.success("Account created successfully");
      setIsOpen(false);
      setFormData({ code: "", name: "", type: "asset", subtype: "", description: "" });
      utils.accounts.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "", isActive: true });
  const updateAccount = trpc.accounts.update.useMutation({
    onSuccess: () => {
      toast.success("Account updated");
      utils.accounts.list.invalidate();
      setEditOpen(false);
      setSelectedAccount(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const openEdit = () => {
    if (!selectedAccount) return;
    setEditForm({
      name: selectedAccount.name ?? "",
      description: selectedAccount.description ?? "",
      isActive: selectedAccount.isActive !== false,
    });
    setEditOpen(true);
  };

  const handleUpdate = () => {
    if (!selectedAccount) return;
    if (!editForm.name.trim()) {
      toast.error("Name is required");
      return;
    }
    updateAccount.mutate({
      id: selectedAccount.id,
      name: editForm.name.trim(),
      description: editForm.description || undefined,
      isActive: editForm.isActive,
    });
  };

  const columns: Column<any>[] = [
    { key: "code", header: "Code", type: "text", sortable: true },
    { key: "name", header: "Name", type: "text", sortable: true },
    { key: "type", header: "Type", type: "badge", options: typeOptions, filterable: true },
    { key: "subtype", header: "Subtype", type: "text" },
    { key: "balance", header: "Balance", type: "currency", sortable: true },
    {
      key: "isActive",
      header: "Status",
      type: "text",
      render: (_row, val) => (val ? "Active" : "Inactive"),
    },
    {
      key: "description",
      header: "Description",
      type: "text",
      render: (_row, val) => {
        const s = typeof val === "string" ? val : "";
        return s.length > 40 ? s.slice(0, 40) + "…" : s || "—";
      },
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createAccount.mutate(formData);
  };

  const selectedType = selectedAccount
    ? typeOptions.find((t) => t.value === selectedAccount.type)
    : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="h-8 w-8" />
            Chart of Accounts
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your general ledger accounts — click any row for details.
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Create Account</DialogTitle>
                <DialogDescription>Add a new account to your chart of accounts.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Account Code</Label>
                    <Input
                      id="code"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      placeholder="1000"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type">Type</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(value: any) => setFormData({ ...formData, type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="asset">Asset</SelectItem>
                        <SelectItem value="liability">Liability</SelectItem>
                        <SelectItem value="equity">Equity</SelectItem>
                        <SelectItem value="revenue">Revenue</SelectItem>
                        <SelectItem value="expense">Expense</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Account Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Cash"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subtype">Subtype (Optional)</Label>
                  <Input
                    id="subtype"
                    value={formData.subtype}
                    onChange={(e) => setFormData({ ...formData, subtype: e.target.value })}
                    placeholder="Current Asset"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Main operating cash account"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createAccount.isPending}>
                  {createAccount.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Account
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-6">
          <SpreadsheetTable
            data={(accounts || []) as any[]}
            columns={columns}
            isLoading={isLoading}
            emptyMessage="No accounts yet — create your first account to get started."
            showSearch
            showFilters
            showExport
            onRowClick={(row) => setSelectedAccount(row)}
            expandedRowId={selectedAccount?.id ?? null}
            compact
          />
        </CardContent>
      </Card>

      <DetailSheet
        open={!!selectedAccount}
        onOpenChange={(o) => !o && setSelectedAccount(null)}
        width="sm"
        title={
          selectedAccount && (
            <span className="flex items-center gap-2">
              {selectedAccount.name}
              {selectedType && <Badge className={selectedType.color}>{selectedType.label}</Badge>}
            </span>
          )
        }
        subtitle={selectedAccount && `Code ${selectedAccount.code}`}
        actions={
          selectedAccount && (
            <Button size="sm" variant="outline" onClick={openEdit}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )
        }
      >
        {selectedAccount && (
          <AccountSummaryBody
            account={selectedAccount}
            onUpdate={(patch) => {
              updateAccount.mutate({ id: selectedAccount.id, ...patch });
              setSelectedAccount((cur: any) => (cur ? { ...cur, ...patch } : cur));
            }}
          />
        )}
      </DetailSheet>

      {/* Edit Account Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit account</DialogTitle>
            <DialogDescription>Update this account's name, description, or active status.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={editForm.isActive ? "active" : "inactive"}
                onValueChange={(v) => setEditForm({ ...editForm, isActive: v === "active" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateAccount.isPending}>
              {updateAccount.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
