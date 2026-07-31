// Item 3 — builder for a single automation rule (trigger -> conditions -> action).
// Parent owns the create/update mutation and passes `initial` + `onSave`.

import { useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type {
  AutomationTriggerType, AutomationTriggerConfig, AutomationCondition,
  AutomationConditionOp, AutomationActionType, AutomationActionConfig,
} from "@shared/opsToolkit";
import { OPS_TOOLKIT_MODULES } from "@shared/opsToolkit";

export interface AutomationDraft {
  name: string;
  description?: string;
  module: string;
  triggerType: AutomationTriggerType;
  triggerConfig: AutomationTriggerConfig;
  conditions: AutomationCondition[];
  actionType: AutomationActionType;
  actionConfig: AutomationActionConfig;
  isActive: boolean;
}

const TRIGGERS: { value: AutomationTriggerType; label: string }[] = [
  { value: "record_created", label: "When a record is created" },
  { value: "record_updated", label: "When a record is updated" },
  { value: "field_changed", label: "When a field changes" },
  { value: "form_submitted", label: "When an intake form is submitted" },
  { value: "scheduled", label: "On a schedule" },
];

const OPS: { value: AutomationConditionOp; label: string }[] = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "empty", label: "is empty" },
  { value: "not_empty", label: "is not empty" },
];

const ACTIONS: { value: AutomationActionType; label: string }[] = [
  { value: "send_email", label: "Send an email" },
  { value: "create_notification", label: "Create an in-app notification" },
  { value: "webhook", label: "Call a webhook" },
];

interface Props {
  initial?: Partial<AutomationDraft>;
  saving?: boolean;
  onSave: (draft: AutomationDraft) => void;
}

export default function AutomationBuilder({ initial, saving, onSave }: Props) {
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [module, setModule] = useState(initial?.module || "custom");
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>(initial?.triggerType || "record_created");
  const [triggerConfig, setTriggerConfig] = useState<AutomationTriggerConfig>(initial?.triggerConfig || {});
  const [conditions, setConditions] = useState<AutomationCondition[]>(initial?.conditions || []);
  const [actionType, setActionType] = useState<AutomationActionType>(initial?.actionType || "create_notification");
  const [actionConfig, setActionConfig] = useState<AutomationActionConfig>(initial?.actionConfig || {});
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  function setTrig(patch: Partial<AutomationTriggerConfig>) { setTriggerConfig((c) => ({ ...c, ...patch })); }
  function setAct(patch: Partial<AutomationActionConfig>) { setActionConfig((c) => ({ ...c, ...patch })); }
  function addCondition() { setConditions((c) => [...c, { field: "", op: "eq", value: "" }]); }
  function updateCondition(i: number, patch: Partial<AutomationCondition>) {
    setConditions((c) => c.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function removeCondition(i: number) { setConditions((c) => c.filter((_, idx) => idx !== i)); }

  function save() {
    onSave({ name: name.trim(), description, module, triggerType, triggerConfig, conditions, actionType, actionConfig, isActive });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Rule name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ping ops on rush order" />
        </div>
        <div className="space-y-1.5">
          <Label>Module</Label>
          <Select value={module} onValueChange={setModule}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{OPS_TOOLKIT_MODULES.map((m) => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional note about what this rule does" />
      </div>

      {/* Trigger */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Trigger</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Select value={triggerType} onValueChange={(v) => setTriggerType(v as AutomationTriggerType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TRIGGERS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
          {triggerType === "field_changed" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input placeholder="Field to watch (e.g. status)" value={triggerConfig.field || ""} onChange={(e) => setTrig({ field: e.target.value })} />
              <Input placeholder="Only when it becomes… (optional)" value={triggerConfig.toValue || ""} onChange={(e) => setTrig({ toValue: e.target.value })} />
            </div>
          )}
          {triggerType === "form_submitted" && (
            <Input placeholder="Intake form ID (optional — blank = any form)" value={triggerConfig.formId ?? ""} onChange={(e) => setTrig({ formId: e.target.value ? Number(e.target.value) : undefined })} />
          )}
          {triggerType === "scheduled" && (
            <Input placeholder="Cron expression (e.g. 0 9 * * 1) — informational" value={triggerConfig.cron || ""} onChange={(e) => setTrig({ cron: e.target.value })} />
          )}
        </CardContent>
      </Card>

      {/* Conditions */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm">Conditions <span className="font-normal text-muted-foreground">(all must match)</span></CardTitle>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={addCondition}><Plus className="h-4 w-4" /> Add</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {conditions.length === 0 && <p className="text-sm text-muted-foreground">No conditions — the action runs on every matching trigger.</p>}
          {conditions.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input className="h-8 flex-1" placeholder="field" value={c.field} onChange={(e) => updateCondition(i, { field: e.target.value })} />
              <Select value={c.op} onValueChange={(v) => updateCondition(i, { op: v as AutomationConditionOp })}>
                <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>{OPS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
              {c.op !== "empty" && c.op !== "not_empty" && (
                <Input className="h-8 flex-1" placeholder="value" value={(c.value as string) ?? ""} onChange={(e) => updateCondition(i, { value: e.target.value })} />
              )}
              <Button size="icon-sm" variant="ghost" onClick={() => removeCondition(i)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Action */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Action</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Select value={actionType} onValueChange={(v) => setActionType(v as AutomationActionType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Tip: use <code className="rounded bg-muted px-1">{"{{field}}"}</code> to insert a record value.</p>
          {actionType === "send_email" && (
            <div className="space-y-2">
              <Input placeholder="To (email, supports {{field}})" value={actionConfig.to || ""} onChange={(e) => setAct({ to: e.target.value })} />
              <Input placeholder="Subject" value={actionConfig.subject || ""} onChange={(e) => setAct({ subject: e.target.value })} />
              <Textarea placeholder="Body" value={actionConfig.body || ""} onChange={(e) => setAct({ body: e.target.value })} />
            </div>
          )}
          {actionType === "create_notification" && (
            <div className="space-y-2">
              <Input placeholder="Notify user ID (blank = triggering user)" value={actionConfig.notifyUserId ?? ""} onChange={(e) => setAct({ notifyUserId: e.target.value ? Number(e.target.value) : undefined })} />
              <Input placeholder="Message (supports {{field}})" value={actionConfig.message || ""} onChange={(e) => setAct({ message: e.target.value })} />
            </div>
          )}
          {actionType === "webhook" && (
            <Input placeholder="https://… (receives JSON POST)" value={actionConfig.url || ""} onChange={(e) => setAct({ url: e.target.value })} />
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={isActive} onCheckedChange={setIsActive} /> Active
        </label>
        <Button onClick={save} disabled={saving || !name.trim()} className="gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save rule
        </Button>
      </div>
    </div>
  );
}
