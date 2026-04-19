import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
  DialogTrigger,
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
import { UserCircle, Plus, Search, Loader2, Award, Layers, Upload } from "lucide-react";
import { toast } from "sonner";
import { format, addMonths } from "date-fns";
import { getStatusColor } from "@/lib/statusColors";
import DocumentsCell from "@/components/DocumentsCell";

// ── helpers ──────────────────────────────────────────────────────
function fmt$(v: string | number | null | undefined): string {
  if (v == null || v === "") return "-";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "-";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtNum(v: string | number | null | undefined): string {
  if (v == null || v === "") return "-";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "-";
  return n.toLocaleString("en-US");
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "-";
  if (v < 0.01) return "<0.01%";
  return v.toFixed(2) + "%";
}

function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return "-";
  try { return format(new Date(v), "MMM d, yyyy"); } catch { return "-"; }
}

function calcNextVestDate(
  vestingStart: string | Date | null | undefined,
  cliffMonths: number | null | undefined,
  schedule: string | null | undefined,
  sharesVested: string | null | undefined,
  totalShares: string | null | undefined,
): string {
  if (!vestingStart || !schedule || schedule === "none") return "-";
  const start = new Date(vestingStart);
  const cliff = cliffMonths ?? 0;
  const vested = parseFloat(sharesVested || "0");
  const total = parseFloat(totalShares || "0");
  if (total > 0 && vested >= total) return "Fully vested";

  const now = new Date();
  const cliffDate = addMonths(start, cliff);
  if (now < cliffDate) return fmtDate(cliffDate);

  const incrementMonths = schedule === "monthly" ? 1 : schedule === "quarterly" ? 3 : schedule === "annually" ? 12 : 1;
  let next = cliffDate;
  while (next <= now) {
    next = addMonths(next, incrementMonths);
  }
  return fmtDate(next);
}

// ── type badge colors ────────────────────────────────────────────
const typeColors: Record<string, string> = {
  founder: "bg-purple-500/10 text-purple-600",
  employee: "bg-blue-500/10 text-blue-600",
  investor: "bg-emerald-500/10 text-emerald-600",
  advisor: "bg-amber-500/10 text-amber-600",
  board_member: "bg-indigo-500/10 text-indigo-600",
  contractor: "bg-cyan-500/10 text-cyan-600",
  full_time: "bg-blue-500/10 text-blue-600",
  part_time: "bg-teal-500/10 text-teal-600",
  intern: "bg-pink-500/10 text-pink-600",
};

const statusColors: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600",
  inactive: "bg-gray-500/10 text-gray-600",
  terminated: "bg-red-500/10 text-red-600",
  departed: "bg-orange-500/10 text-orange-600",
  on_leave: "bg-yellow-500/10 text-yellow-600",
};

// ── unified row type (one row per person) ───────────────────────
interface UnifiedRow {
  key: string;
  stakeholderId: number | null;
  employeeId: number | null;
  userId: number | null;
  name: string;
  email: string;
  type: string;
  title: string;
  department: string;
  salary: string;
  hireDate: string | null;
  totalShares: number;
  totalGrantValue: number;
  ownershipPct: number | null;
  status: string;
}

// ── Manager View: Tasks, Time Tracking, Invoices for an employee ──
function EmployeeTasksSection({ email, name }: { email: string; name: string }) {
  const { data: allTasks } = trpc.projects.tasks.useQuery({ projectId: 0 });
  const { data: users } = trpc.users.list.useQuery();

  // Find user by email to get their assigned tasks
  const user = users?.find((u: any) => u.email?.toLowerCase() === email?.toLowerCase());
  const employeeTasks = useMemo(() => {
    if (!allTasks || !user) return [];
    return (allTasks as any[]).filter((t: any) => t.assigneeId === user.id);
  }, [allTasks, user]);

  const activeTasks = employeeTasks.filter((t: any) => t.status !== "completed" && t.status !== "cancelled");
  const completedTasks = employeeTasks.filter((t: any) => t.status === "completed");
  const overdueTasks = activeTasks.filter((t: any) => t.dueDate && new Date(t.dueDate) < new Date());

  return (
    <div className="space-y-4">
      {/* Task Summary */}
      <div>
        <h4 className="text-sm font-semibold text-muted-foreground mb-2">Tasks & Workload</h4>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div className="p-2.5 bg-muted/50 rounded-lg text-center">
            <div className="text-lg font-semibold">{activeTasks.length}</div>
            <div className="text-[10px] text-muted-foreground uppercase">Active</div>
          </div>
          <div className="p-2.5 bg-muted/50 rounded-lg text-center">
            <div className="text-lg font-semibold text-red-600">{overdueTasks.length}</div>
            <div className="text-[10px] text-muted-foreground uppercase">Overdue</div>
          </div>
          <div className="p-2.5 bg-muted/50 rounded-lg text-center">
            <div className="text-lg font-semibold text-green-600">{completedTasks.length}</div>
            <div className="text-[10px] text-muted-foreground uppercase">Completed</div>
          </div>
          <div className="p-2.5 bg-muted/50 rounded-lg text-center">
            <div className="text-lg font-semibold">
              {employeeTasks.reduce((s: number, t: any) => s + parseFloat(t.actualHours || "0"), 0).toFixed(1)}h
            </div>
            <div className="text-[10px] text-muted-foreground uppercase">Hours Logged</div>
          </div>
        </div>
        {activeTasks.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Due Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeTasks.slice(0, 10).map((t: any) => {
                  const isOverdue = t.dueDate && new Date(t.dueDate) < new Date();
                  const isUrgent = t.dueDate && new Date(t.dueDate) < new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-muted-foreground">{t.projectName || "-"}</TableCell>
                      <TableCell>
                        <Badge className={
                          t.status === "in_progress" ? "bg-blue-500/10 text-blue-600" :
                          t.status === "review" ? "bg-purple-500/10 text-purple-600" :
                          "bg-gray-500/10 text-gray-600"
                        }>{t.status?.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          t.priority === "urgent" || t.priority === "critical" ? "bg-red-500/10 text-red-600" :
                          t.priority === "high" ? "bg-orange-500/10 text-orange-600" :
                          "bg-gray-500/10 text-gray-600"
                        }>{t.priority}</Badge>
                      </TableCell>
                      <TableCell className={isOverdue ? "text-red-600 font-medium" : isUrgent ? "text-yellow-600" : ""}>
                        {t.dueDate ? fmtDate(t.dueDate) : "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No active tasks assigned.</p>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
export default function PeopleAndEquity() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("team");
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [isPersonOpen, setIsPersonOpen] = useState(false);
  const [isGrantOpen, setIsGrantOpen] = useState(false);
  const [isShareClassOpen, setIsShareClassOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<UnifiedRow | null>(null);
  const [scForm, setScForm] = useState({ name: "", type: "common", authorizedShares: "", pricePerShare: "", parValue: "0.0001", liquidationPreference: "1", votingRights: true, isParticipating: false });

  // ── form state: add person ──
  const [personForm, setPersonForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    type: "employee" as "founder" | "employee" | "investor" | "advisor" | "board_member" | "contractor",
    employmentType: "full_time" as "full_time" | "part_time" | "contractor" | "intern",
    departmentId: 0, jobTitle: "", hireDate: "", salary: "", notes: "",
  });

  // ── form state: add grant ──
  const [grantForm, setGrantForm] = useState({
    stakeholderId: 0, shareClassId: 0,
    grantType: "option_iso" as "purchase" | "option_iso" | "option_nso" | "rsu" | "restricted_stock" | "convertible_note" | "safe" | "warrant" | "secondary",
    grantDate: "", shares: "", pricePerShare: "", exercisePrice: "",
    vestingSchedule: "monthly" as "none" | "monthly" | "quarterly" | "annually" | "custom",
    vestingStartDate: "", cliffMonths: 12, totalVestingMonths: 48, notes: "",
  });

  const utils = trpc.useUtils();

  // ── data queries ──
  const { data: employees, isLoading: loadingEmp } = trpc.employees.list.useQuery();
  const { data: stakeholders, isLoading: loadingSH } = trpc.capTable.stakeholders.list.useQuery();
  const { data: grants, isLoading: loadingGrants } = trpc.capTable.grants.list.useQuery();
  const { data: shareClasses } = trpc.capTable.shareClasses.list.useQuery();

  // ── mutations ──
  const createEmployee = trpc.employees.create.useMutation({
    onSuccess: () => { utils.employees.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const createStakeholder = trpc.capTable.stakeholders.create.useMutation({
    onSuccess: () => { utils.capTable.stakeholders.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const createShareClass = trpc.capTable.shareClasses.create.useMutation({
    onSuccess: () => { utils.capTable.shareClasses.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const createGrant = trpc.capTable.grants.create.useMutation({
    onSuccess: () => {
      toast.success("Grant created");
      setIsGrantOpen(false);
      setGrantForm({ stakeholderId: 0, shareClassId: 0, grantType: "option_iso", grantDate: "", shares: "", pricePerShare: "", exercisePrice: "", vestingSchedule: "monthly", vestingStartDate: "", cliffMonths: 12, totalVestingMonths: 48, notes: "" });
      utils.capTable.grants.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // ── set of terminated stakeholder IDs (excluded from equity calcs) ──
  const terminatedStakeholderIds = useMemo(() => {
    const ids = new Set<number>();
    stakeholders?.forEach((sh: any) => {
      if (sh.status === "terminated") ids.add(sh.id);
    });
    return ids;
  }, [stakeholders]);

  // ── compute total shares for ownership % (exclude terminated) ──
  const totalOutstandingShares = useMemo(() => {
    if (!grants) return 0;
    return grants.reduce((sum, g) => {
      if (terminatedStakeholderIds.has((g as any).stakeholderId)) return sum;
      return sum + parseFloat((g as any).shares || "0");
    }, 0);
  }, [grants, terminatedStakeholderIds]);

  // ── ownership distribution for donut chart (by type, excluding terminated) ──
  const ownershipData = useMemo(() => {
    if (!grants || !stakeholders) return [];
    const typeColorMap: Record<string, string> = {
      founder: "#8b5cf6",
      employee: "#3b82f6",
      investor: "#10b981",
      advisor: "#f59e0b",
      board_member: "#6366f1",
      contractor: "#06b6d4",
    };
    const typeLabelMap: Record<string, string> = {
      founder: "Founders",
      employee: "Employees",
      investor: "Investors",
      advisor: "Advisors",
      board_member: "Board Members",
      contractor: "Contractors",
    };
    const byType = new Map<string, number>();
    grants.forEach((g: any) => {
      if (terminatedStakeholderIds.has(g.stakeholderId)) return;
      const sh = stakeholders.find((s: any) => s.id === g.stakeholderId);
      const type = sh?.type || "employee";
      byType.set(type, (byType.get(type) || 0) + parseFloat(g.shares || "0"));
    });
    const entries = Array.from(byType.entries())
      .map(([type, shares]) => ({ type, shares }))
      .sort((a, b) => b.shares - a.shares);
    const total = entries.reduce((s, e) => s + e.shares, 0);
    return entries.map((e) => ({
      name: typeLabelMap[e.type] || e.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) + "s",
      shares: e.shares,
      pct: total > 0 ? (e.shares / total) * 100 : 0,
      color: typeColorMap[e.type] || "#9ca3af",
    }));
  }, [grants, stakeholders, terminatedStakeholderIds]);

  // ── build share-class lookup ──
  const scMap = useMemo(() => {
    const m = new Map<number, string>();
    shareClasses?.forEach((sc: any) => m.set(sc.id, sc.name));
    return m;
  }, [shareClasses]);

  // ── build grant-by-stakeholder lookup ──
  const grantsByStakeholder = useMemo(() => {
    const m = new Map<number, any[]>();
    grants?.forEach((g: any) => {
      const arr = m.get(g.stakeholderId) || [];
      arr.push(g);
      m.set(g.stakeholderId, arr);
    });
    return m;
  }, [grants]);

  // ── merge employees + stakeholders into unified rows (one per person) ──
  const rows: UnifiedRow[] = useMemo(() => {
    const result: UnifiedRow[] = [];
    const seenEmails = new Set<string>();

    // process stakeholders first (they have equity)
    stakeholders?.forEach((sh: any) => {
      const matchingEmp = employees?.find(
        (e) => (sh.email && e.email && sh.email.toLowerCase() === e.email.toLowerCase()) || (sh.userId && (e as any).userId === sh.userId)
      );
      const sGrants = grantsByStakeholder.get(sh.id) || [];
      const email = sh.email || matchingEmp?.email || "";
      if (email) seenEmails.add(email.toLowerCase());

      // aggregate totals across all grants
      let totalShares = 0;
      let totalValue = 0;
      sGrants.forEach((g: any) => {
        const granted = parseFloat(g.shares || "0");
        const pps = parseFloat(g.pricePerShare || "0");
        totalShares += granted;
        totalValue += parseFloat(g.totalValue || "0") || (granted * pps);
      });

      const personName = sh.name || (matchingEmp ? `${matchingEmp.firstName} ${matchingEmp.lastName}`.trim() : "");
      if (!personName || personName === "-") return; // skip blank entries

      result.push({
        key: `sh-${sh.id}`,
        stakeholderId: sh.id,
        employeeId: matchingEmp?.id ?? null,
        userId: matchingEmp?.userId ?? sh.userId ?? null,
        name: personName,
        email,
        type: sh.type || (matchingEmp ? matchingEmp.employmentType : "-"),
        title: sh.title || matchingEmp?.jobTitle || "-",
        department: matchingEmp ? (matchingEmp.departmentId ? `Dept #${matchingEmp.departmentId}` : "-") : "-",
        salary: matchingEmp?.salary ? fmt$(matchingEmp.salary) : "-",
        hireDate: matchingEmp?.hireDate ? String(matchingEmp.hireDate) : null,
        totalShares,
        totalGrantValue: totalValue,
        ownershipPct: totalOutstandingShares > 0 && totalShares > 0 ? (totalShares / totalOutstandingShares) * 100 : null,
        status: sh.status || matchingEmp?.status || "active",
      });
    });

    // add employees that aren't already covered by a stakeholder
    employees?.forEach((e) => {
      if (e.email && seenEmails.has(e.email.toLowerCase())) return;
      result.push({
        key: `emp-${e.id}`,
        stakeholderId: null,
        employeeId: e.id,
        userId: (e as any).userId ?? null,
        name: `${e.firstName} ${e.lastName}`,
        email: e.email || "-",
        type: e.employmentType || "employee",
        title: e.jobTitle || "-",
        department: e.departmentId ? `Dept #${e.departmentId}` : "-",
        salary: e.salary ? fmt$(e.salary) : "-",
        hireDate: e.hireDate ? String(e.hireDate) : null,
        totalShares: 0,
        totalGrantValue: 0,
        ownershipPct: null,
        status: e.status || "active",
      });
    });

    return result;
  }, [employees, stakeholders, grantsByStakeholder, totalOutstandingShares]);

  // ── filter (hide terminated unless explicitly selecting "terminated" status) ──
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const matchSearch =
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.email.toLowerCase().includes(search.toLowerCase());
      const teamTypes = ["founder", "employee", "full_time", "part_time", "contractor", "intern"];
      const matchType = typeFilter === "all"
        ? true
        : typeFilter === "team"
          ? teamTypes.includes(r.type)
          : r.type === typeFilter;
      const matchStatus =
        statusFilter === "all"
          ? r.status !== "terminated"
          : statusFilter === "terminated"
            ? r.status === "terminated"
            : r.status === statusFilter;
      return matchSearch && matchType && matchStatus;
    });
  }, [rows, search, typeFilter, statusFilter]);

  const isLoading = loadingEmp || loadingSH || loadingGrants;

  // ── submit: add person (creates both employee + stakeholder) ──
  const handlePersonSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createEmployee.mutateAsync({
        firstName: personForm.firstName,
        lastName: personForm.lastName,
        email: personForm.email || undefined,
        phone: personForm.phone || undefined,
        employmentType: personForm.employmentType,
        departmentId: personForm.departmentId || undefined,
        jobTitle: personForm.jobTitle || undefined,
        hireDate: personForm.hireDate ? new Date(personForm.hireDate) : undefined,
        salary: personForm.salary || undefined,
        notes: personForm.notes || undefined,
      });
      await createStakeholder.mutateAsync({
        name: `${personForm.firstName} ${personForm.lastName}`,
        email: personForm.email || undefined,
        type: personForm.type,
        title: personForm.jobTitle || undefined,
      });
      toast.success("Person added successfully");
      setIsPersonOpen(false);
      setPersonForm({
        firstName: "", lastName: "", email: "", phone: "",
        type: "employee", employmentType: "full_time",
        departmentId: 0, jobTitle: "", hireDate: "", salary: "", notes: "",
      });
    } catch { /* errors surfaced by mutation onError */ }
  };

  // ── submit: add grant ──
  const handleGrantSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const totalValue = String(parseFloat(grantForm.shares || "0") * parseFloat(grantForm.pricePerShare || "0"));
    createGrant.mutate({
      stakeholderId: grantForm.stakeholderId,
      shareClassId: grantForm.shareClassId,
      grantType: grantForm.grantType,
      grantDate: grantForm.grantDate,
      shares: grantForm.shares,
      pricePerShare: grantForm.pricePerShare,
      exercisePrice: grantForm.exercisePrice || undefined,
      vestingSchedule: grantForm.vestingSchedule,
      vestingStartDate: grantForm.vestingStartDate || undefined,
      cliffMonths: grantForm.cliffMonths,
      totalVestingMonths: grantForm.totalVestingMonths,
      totalValue,
      notes: grantForm.notes || undefined,
    });
  };

  // ══════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <UserCircle className="h-8 w-8" />
            People
          </h1>
          <p className="text-muted-foreground mt-1">
            Team members, investors, advisors, and equity holdings
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.location.href = "/hr/me"}>
            <UserCircle className="h-4 w-4 mr-1" /> My Portal
          </Button>
          <Button variant="outline" onClick={() => window.location.href = "/hr/payroll"}>
            <Layers className="h-4 w-4 mr-1" /> Payroll
          </Button>
          <Button variant="outline" onClick={() => window.location.href = "/import"}>
            <Upload className="h-4 w-4 mr-1" /> Import
          </Button>
          {/* Add Person dialog */}
          <Dialog open={isPersonOpen} onOpenChange={setIsPersonOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Person
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <form onSubmit={handlePersonSubmit}>
                <DialogHeader>
                  <DialogTitle>Add Person</DialogTitle>
                  <DialogDescription>
                    Creates both an employee record and a stakeholder record.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="pFirstName">First Name *</Label>
                      <Input id="pFirstName" value={personForm.firstName} onChange={(e) => setPersonForm({ ...personForm, firstName: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pLastName">Last Name *</Label>
                      <Input id="pLastName" value={personForm.lastName} onChange={(e) => setPersonForm({ ...personForm, lastName: e.target.value })} required />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="pEmail">Email</Label>
                      <Input id="pEmail" type="email" value={personForm.email} onChange={(e) => setPersonForm({ ...personForm, email: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pPhone">Phone</Label>
                      <Input id="pPhone" value={personForm.phone} onChange={(e) => setPersonForm({ ...personForm, phone: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Stakeholder Type</Label>
                      <Select value={personForm.type} onValueChange={(v: any) => setPersonForm({ ...personForm, type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="founder">Founder</SelectItem>
                          <SelectItem value="employee">Employee</SelectItem>
                          <SelectItem value="investor">Investor</SelectItem>
                          <SelectItem value="advisor">Advisor</SelectItem>
                          <SelectItem value="board_member">Board Member</SelectItem>
                          <SelectItem value="contractor">Contractor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Employment Type</Label>
                      <Select value={personForm.employmentType} onValueChange={(v: any) => setPersonForm({ ...personForm, employmentType: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="full_time">Full Time</SelectItem>
                          <SelectItem value="part_time">Part Time</SelectItem>
                          <SelectItem value="contractor">Contractor</SelectItem>
                          <SelectItem value="intern">Intern</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="pTitle">Job Title</Label>
                      <Input id="pTitle" value={personForm.jobTitle} onChange={(e) => setPersonForm({ ...personForm, jobTitle: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pDept">Department ID</Label>
                      <Input id="pDept" type="number" value={personForm.departmentId || ""} onChange={(e) => setPersonForm({ ...personForm, departmentId: parseInt(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="pHire">Start Date</Label>
                      <Input id="pHire" type="date" value={personForm.hireDate} onChange={(e) => setPersonForm({ ...personForm, hireDate: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pSalary">Salary</Label>
                      <Input id="pSalary" value={personForm.salary} onChange={(e) => setPersonForm({ ...personForm, salary: e.target.value })} placeholder="e.g. 120000" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pNotes">Notes</Label>
                    <Textarea id="pNotes" value={personForm.notes} onChange={(e) => setPersonForm({ ...personForm, notes: e.target.value })} rows={2} />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsPersonOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createEmployee.isPending || createStakeholder.isPending}>
                    {(createEmployee.isPending || createStakeholder.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Add Person
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Share Classes and Grant moved to Investors page */}
          <Dialog open={isShareClassOpen} onOpenChange={setIsShareClassOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Layers className="h-4 w-4 mr-2" />
                Share Classes
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Share Classes</DialogTitle>
                <DialogDescription>Manage equity share classes</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {/* Existing share classes */}
                {shareClasses && (shareClasses as any[]).length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Authorized</TableHead>
                          <TableHead className="text-right">Price/Share</TableHead>
                          <TableHead className="text-right">Par Value</TableHead>
                          <TableHead>Voting</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(shareClasses as any[]).map((sc: any) => (
                          <TableRow key={sc.id}>
                            <TableCell className="font-medium">{sc.name}</TableCell>
                            <TableCell><Badge variant="outline">{sc.type}</Badge></TableCell>
                            <TableCell className="text-right font-mono">{Number(sc.authorizedShares || 0).toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono">${Number(sc.pricePerShare || 0).toFixed(4)}</TableCell>
                            <TableCell className="text-right font-mono">${Number(sc.parValue || 0).toFixed(4)}</TableCell>
                            <TableCell>{sc.votingRights ? "Yes" : "No"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {/* Create new share class form */}
                <div className="border-t pt-4">
                  <h4 className="text-sm font-semibold mb-3">Create New Share Class</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Name</Label>
                      <Input placeholder="Series A Preferred" value={scForm.name} onChange={(e) => setScForm({ ...scForm, name: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Type</Label>
                      <Select value={scForm.type} onValueChange={(v) => setScForm({ ...scForm, type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="common">Common</SelectItem>
                          <SelectItem value="preferred">Preferred</SelectItem>
                          <SelectItem value="convertible_note">Convertible Note</SelectItem>
                          <SelectItem value="safe">SAFE</SelectItem>
                          <SelectItem value="warrant">Warrant</SelectItem>
                          <SelectItem value="option_pool">Option Pool</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Authorized Shares</Label>
                      <Input type="number" placeholder="10000000" value={scForm.authorizedShares} onChange={(e) => setScForm({ ...scForm, authorizedShares: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Price per Share</Label>
                      <Input type="number" step="0.0001" placeholder="1.00" value={scForm.pricePerShare} onChange={(e) => setScForm({ ...scForm, pricePerShare: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Par Value</Label>
                      <Input type="number" step="0.0001" placeholder="0.0001" value={scForm.parValue} onChange={(e) => setScForm({ ...scForm, parValue: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Liquidation Preference</Label>
                      <Input type="number" step="0.01" placeholder="1.0" value={scForm.liquidationPreference} onChange={(e) => setScForm({ ...scForm, liquidationPreference: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={scForm.votingRights} onChange={(e) => setScForm({ ...scForm, votingRights: e.target.checked })} />
                      Voting Rights
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={scForm.isParticipating} onChange={(e) => setScForm({ ...scForm, isParticipating: e.target.checked })} />
                      Participating
                    </label>
                  </div>
                  <Button className="mt-3" onClick={async () => {
                    try {
                      await createShareClass.mutateAsync({
                        name: scForm.name,
                        type: scForm.type as any,
                        authorizedShares: scForm.authorizedShares || undefined,
                        pricePerShare: scForm.pricePerShare || undefined,
                        parValue: scForm.parValue || "0.0001",
                        liquidationPreference: scForm.liquidationPreference || "1",
                        votingRights: scForm.votingRights,
                        isParticipating: scForm.isParticipating,
                      });
                      toast.success("Share class created");
                      setScForm({ name: "", type: "common", authorizedShares: "", pricePerShare: "", parValue: "0.0001", liquidationPreference: "1", votingRights: true, isParticipating: false });
                    } catch (err: any) {
                      toast.error(err.message || "Failed to create share class");
                    }
                  }}>
                    Create Share Class
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Add Grant dialog */}
          <Dialog open={isGrantOpen} onOpenChange={setIsGrantOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Award className="h-4 w-4 mr-2" />
                Add Grant
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <form onSubmit={handleGrantSubmit}>
                <DialogHeader>
                  <DialogTitle>Add Equity Grant</DialogTitle>
                  <DialogDescription>Grant equity to a stakeholder.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Stakeholder *</Label>
                      <Select value={grantForm.stakeholderId ? String(grantForm.stakeholderId) : ""} onValueChange={(v) => setGrantForm({ ...grantForm, stakeholderId: parseInt(v) })}>
                        <SelectTrigger><SelectValue placeholder="Select person" /></SelectTrigger>
                        <SelectContent>
                          {stakeholders?.map((sh: any) => (
                            <SelectItem key={sh.id} value={String(sh.id)}>{sh.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Share Class *</Label>
                      <Select value={grantForm.shareClassId ? String(grantForm.shareClassId) : ""} onValueChange={(v) => setGrantForm({ ...grantForm, shareClassId: parseInt(v) })}>
                        <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                        <SelectContent>
                          {shareClasses?.map((sc: any) => (
                            <SelectItem key={sc.id} value={String(sc.id)}>{sc.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Grant Type</Label>
                      <Select value={grantForm.grantType} onValueChange={(v: any) => setGrantForm({ ...grantForm, grantType: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="purchase">Purchase</SelectItem>
                          <SelectItem value="option_iso">ISO Option</SelectItem>
                          <SelectItem value="option_nso">NSO Option</SelectItem>
                          <SelectItem value="rsu">RSU</SelectItem>
                          <SelectItem value="restricted_stock">Restricted Stock</SelectItem>
                          <SelectItem value="safe">SAFE</SelectItem>
                          <SelectItem value="warrant">Warrant</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gDate">Grant Date *</Label>
                      <Input id="gDate" type="date" value={grantForm.grantDate} onChange={(e) => setGrantForm({ ...grantForm, grantDate: e.target.value })} required />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="gShares">Shares *</Label>
                      <Input id="gShares" value={grantForm.shares} onChange={(e) => setGrantForm({ ...grantForm, shares: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gPPS">Price/Share *</Label>
                      <Input id="gPPS" value={grantForm.pricePerShare} onChange={(e) => setGrantForm({ ...grantForm, pricePerShare: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gExPrice">Exercise Price</Label>
                      <Input id="gExPrice" value={grantForm.exercisePrice} onChange={(e) => setGrantForm({ ...grantForm, exercisePrice: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Vesting Schedule</Label>
                      <Select value={grantForm.vestingSchedule} onValueChange={(v: any) => setGrantForm({ ...grantForm, vestingSchedule: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="quarterly">Quarterly</SelectItem>
                          <SelectItem value="annually">Annually</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gCliff">Cliff (months)</Label>
                      <Input id="gCliff" type="number" value={grantForm.cliffMonths} onChange={(e) => setGrantForm({ ...grantForm, cliffMonths: parseInt(e.target.value) || 0 })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gVestStart">Vesting Start</Label>
                      <Input id="gVestStart" type="date" value={grantForm.vestingStartDate} onChange={(e) => setGrantForm({ ...grantForm, vestingStartDate: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gNotes">Notes</Label>
                    <Textarea id="gNotes" value={grantForm.notes} onChange={(e) => setGrantForm({ ...grantForm, notes: e.target.value })} rows={2} />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsGrantOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createGrant.isPending}>
                    {createGrant.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Add Grant
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Payroll Summary */}
      {employees && employees.length > 0 && (() => {
        const active = employees.filter((e) => e.status === "active");
        const annualPayroll = active.reduce((sum, e) => {
          const sal = parseFloat(String(e.salary || "0"));
          if (!sal) return sum;
          const freq = (e as any).salaryFrequency || "annual";
          if (freq === "hourly") return sum + sal * 2080;
          if (freq === "monthly") return sum + sal * 12;
          if (freq === "biweekly") return sum + sal * 26;
          if (freq === "weekly") return sum + sal * 52;
          return sum + sal;
        }, 0);
        const avgSalary = active.length > 0 ? annualPayroll / active.length : 0;
        return (
          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="pt-4 pb-4">
              <div className="text-sm text-muted-foreground">Active Employees</div>
              <div className="text-2xl font-semibold">{active.length}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-4">
              <div className="text-sm text-muted-foreground">Annual Payroll</div>
              <div className="text-2xl font-semibold">{fmt$(annualPayroll)}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-4">
              <div className="text-sm text-muted-foreground">Avg Salary</div>
              <div className="text-2xl font-semibold">{fmt$(avgSalary)}</div>
            </CardContent></Card>
          </div>
        );
      })()}

      {/* Cap Table Visual — moved to Investors page */}
      {false && grants && grants.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-8">
              {/* CSS Donut Chart */}
              <div className="relative w-32 h-32 shrink-0">
                <svg viewBox="0 0 36 36" className="w-32 h-32 -rotate-90">
                  {ownershipData.map((seg, i) => (
                    <circle
                      key={i}
                      cx="18" cy="18" r="15.91549"
                      fill="none"
                      stroke={seg.color}
                      strokeWidth="3.5"
                      strokeDasharray={`${seg.pct} ${100 - seg.pct}`}
                      strokeDashoffset={`-${ownershipData.slice(0, i).reduce((s, d) => s + d.pct, 0)}`}
                    />
                  ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-bold">{fmtNum(totalOutstandingShares)}</span>
                  <span className="text-[10px] text-muted-foreground">shares</span>
                </div>
              </div>
              {/* Legend */}
              <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                {ownershipData.map((seg, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                    <span className="font-medium">{seg.name}</span>
                    <span className="text-muted-foreground">{seg.pct.toFixed(1)}%</span>
                    <span className="text-muted-foreground text-xs">({fmtNum(seg.shares)})</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search people..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="team">Team Members</SelectItem>
                <SelectItem value="all">All (incl. Investors)</SelectItem>
                <SelectItem value="founder">Founder</SelectItem>
                <SelectItem value="employee">Employee</SelectItem>
                <SelectItem value="contractor">Contractor</SelectItem>
                <SelectItem value="investor">Investor</SelectItem>
                <SelectItem value="advisor">Advisor</SelectItem>
                <SelectItem value="board_member">Board Member</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
                <SelectItem value="departed">Departed</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <UserCircle className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No people found</p>
              <p className="text-sm">Add your first team member to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background z-10 min-w-[160px]">Name</TableHead>
                    <TableHead className="min-w-[100px]">Type</TableHead>
                    <TableHead className="min-w-[90px]">Status</TableHead>
                    <TableHead className="min-w-[110px] text-right">Shares</TableHead>
                    <TableHead className="min-w-[90px] text-right">Ownership %</TableHead>
                    <TableHead className="min-w-[110px] text-right">Grant Value</TableHead>
                    <TableHead className="min-w-[100px]">Documents</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.key} className="h-9 cursor-pointer hover:bg-muted/50" onClick={() => setSelectedPerson(r)}>
                      <TableCell className="sticky left-0 bg-background z-10 font-medium py-1.5 px-3">{r.name}</TableCell>
                      <TableCell className="py-1.5 px-3">
                        {r.type && r.type !== "-" ? (
                          <Badge className={typeColors[r.type] || "bg-gray-500/10 text-gray-600"}>
                            {r.type.replace(/_/g, " ")}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="py-1.5 px-3">
                        {r.status && r.status !== "-" ? (
                          <Badge className={statusColors[r.status] || "bg-gray-500/10 text-gray-600"}>{r.status.replace(/_/g, " ")}</Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="py-1.5 px-3 text-right tabular-nums">{r.totalShares > 0 ? fmtNum(r.totalShares) : "-"}</TableCell>
                      <TableCell className="py-1.5 px-3 text-right tabular-nums">{fmtPct(r.ownershipPct)}</TableCell>
                      <TableCell className="py-1.5 px-3 text-right tabular-nums">{r.totalGrantValue > 0 ? fmt$(r.totalGrantValue) : "-"}</TableCell>
                      <TableCell className="py-1.5 px-3" onClick={(e) => e.stopPropagation()}>
                        {r.stakeholderId ? (
                          <DocumentsCell referenceType="stakeholder" referenceId={r.stakeholderId} docTypeSet="hr" />
                        ) : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Person Detail Dialog */}
      <Dialog open={selectedPerson !== null} onOpenChange={(open) => { if (!open) setSelectedPerson(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {selectedPerson && (() => {
            const personGrants = selectedPerson.stakeholderId
              ? (grantsByStakeholder.get(selectedPerson.stakeholderId) || [])
              : [];

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-xl">{selectedPerson.name}</DialogTitle>
                  <DialogDescription>{selectedPerson.title !== "-" ? selectedPerson.title : ""} {selectedPerson.department !== "-" ? `- ${selectedPerson.department}` : ""}</DialogDescription>
                </DialogHeader>

                <PersonDetailContent person={selectedPerson} personGrants={personGrants} scMap={scMap} />
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Full Employee Detail Panel (all sections in one view) ──
function PersonDetailContent({ person, personGrants, scMap }: { person: UnifiedRow; personGrants: any[]; scMap: Map<number, string> }) {
  const { data: compHistory } = trpc.employees.compensationHistory.useQuery(
    { employeeId: person.employeeId! },
    { enabled: !!person.employeeId }
  );
  const { data: payments } = trpc.employeePayments.list.useQuery(
    { employeeId: person.employeeId! },
    { enabled: !!person.employeeId }
  );
  const { data: timeEntries } = trpc.timeTracking.entries.list.useQuery(
    { userId: person.userId! },
    { enabled: !!person.userId }
  );
  const { data: allContracts } = trpc.contracts.list.useQuery();
  const personContracts = useMemo(() => {
    if (!allContracts) return [];
    return (allContracts as any[]).filter((c: any) =>
      (c.partyType === "employee" && c.partyId === person.employeeId) ||
      (c.partyName && person.name && c.partyName.toLowerCase().includes(person.name.toLowerCase()))
    );
  }, [allContracts, person]);

  return (
                <div className="space-y-5">
                  {/* Personal Information */}
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-2">Personal Information</h4>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span>{person.name}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{person.email || "-"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>
                        {person.type && person.type !== "-" ? (
                          <Badge className={typeColors[person.type] || "bg-gray-500/10 text-gray-600"}>{person.type.replace(/_/g, " ")}</Badge>
                        ) : "-"}
                      </span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Title</span><span>{person.title}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Department</span><span>{person.department}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Salary</span><span>{person.salary}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Hire Date</span><span>{person.hireDate ? fmtDate(person.hireDate) : "-"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span>
                        {person.status && person.status !== "-" ? (
                          <Badge className={statusColors[person.status] || "bg-gray-500/10 text-gray-600"}>{person.status.replace(/_/g, " ")}</Badge>
                        ) : "-"}
                      </span></div>
                    </div>
                  </div>

                  {/* Compensation History */}
                  {person.employeeId && (
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-2">Compensation History</h4>
                      {compHistory && (compHistory as any[]).length > 0 ? (
                        <div className="border rounded-lg overflow-hidden">
                          <Table className="text-sm">
                            <TableHeader><TableRow>
                              <TableHead>Effective Date</TableHead>
                              <TableHead className="text-right">Salary</TableHead>
                              <TableHead>Frequency</TableHead>
                              <TableHead>Reason</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                              {(compHistory as any[]).map((c: any) => (
                                <TableRow key={c.id}>
                                  <TableCell>{fmtDate(c.effectiveDate)}</TableCell>
                                  <TableCell className="text-right font-medium">{fmt$(c.salary)}</TableCell>
                                  <TableCell>{c.salaryFrequency || "-"}</TableCell>
                                  <TableCell>{c.reason || "-"}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No compensation history recorded.</p>
                      )}
                    </div>
                  )}

                  {/* Payments */}
                  {person.employeeId && (
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-2">Payments</h4>
                      {payments && (payments as any[]).length > 0 ? (
                        <div className="border rounded-lg overflow-hidden">
                          <Table className="text-sm">
                            <TableHeader><TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                              <TableHead>Method</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                              {(payments as any[]).slice(0, 20).map((p: any) => (
                                <TableRow key={p.id}>
                                  <TableCell>{fmtDate(p.paymentDate)}</TableCell>
                                  <TableCell><Badge variant="outline">{p.type}</Badge></TableCell>
                                  <TableCell className="text-right font-medium">{fmt$(p.amount)}</TableCell>
                                  <TableCell>{p.paymentMethod?.replace(/_/g, " ") || "-"}</TableCell>
                                  <TableCell><Badge variant="secondary">{p.status}</Badge></TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No payment records.</p>
                      )}
                    </div>
                  )}

                  {/* Assigned Tasks */}
                  {!["investor", "advisor", "board_member"].includes(person.type) && (
                    <EmployeeTasksSection email={person.email} name={person.name} />
                  )}

                  {/* Time Tracked */}
                  {person.userId && (
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-2">Time Tracked</h4>
                      {timeEntries && (timeEntries as any[]).length > 0 ? (
                        <div className="border rounded-lg overflow-hidden">
                          <Table className="text-sm">
                            <TableHeader><TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Task</TableHead>
                              <TableHead className="text-right">Hours</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                              {(timeEntries as any[]).slice(0, 15).map((t: any) => (
                                <TableRow key={t.id}>
                                  <TableCell>{fmtDate(t.date)}</TableCell>
                                  <TableCell className="max-w-[200px] truncate">{t.taskDescription}</TableCell>
                                  <TableCell className="text-right font-medium">{parseFloat(t.hours || "0").toFixed(1)}</TableCell>
                                  <TableCell><Badge variant="outline">{t.category}</Badge></TableCell>
                                  <TableCell><Badge variant="secondary">{t.status}</Badge></TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No time entries.</p>
                      )}
                    </div>
                  )}

                  {/* Contracts */}
                  {personContracts.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-2">Contracts</h4>
                      <div className="border rounded-lg overflow-hidden">
                        <Table className="text-sm">
                          <TableHeader><TableRow>
                            <TableHead>Title</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Value</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow></TableHeader>
                          <TableBody>
                            {personContracts.map((c: any) => (
                              <TableRow key={c.id}>
                                <TableCell className="font-medium">{c.title}</TableCell>
                                <TableCell>{c.type || "-"}</TableCell>
                                <TableCell className="text-right">{c.value ? fmt$(c.value) : "-"}</TableCell>
                                <TableCell><Badge variant="secondary">{c.status}</Badge></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {/* Equity Grants */}
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-2">Equity Grants</h4>
                    {personGrants.length > 0 ? (
                      <div className="border rounded-lg overflow-hidden">
                        <Table className="text-sm">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Share Class</TableHead>
                              <TableHead className="text-right">Granted</TableHead>
                              <TableHead className="text-right">Vested</TableHead>
                              <TableHead className="text-right">Unvested</TableHead>
                              <TableHead className="text-right">Exercise Price</TableHead>
                              <TableHead>Vesting Start</TableHead>
                              <TableHead className="text-right">Cliff</TableHead>
                              <TableHead>Next Vest Date</TableHead>
                              <TableHead className="text-right">Grant Value</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {personGrants.map((g: any) => {
                              const granted = parseFloat(g.shares || "0");
                              const vested = parseFloat(g.sharesVested || "0");
                              const pps = parseFloat(g.pricePerShare || "0");
                              return (
                                <TableRow key={g.id}>
                                  <TableCell>{scMap.get(g.shareClassId) || "-"}</TableCell>
                                  <TableCell className="text-right tabular-nums">{fmtNum(granted)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{fmtNum(vested)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{fmtNum(Math.max(0, granted - vested))}</TableCell>
                                  <TableCell className="text-right tabular-nums">{g.exercisePrice ? fmt$(g.exercisePrice) : "-"}</TableCell>
                                  <TableCell>{fmtDate(g.vestingStartDate)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{g.cliffMonths != null ? `${g.cliffMonths}mo` : "-"}</TableCell>
                                  <TableCell>{calcNextVestDate(g.vestingStartDate, g.cliffMonths, g.vestingSchedule, g.sharesVested, g.shares)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{fmt$(g.totalValue || (granted * pps))}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No equity grants.</p>
                    )}
                  </div>

                  {/* Documents */}
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-2">Documents</h4>
                    {person.stakeholderId ? (
                      <DocumentsCell referenceType="stakeholder" referenceId={person.stakeholderId} />
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No stakeholder record linked.</p>
                    )}
                  </div>

                </div>
  );
}
