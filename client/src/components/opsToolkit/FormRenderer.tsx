// Item 2 — renders an intake form's fields as an interactive form. Used both by
// the public /f/:slug fill page and by the builder's live preview.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { FormField } from "@shared/opsToolkit";

interface FormRendererProps {
  fields: FormField[];
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (data: Record<string, unknown>) => void;
}

export default function FormRenderer({ fields, submitting, submitLabel = "Submit", onSubmit }: FormRendererProps) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set(id: string, v: unknown) {
    setValues((prev) => ({ ...prev, [id]: v }));
    if (errors[id]) setErrors((e) => ({ ...e, [id]: "" }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    for (const f of fields) {
      if (!f.required) continue;
      const v = values[f.id];
      const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0) || v === false;
      if (empty) nextErrors[f.id] = "This field is required";
    }
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fields.map((f) => (
        <div key={f.id} className="space-y-1.5">
          {f.type !== "checkbox" && (
            <Label htmlFor={f.id}>
              {f.label}{f.required && <span className="ml-0.5 text-destructive">*</span>}
            </Label>
          )}
          <FieldInput field={f} value={values[f.id]} onChange={(v) => set(f.id, v)} />
          {f.helpText && <p className="text-xs text-muted-foreground">{f.helpText}</p>}
          {errors[f.id] && <p className="text-xs text-destructive">{errors[f.id]}</p>}
        </div>
      ))}
      <Button type="submit" disabled={submitting} className="gap-2">
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}{submitLabel}
      </Button>
    </form>
  );
}

function FieldInput({ field, value, onChange }: {
  field: FormField; value: unknown; onChange: (v: unknown) => void;
}) {
  switch (field.type) {
    case "textarea":
      return <Textarea id={field.id} placeholder={field.placeholder} value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} />;
    case "number":
      return <Input id={field.id} type="number" placeholder={field.placeholder} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "email":
      return <Input id={field.id} type="email" placeholder={field.placeholder} value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} />;
    case "phone":
      return <Input id={field.id} type="tel" placeholder={field.placeholder} value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} />;
    case "date":
      return <Input id={field.id} type="date" value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} />;
    case "select":
      return (
        <Select value={(value as string) || undefined} onValueChange={onChange}>
          <SelectTrigger id={field.id}><SelectValue placeholder={field.placeholder || "Select…"} /></SelectTrigger>
          <SelectContent>
            {(field.options || []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    case "multiselect": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-1.5 rounded-md border p-2">
          {(field.options || []).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={arr.includes(o)}
                onCheckedChange={(c) => onChange(c ? [...arr, o] : arr.filter((x) => x !== o))}
              />
              {o}
            </label>
          ))}
        </div>
      );
    }
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={value === true} onCheckedChange={(c) => onChange(c === true)} />
          {field.label}{field.required && <span className="text-destructive">*</span>}
        </label>
      );
    case "text":
    default:
      return <Input id={field.id} placeholder={field.placeholder} value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} />;
  }
}
