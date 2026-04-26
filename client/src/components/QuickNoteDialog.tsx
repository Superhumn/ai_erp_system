import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Sparkles, CheckCircle2, ListTodo, Users, Bell, Lightbulb, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import type { NoteParseResult, NoteParsedItem } from "@shared/notes";

interface QuickNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const KIND_META: Record<NoteParsedItem["kind"], { label: string; icon: typeof ListTodo; tone: string }> = {
  task: { label: "Task", icon: ListTodo, tone: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
  crm_contact: { label: "CRM Contact", icon: Users, tone: "bg-purple-500/15 text-purple-600 border-purple-500/30" },
  reminder: { label: "Reminder", icon: Bell, tone: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  idea: { label: "Idea", icon: Lightbulb, tone: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
};

export function QuickNoteDialog({ open, onOpenChange }: QuickNoteDialogProps) {
  const [content, setContent] = useState("");
  const [noteId, setNoteId] = useState<number | null>(null);
  const [parsed, setParsed] = useState<NoteParseResult | null>(null);
  const [parseFailed, setParseFailed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [, setLocation] = useLocation();

  const utils = trpc.useUtils();
  const createMutation = trpc.notes.create.useMutation();
  const applyMutation = trpc.notes.applyItems.useMutation();
  const parseAgainMutation = trpc.notes.parse.useMutation();

  // Reset state when the dialog (re)opens.
  useEffect(() => {
    if (open) {
      setContent("");
      setNoteId(null);
      setParsed(null);
      setParseFailed(false);
      setSelected(new Set());
    }
  }, [open]);

  const handleSave = async () => {
    if (!content.trim()) return;
    try {
      const res = await createMutation.mutateAsync({ content });
      setNoteId(res.id);
      if (res.parsed) {
        const result = res.parsed as NoteParseResult;
        setParsed(result);
        setSelected(new Set((result.items ?? []).map((it) => it.id)));
      } else {
        setParseFailed(true);
      }
      utils.notes.list.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save note");
    }
  };

  const handleReparse = async () => {
    if (!noteId) return;
    try {
      const raw = await parseAgainMutation.mutateAsync({ id: noteId });
      const result = raw as NoteParseResult;
      setParsed(result);
      setParseFailed(false);
      setSelected(new Set((result.items ?? []).map((it) => it.id)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-parse failed");
    }
  };

  const handleApply = async () => {
    if (!noteId || selected.size === 0) {
      onOpenChange(false);
      return;
    }
    try {
      const res = await applyMutation.mutateAsync({
        id: noteId,
        itemIds: Array.from(selected),
      });
      toast.success(`Applied ${res.applied.length} item${res.applied.length === 1 ? "" : "s"}`);
      utils.notes.list.invalidate();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Apply failed");
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isSaving = createMutation.isPending;
  const isApplying = applyMutation.isPending;
  const isReparsing = parseAgainMutation.isPending;
  const stage: "compose" | "review" = parsed || parseFailed ? "review" : "compose";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Quick Note
          </DialogTitle>
          <DialogDescription>
            Brain-dump anything. We'll route tasks, contacts, reminders, and ideas into the right place.
          </DialogDescription>
        </DialogHeader>

        {stage === "compose" && (
          <div className="space-y-3">
            <Textarea
              autoFocus
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleSave();
                }
              }}
              placeholder="e.g. Met Sarah Chen from Acme Foods, sarah@acme.com — interested in our 5lb pack. Follow up Friday with samples."
              rows={8}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono">⌘/Ctrl + Enter</kbd> to save & parse
            </p>
          </div>
        )}

        {stage === "review" && (
          <div className="space-y-3">
            {parseFailed && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="font-medium text-amber-900 dark:text-amber-200">Could not parse note</div>
                  <div className="text-xs text-muted-foreground">
                    The note was saved. You can still re-try parsing or open the Notes page.
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={handleReparse} disabled={isReparsing}>
                  {isReparsing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Retry"}
                </Button>
              </div>
            )}

            {parsed && parsed.items.length === 0 && (
              <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground text-center">
                No actionable items detected — saved as a free-form note.
              </div>
            )}

            {parsed && parsed.items.length > 0 && (
              <ScrollArea className="max-h-[420px] pr-3">
                <div className="space-y-2">
                  {parsed.items.map((item) => {
                    const meta = KIND_META[item.kind];
                    const Icon = meta.icon;
                    const isSelected = selected.has(item.id);
                    const headline =
                      (item as any).title ||
                      (item.kind === "crm_contact"
                        ? [(item as any).firstName, (item as any).lastName].filter(Boolean).join(" ") ||
                          (item as any).organization ||
                          "Contact"
                        : item.summary);
                    return (
                      <label
                        key={item.id}
                        className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                          isSelected ? "bg-accent/40 border-primary/40" : "hover:bg-accent/20"
                        }`}
                      >
                        <Checkbox checked={isSelected} onCheckedChange={() => toggle(item.id)} className="mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className={meta.tone}>
                              <Icon className="h-3 w-3 mr-1" />
                              {meta.label}
                            </Badge>
                            <span className="font-medium text-sm truncate">{headline}</span>
                            <span className="text-xs text-muted-foreground ml-auto">
                              {Math.round(item.confidence * 100)}%
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{item.summary}</p>
                          {item.kind === "task" && (item as any).dueDate && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Due: {(item as any).dueDate}
                              {(item as any).priority ? ` · ${(item as any).priority}` : ""}
                            </p>
                          )}
                          {item.kind === "crm_contact" && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {[(item as any).email, (item as any).phone, (item as any).organization]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                          {item.kind === "reminder" && (item as any).remindAt && (
                            <p className="text-xs text-muted-foreground mt-1">When: {(item as any).remindAt}</p>
                          )}
                          {item.sourceQuote && (
                            <p className="text-xs italic text-muted-foreground mt-1">
                              "{item.sourceQuote}"
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
        )}

        <DialogFooter className="flex sm:justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              setLocation("/notes");
            }}
          >
            View all notes
          </Button>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {stage === "review" ? "Done" : "Cancel"}
            </Button>
            {stage === "compose" ? (
              <Button onClick={handleSave} disabled={!content.trim() || isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Save & Parse
              </Button>
            ) : (
              parsed && parsed.items.length > 0 && (
                <Button onClick={handleApply} disabled={isApplying || selected.size === 0}>
                  {isApplying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Apply {selected.size > 0 ? `(${selected.size})` : ""}
                </Button>
              )
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
