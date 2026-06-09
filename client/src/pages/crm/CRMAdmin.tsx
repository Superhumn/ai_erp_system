import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Loader2, Trash2, Edit, Megaphone, Tag } from "lucide-react";
import { toast } from "sonner";

// ============================================
// CRM ADMIN PAGE (Issue #268)
// Campaigns CRUD + ContactTagsPicker component
// ============================================

export default function CRMAdmin() {
  const [activeTab, setActiveTab] = useState<"campaigns" | "tags">("campaigns");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          CRM Admin
        </h1>
        <p className="text-muted-foreground">Manage CRM campaigns and contact tags</p>
      </div>

      <div className="flex gap-2 border-b pb-2">
        <button
          onClick={() => setActiveTab("campaigns")}
          className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px ${activeTab === "campaigns" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Megaphone className="h-4 w-4 inline mr-1" /> Campaigns
        </button>
        <button
          onClick={() => setActiveTab("tags")}
          className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 -mb-px ${activeTab === "tags" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Tag className="h-4 w-4 inline mr-1" /> Tags
        </button>
      </div>

      {activeTab === "campaigns" && <CampaignsSection />}
      {activeTab === "tags" && <TagsSection />}
    </div>
  );
}

// ============================================
// CAMPAIGNS SECTION
// ============================================
function CampaignsSection() {
  const utils = trpc.useUtils();
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    status: "draft" as "draft" | "active" | "paused" | "completed",
    type: "email" as "email" | "sms" | "whatsapp" | "call",
    targetAudience: "",
    startDate: "",
    endDate: "",
  });

  const { data: campaigns, isLoading } = trpc.crm.campaigns.list.useQuery({});

  const createCampaign = trpc.crm.campaigns.create.useMutation({
    onSuccess: () => {
      toast.success("Campaign created");
      setShowNew(false);
      resetForm();
      utils.crm.campaigns.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateCampaign = trpc.crm.campaigns.update.useMutation({
    onSuccess: () => {
      toast.success("Campaign updated");
      setEditingId(null);
      resetForm();
      utils.crm.campaigns.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetForm = () => setForm({ name: "", description: "", status: "draft", type: "email", targetAudience: "", startDate: "", endDate: "" });

  const openEdit = (c: any) => {
    setForm({ name: c.name || "", description: c.description || "", status: c.status || "draft", type: c.type || "email", targetAudience: c.targetAudience || "", startDate: c.startDate?.slice(0, 10) || "", endDate: c.endDate?.slice(0, 10) || "" });
    setEditingId(c.id);
  };

  const isDialogOpen = showNew || editingId !== null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>CRM Campaigns</CardTitle>
          <Button size="sm" onClick={() => { resetForm(); setShowNew(true); }}>
            <Plus className="h-4 w-4 mr-2" /> New Campaign
          </Button>
        </div>
        <CardDescription>Create and manage CRM-side campaigns for contact engagement</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : !campaigns || campaigns.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No campaigns yet. Create one to start engaging contacts.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(campaigns as any[]).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{c.type || "email"}</Badge></TableCell>
                  <TableCell>
                    <Badge className={
                      c.status === "active" ? "bg-green-100 text-green-700" :
                      c.status === "completed" ? "bg-blue-100 text-blue-700" :
                      c.status === "paused" ? "bg-yellow-100 text-yellow-700" :
                      "bg-gray-100 text-gray-700"
                    }>{c.status || "draft"}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.startDate ? new Date(c.startDate).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.endDate ? new Date(c.endDate).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={(o) => { if (!o) { setShowNew(false); setEditingId(null); resetForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Campaign" : "New Campaign"}</DialogTitle>
            <DialogDescription>Configure your CRM campaign</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Campaign name" /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="call">Call</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Start Date</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
              <div><Label>End Date</Label><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNew(false); setEditingId(null); resetForm(); }}>Cancel</Button>
            <Button
              disabled={!form.name || createCampaign.isPending || updateCampaign.isPending}
              onClick={() => {
                if (editingId) {
                  updateCampaign.mutate({ id: editingId, name: form.name, scheduledAt: form.startDate ? new Date(form.startDate) : undefined });
                } else {
                  createCampaign.mutate({ name: form.name, subject: form.name, bodyHtml: form.description || "", scheduledAt: form.startDate ? new Date(form.startDate) : undefined });
                }
              }}
            >
              {(createCampaign.isPending || updateCampaign.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? "Save Changes" : "Create Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============================================
// TAGS SECTION
// ============================================
function TagsSection() {
  const utils = trpc.useUtils();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");
  const [newCategory, setNewCategory] = useState<"contact" | "deal" | "general">("contact");

  const { data: tags, isLoading } = trpc.crm.tags.list.useQuery({});

  const createTag = trpc.crm.tags.create.useMutation({
    onSuccess: () => {
      toast.success("Tag created");
      setNewName("");
      utils.crm.tags.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteTag = trpc.crm.tags.delete.useMutation({
    onSuccess: () => {
      toast.success("Tag deleted");
      utils.crm.tags.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Tag className="h-5 w-5" /> Tag Taxonomy</CardTitle>
        <CardDescription>Create and manage tags that can be assigned to contacts and deals</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : !tags || (tags as any[]).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No tags yet.</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {(tags as any[]).map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-md border p-2">
                <span className="h-3 w-3 rounded-full" style={{ background: t.color || "#94a3b8" }} />
                <span className="flex-1 text-sm font-medium">{t.name}</span>
                {t.category && <Badge variant="outline" className="text-xs">{t.category}</Badge>}
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => { if (confirm(`Delete tag "${t.name}"?`)) deleteTag.mutate({ id: t.id }); }} disabled={deleteTag.isPending}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="border-t pt-4 space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">New Tag</Label>
          <div className="flex items-center gap-2">
            <input type="color" className="h-9 w-12 rounded border bg-background cursor-pointer" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
            <Input placeholder="Tag name" value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-1" />
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={newCategory} onChange={(e) => setNewCategory(e.target.value as any)}>
              <option value="contact">contact</option>
              <option value="deal">deal</option>
              <option value="general">general</option>
            </select>
            <Button size="sm" disabled={!newName.trim() || createTag.isPending} onClick={() => createTag.mutate({ name: newName.trim(), color: newColor, category: newCategory })}>
              {createTag.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// CONTACT TAGS PICKER (reusable component)
// Drop into contact detail pages to assign tags
// ============================================
export function ContactTagsPicker({ contactId }: { contactId: number }) {
  const utils = trpc.useUtils();
  const { data: allTags } = trpc.crm.tags.list.useQuery({});
  const { data: contactTags } = trpc.crm.tags.getForContact.useQuery({ contactId }) ?? { data: [] };

  const addTag = trpc.crm.tags.addToContact.useMutation({
    onSuccess: () => { toast.success("Tag added"); utils.crm.tags.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const removeTag = trpc.crm.tags.removeFromContact.useMutation({
    onSuccess: () => { toast.success("Tag removed"); utils.crm.tags.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const assignedTagIds = new Set((contactTags as any[] || []).map((t: any) => t.id));

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Tags</Label>
      <div className="flex flex-wrap gap-1">
        {(allTags as any[] || []).filter((t: any) => t.category === "contact" || t.category === "general").map((tag: any) => {
          const assigned = assignedTagIds.has(tag.id);
          return (
            <button
              key={tag.id}
              onClick={() => {
                if (assigned) removeTag.mutate({ contactId, tagId: tag.id });
                else addTag.mutate({ contactId, tagId: tag.id });
              }}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${assigned ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary"}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: tag.color || "#94a3b8" }} />
              {tag.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
