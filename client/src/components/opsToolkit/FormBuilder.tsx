// Item 2 — intake form builder. Edits form metadata + a list of fields with a
// live preview. Owns no server state; the parent supplies `initial` and handles
// the create/update mutation via `onSave`.

import { useState } from "react";
import { Plus, Trash2, GripVertical, Loader2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { FormField, FormFieldType } from "@shared/opsToolkit";
import { OPS_TOOLKIT_MODULES } from "@shared/opsToolkit";
import FormRenderer from "./FormRenderer";

export interface FormDraft {
  name: string;
  description?: string;
  fields: FormField[];
  targetModule?: string;
  isPublished: boolean;
  isPublic: boolean;
  submitMessage?: string;
  notifyEmails?: string;
}

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "date", label: "Date" },
  { value: "select", label: "Dropdown" },
  { value: "multiselect", label: "Checkboxes (multi)" },
  { value: "checkbox", label: "Single checkbox" },
];

let idSeq = 0;
function newFieldId() { idSeq += 1; return `field_${Date.now().toString(36)}_${idSeq}`; }

interface FormBuilderProps {
  initial?: Partial<FormDraft>;
  saving?: boolean;
  onSave: (draft: FormDraft) => void;
}

export default function FormBuilder({ initial, saving, onSave }: FormBuilderProps) {
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [fields, setFields] = useState<FormField[]>(initial?.fields || []);
  const [targetModule, setTargetModule] = useState(initial?.targetModule || "custom");
  const [isPublished, setIsPublished] = useState(initial?.isPublished ?? false);
  const [isPublic, setIsPublic] = useState(initial?.isPublic ?? false);
  const [submitMessage, setSubmitMessage] = useState(initial?.submitMessage || "");
  const [notifyEmails, setNotifyEmails] = useState(initial?.notifyEmails || "");

  function addField() {
    setFields((f) => [...f, { id: newFieldId(), label: `Field ${f.length + 1}`, type: "text" }]);
  }
  function updateField(id: string, patch: Partial<FormField>) {
    setFields((f) => f.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  function removeField(id: string) { setFields((f) => f.filter((x) => x.id !== id)); }
  function move(id: string, dir: -1 | 1) {
    setFields((f) => {
      const i = f.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= f.length) return f;
      const copy = [...f];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  function save() {
    onSave({
      name: name.trim(), description, fields, targetModule,
      isPublished, isPublic, submitMessage, notifyEmails,
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Editor */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Form name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vendor onboarding" />
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Shown at the top of the form" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Fields</Label>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={addField}><Plus className="h-4 w-4" /> Add field</Button>
          </div>
          {fields.length === 0 && <p className="text-sm text-muted-foreground">No fields yet. Add one to get started.</p>}
          {fields.map((f) => (
            <Card key={f.id}>
              <CardContent className="space-y-2 p-3">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Input value={f.label} onChange={(e) => updateField(f.id, { label: e.target.value })} className="h-8" placeholder="Field label" />
                  <Button size="icon-sm" variant="ghost" onClick={() => move(f.id, -1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => move(f.id, 1)}><ArrowDown className="h-4 w-4" /></Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => removeField(f.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-6">
                  <Select value={f.type} onValueChange={(v) => updateField(f.id, { type: v as FormFieldType })}>
                    <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{FIELD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Switch checked={f.required ?? false} onCheckedChange={(c) => updateField(f.id, { required: c })} /> Required
                  </label>
                  {(f.type === "select" || f.type === "multiselect") && (
                    <Input
                      className="h-8 flex-1"
                      placeholder="Comma-separated options"
                      value={(f.options || []).join(", ")}
                      onChange={(e) => updateField(f.id, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Settings</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div><Label>Published</Label><p className="text-xs text-muted-foreground">Turn on to enable the share link.</p></div>
              <Switch checked={isPublished} onCheckedChange={setIsPublished} />
            </div>
            <div className="flex items-center justify-between">
              <div><Label>Accept anonymous submissions</Label><p className="text-xs text-muted-foreground">Allow people without an account to submit.</p></div>
              <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            </div>
            <div className="space-y-1.5">
              <Label>Route to module</Label>
              <Select value={targetModule} onValueChange={setTargetModule}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{OPS_TOOLKIT_MODULES.map((m) => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notify emails</Label>
              <Input value={notifyEmails} onChange={(e) => setNotifyEmails(e.target.value)} placeholder="comma-separated addresses" className="h-8" />
            </div>
            <div className="space-y-1.5">
              <Label>Confirmation message</Label>
              <Input value={submitMessage} onChange={(e) => setSubmitMessage(e.target.value)} placeholder="Thanks! We’ll be in touch." className="h-8" />
            </div>
          </CardContent>
        </Card>

        <Button onClick={save} disabled={saving || !name.trim()} className="gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save form
        </Button>
      </div>

      {/* Live preview */}
      <div className="space-y-2">
        <Label className="text-muted-foreground">Live preview</Label>
        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-semibold">{name || "Untitled form"}</h3>
            {description && <p className="mb-3 text-sm text-muted-foreground">{description}</p>}
            {fields.length === 0
              ? <p className="text-sm text-muted-foreground">Add fields to preview the form.</p>
              : <FormRenderer fields={fields} submitLabel="Submit" onSubmit={() => { /* preview only */ }} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
