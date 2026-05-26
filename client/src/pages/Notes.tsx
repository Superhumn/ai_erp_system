import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, StickyNote, Search, Sparkles, Trash2, RefreshCw, ListTodo, Users, Bell, Lightbulb, CheckCircle2, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { QuickNoteDialog } from "@/components/QuickNoteDialog";
import type { NoteParseResult, NoteAppliedItem, NoteParsedItem } from "@shared/notes";

const KIND_ICON = {
  task: ListTodo,
  crm_contact: Users,
  reminder: Bell,
  idea: Lightbulb,
} as const;

function formatRelative(date: string | Date | null | undefined) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default function Notes() {
  const [search, setSearch] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<{ id: number; title: string; content: string } | null>(null);

  const utils = trpc.useUtils();
  const { data: notes, isLoading } = trpc.notes.list.useQuery({ limit: 200 });
  const reparseMutation = trpc.notes.parse.useMutation();
  const deleteMutation = trpc.notes.delete.useMutation();
  const updateMutation = trpc.notes.update.useMutation({
    onSuccess: () => {
      toast.success("Note updated");
      setEditingNote(null);
      utils.notes.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const filtered = useMemo(() => {
    if (!notes) return [];
    if (!search.trim()) return notes;
    const q = search.toLowerCase();
    return notes.filter((n) =>
      (n.content || "").toLowerCase().includes(q) || (n.title || "").toLowerCase().includes(q)
    );
  }, [notes, search]);

  const handleReparse = async (id: number) => {
    try {
      await reparseMutation.mutateAsync({ id });
      utils.notes.list.invalidate();
      toast.success("Re-parsed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-parse failed");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this note?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      utils.notes.list.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <StickyNote className="h-6 w-6 text-primary" />
            Notes
          </h1>
          <p className="text-sm text-muted-foreground">
            Quick captures parsed by AI into tasks, contacts, and reminders. Press <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono">g</kbd> then <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono">n</kbd> from anywhere.
          </p>
        </div>
        <Button onClick={() => setComposeOpen(true)}>
          <Sparkles className="h-4 w-4 mr-2" />
          New note
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search notes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading notes...
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <StickyNote className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No notes yet</p>
            <p className="text-sm">Hit <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono">g</kbd> then <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono">n</kbd> or click <span className="font-medium">New note</span> to capture something.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((note) => {
          const parsed = note.parsedItems as NoteParseResult | null;
          const applied = (note.appliedItems as NoteAppliedItem[] | null) || [];
          return (
            <Card key={note.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base truncate">
                    {note.title || (note.content || "").slice(0, 60) || "Untitled note"}
                  </CardTitle>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {note.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{formatRelative(note.createdAt)}</p>
              </CardHeader>
              <CardContent className="flex-1 space-y-2">
                <p className="text-sm whitespace-pre-wrap line-clamp-4">{note.content}</p>

                {note.parseError && (
                  <p className="text-xs text-amber-600">Parse failed: {note.parseError}</p>
                )}

                {parsed && parsed.items.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {parsed.items.map((item: NoteParsedItem) => {
                      const Icon = KIND_ICON[item.kind];
                      const isApplied = applied.some((a) => a.itemId === item.id);
                      return (
                        <Badge
                          key={item.id}
                          variant="outline"
                          className={isApplied ? "bg-emerald-500/15 border-emerald-500/30" : ""}
                        >
                          <Icon className="h-3 w-3 mr-1" />
                          {item.kind.replace("_", " ")}
                          {isApplied && <CheckCircle2 className="h-3 w-3 ml-1 text-emerald-600" />}
                        </Badge>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-1 pt-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() =>
                      setEditingNote({
                        id: note.id,
                        title: note.title || "",
                        content: note.content || "",
                      })
                    }
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => handleReparse(note.id)}
                    disabled={reparseMutation.isPending}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Re-parse
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                    onClick={() => handleDelete(note.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <QuickNoteDialog open={composeOpen} onOpenChange={setComposeOpen} />

      <Dialog open={editingNote !== null} onOpenChange={(open) => { if (!open) setEditingNote(null); }}>
        <DialogContent className="max-w-lg">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editingNote) return;
              updateMutation.mutate({
                id: editingNote.id,
                title: editingNote.title || undefined,
                content: editingNote.content,
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Edit note</DialogTitle>
              <DialogDescription>
                Changing the content re-parses it through the LLM. Parsed action items are
                rebuilt accordingly.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="editNoteTitle">Title (optional)</Label>
                <Input
                  id="editNoteTitle"
                  value={editingNote?.title || ""}
                  onChange={(e) => setEditingNote(editingNote ? { ...editingNote, title: e.target.value } : null)}
                  placeholder="(auto-derived from content)"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editNoteContent">Content</Label>
                <Textarea
                  id="editNoteContent"
                  rows={10}
                  value={editingNote?.content || ""}
                  onChange={(e) => setEditingNote(editingNote ? { ...editingNote, content: e.target.value } : null)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingNote(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!editingNote?.content || updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
