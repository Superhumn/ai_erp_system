import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  User,
  DollarSign,
  Calendar,
  ClipboardList,
  Shield,
  FileText,
  Users,
  CheckCircle2,
  Clock,
  Plus,
  Trash2,
  Circle,
  Phone,
} from "lucide-react";
import { toast } from "sonner";

const LEAVE_TYPES = [
  "vacation",
  "sick",
  "personal",
  "parental",
  "bereavement",
  "unpaid",
  "other",
] as const;

const BENEFIT_TYPES = [
  "health",
  "dental",
  "vision",
  "retirement_401k",
  "life_insurance",
  "disability",
  "hsa",
  "fsa",
  "commuter",
  "other",
] as const;

type LeaveType = (typeof LEAVE_TYPES)[number];
type BenefitType = (typeof BENEFIT_TYPES)[number];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-700",
  completed: "bg-green-100 text-green-800",
  in_progress: "bg-blue-100 text-blue-800",
  skipped: "bg-gray-100 text-gray-700",
  enrolled: "bg-green-100 text-green-800",
  waived: "bg-gray-100 text-gray-700",
  terminated: "bg-red-100 text-red-800",
  processed: "bg-green-100 text-green-800",
};

function formatCurrency(value: string | number | null | undefined) {
  const num = parseFloat(String(value || "0"));
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

function formatDate(date: string | Date | null | undefined) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function titleCase(s: string) {
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function EmployeePortal() {
  const utils = trpc.useUtils();

  const { data: me, isLoading: meLoading } = trpc.employeePortal.me.useQuery();
  const { data: payslips } = trpc.employeePortal.payslips.useQuery();
  const { data: ptoBalances } = trpc.employeePortal.ptoBalances.useQuery();
  const { data: leaveRequests } = trpc.employeePortal.leaveRequests.useQuery();
  const { data: onboardingTasks } = trpc.employeePortal.onboardingTasks.useQuery();
  const { data: benefits } = trpc.employeePortal.benefits.useQuery();
  const { data: documents } = trpc.employeePortal.documents.useQuery();
  const { data: directory } = trpc.employeePortal.directory.useQuery();
  const { data: emergencyContacts } = trpc.employeePortal.emergencyContacts.useQuery();
  const { data: compensation } = trpc.employeePortal.compensation.useQuery();

  if (meLoading) {
    return (
      <div className="p-6 text-muted-foreground">Loading your portal…</div>
    );
  }

  if (!me) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              No employee record is linked to your user account. Please contact HR to get set up.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalAccrued = (ptoBalances || []).reduce(
    (sum, b) => sum + parseFloat(String(b.accruedHours || "0")),
    0,
  );
  const totalUsed = (ptoBalances || []).reduce(
    (sum, b) => sum + parseFloat(String(b.usedHours || "0")),
    0,
  );
  const totalPending = (ptoBalances || []).reduce(
    (sum, b) => sum + parseFloat(String(b.pendingHours || "0")),
    0,
  );
  const availableHours = totalAccrued - totalUsed - totalPending;

  const openTasks = (onboardingTasks || []).filter((t) => t.status !== "completed" && t.status !== "skipped").length;
  const completedTasks = (onboardingTasks || []).filter((t) => t.status === "completed").length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <User className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">
            Welcome, {me.firstName}
          </h1>
          <p className="text-muted-foreground">
            {me.jobTitle || "Employee"} · Employee #{me.employeeNumber || "—"}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              PTO Available
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{availableHours.toFixed(1)}h</div>
            <p className="text-xs text-muted-foreground">
              {totalPending.toFixed(1)}h pending · {totalUsed.toFixed(1)}h used
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Last Payslip
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {payslips && payslips[0]
                ? formatCurrency(payslips[0].amount)
                : "—"}
            </div>
            <p className="text-xs text-muted-foreground">
              {payslips && payslips[0] ? formatDate(payslips[0].paymentDate) : "No pay history"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Onboarding
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {completedTasks}/{(onboardingTasks || []).length}
            </div>
            <p className="text-xs text-muted-foreground">{openTasks} open task(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Benefits Enrolled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(benefits || []).filter((b) => b.enrollmentStatus === "enrolled").length}
            </div>
            <p className="text-xs text-muted-foreground">
              of {(benefits || []).length} elections
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="pay">Pay</TabsTrigger>
          <TabsTrigger value="timeoff">Time Off</TabsTrigger>
          <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
          <TabsTrigger value="benefits">Benefits</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="directory">Directory</TabsTrigger>
          <TabsTrigger value="emergency">Emergency</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <ProfileTab me={me} onSaved={() => utils.employeePortal.me.invalidate()} />
        </TabsContent>

        <TabsContent value="pay" className="mt-4">
          <PayTab payslips={payslips || []} compensation={compensation || []} />
        </TabsContent>

        <TabsContent value="timeoff" className="mt-4">
          <TimeOffTab
            balances={ptoBalances || []}
            requests={leaveRequests || []}
            onChange={() => {
              utils.employeePortal.leaveRequests.invalidate();
              utils.employeePortal.ptoBalances.invalidate();
            }}
          />
        </TabsContent>

        <TabsContent value="onboarding" className="mt-4">
          <OnboardingTab
            tasks={onboardingTasks || []}
            onChange={() => utils.employeePortal.onboardingTasks.invalidate()}
          />
        </TabsContent>

        <TabsContent value="benefits" className="mt-4">
          <BenefitsTab
            benefits={benefits || []}
            onChange={() => utils.employeePortal.benefits.invalidate()}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <DocumentsTab documents={documents || []} />
        </TabsContent>

        <TabsContent value="directory" className="mt-4">
          <DirectoryTab directory={directory || []} />
        </TabsContent>

        <TabsContent value="emergency" className="mt-4">
          <EmergencyContactsTab
            contacts={emergencyContacts || []}
            onChange={() => utils.employeePortal.emergencyContacts.invalidate()}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ==================== Profile ====================
function ProfileTab({ me, onSaved }: { me: any; onSaved: () => void }) {
  const [phone, setPhone] = useState(me.phone || "");
  const [personalEmail, setPersonalEmail] = useState(me.personalEmail || "");
  const [address, setAddress] = useState(me.address || "");
  const [city, setCity] = useState(me.city || "");
  const [state, setState] = useState(me.state || "");
  const [country, setCountry] = useState(me.country || "");
  const [postalCode, setPostalCode] = useState(me.postalCode || "");

  // Sync form fields when 'me' data changes (e.g. after save or external update)
  useEffect(() => {
    setPhone(me.phone || "");
    setPersonalEmail(me.personalEmail || "");
    setAddress(me.address || "");
    setCity(me.city || "");
    setState(me.state || "");
    setCountry(me.country || "");
    setPostalCode(me.postalCode || "");
  }, [me]);

  const update = trpc.employeePortal.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile updated");
      onSaved();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Legal name</Label>
            <Input value={`${me.firstName} ${me.lastName}`} disabled />
          </div>
          <div>
            <Label>Work email</Label>
            <Input value={me.email || ""} disabled />
          </div>
          <div>
            <Label>Job title</Label>
            <Input value={me.jobTitle || ""} disabled />
          </div>
          <div>
            <Label>Hire date</Label>
            <Input value={formatDate(me.hireDate)} disabled />
          </div>
        </div>
        <div className="border-t pt-4 space-y-4">
          <div className="text-sm text-muted-foreground">
            Contact info you can edit yourself. For anything else (name, title,
            bank, tax ID), contact HR.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label>Personal email</Label>
              <Input value={personalEmail} onChange={(e) => setPersonalEmail(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label>Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div>
              <Label>City</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div>
              <Label>State / Region</Label>
              <Input value={state} onChange={(e) => setState(e.target.value)} />
            </div>
            <div>
              <Label>Country</Label>
              <Input value={country} onChange={(e) => setCountry(e.target.value)} />
            </div>
            <div>
              <Label>Postal code</Label>
              <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
            </div>
          </div>
          <Button
            onClick={() =>
              update.mutate({
                phone,
                personalEmail,
                address,
                city,
                state,
                country,
                postalCode,
              })
            }
            disabled={update.isPending}
          >
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ==================== Pay ====================
function PayTab({ payslips, compensation }: { payslips: any[]; compensation: any[] }) {
  const ytd = useMemo(() => {
    const year = new Date().getFullYear();
    return payslips
      .filter((p) => new Date(p.paymentDate).getFullYear() === year && p.status === "processed")
      .reduce((sum, p) => sum + parseFloat(String(p.amount || "0")), 0);
  }, [payslips]);

  const currentComp = compensation[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">YTD Earnings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(ytd)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Current Compensation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {currentComp ? formatCurrency(currentComp.salary) : "—"}
            </div>
            <p className="text-xs text-muted-foreground">
              {currentComp?.salaryFrequency
                ? titleCase(currentComp.salaryFrequency)
                : "Not on record"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Payslips</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{payslips.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pay History</CardTitle>
        </CardHeader>
        <CardContent>
          {payslips.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payslips yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pay date</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Slip</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payslips.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDate(p.paymentDate)}</TableCell>
                    <TableCell className="text-xs">
                      {p.payPeriodStart ? formatDate(p.payPeriodStart) : "—"}
                      {" — "}
                      {p.payPeriodEnd ? formatDate(p.payPeriodEnd) : "—"}
                    </TableCell>
                    <TableCell>{titleCase(p.type || "salary")}</TableCell>
                    <TableCell className="text-right">
                      {p.grossAmount ? formatCurrency(p.grossAmount) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.taxWithheld ? formatCurrency(p.taxWithheld) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(p.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[p.status] || ""}>{p.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {p.payslipUrl ? (
                        <a
                          href={p.payslipUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline text-sm"
                        >
                          Download
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== Time Off ====================
function TimeOffTab({
  balances,
  requests,
  onChange,
}: {
  balances: any[];
  requests: any[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveType>("vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hours, setHours] = useState("8");
  const [reason, setReason] = useState("");

  const submit = trpc.employeePortal.submitLeaveRequest.useMutation({
    onSuccess: () => {
      toast.success("Leave request submitted");
      setOpen(false);
      setStartDate("");
      setEndDate("");
      setHours("8");
      setReason("");
      onChange();
    },
    onError: (err) => toast.error(err.message),
  });

  const cancel = trpc.employeePortal.cancelLeaveRequest.useMutation({
    onSuccess: () => {
      toast.success("Request cancelled");
      onChange();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!startDate || !endDate) {
      toast.error("Select start and end dates");
      return;
    }
    const hrs = parseFloat(hours);
    if (!hrs || hrs <= 0) {
      toast.error("Hours must be greater than 0");
      return;
    }
    submit.mutate({
      leaveType,
      startDate: new Date(startDate + "T00:00:00"),
      endDate: new Date(endDate + "T00:00:00"),
      hours: hrs,
      reason: reason || undefined,
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {balances.length === 0 ? (
          <Card className="md:col-span-4">
            <CardContent className="pt-6 text-sm text-muted-foreground">
              No PTO balances on file yet. HR will set them up.
            </CardContent>
          </Card>
        ) : (
          balances.map((b) => {
            const accrued = parseFloat(String(b.accruedHours || "0"));
            const used = parseFloat(String(b.usedHours || "0"));
            const pending = parseFloat(String(b.pendingHours || "0"));
            const available = accrued - used - pending;
            return (
              <Card key={b.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{titleCase(b.leaveType)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{available.toFixed(1)}h</div>
                  <p className="text-xs text-muted-foreground">
                    {accrued.toFixed(1)}h accrued · {used.toFixed(1)}h used · {pending.toFixed(1)}h pending
                  </p>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>My Leave Requests</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Request time off
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Request time off</DialogTitle>
                <DialogDescription>
                  Your manager will review and approve this request.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Leave type</Label>
                  <Select value={leaveType} onValueChange={(v) => setLeaveType(v as LeaveType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAVE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {titleCase(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Start date</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>End date</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label>Hours</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Reason (optional)</Label>
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={submit.isPending}>
                  Submit
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{titleCase(r.leaveType)}</TableCell>
                    <TableCell className="text-sm">
                      {formatDate(r.startDate)} — {formatDate(r.endDate)}
                    </TableCell>
                    <TableCell className="text-right">{r.hours}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[r.status] || ""}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {r.reason || "—"}
                    </TableCell>
                    <TableCell>
                      {(r.status === "pending" || r.status === "approved") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => cancel.mutate({ id: r.id })}
                          disabled={cancel.isPending}
                        >
                          Cancel
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== Onboarding ====================
function OnboardingTab({ tasks, onChange }: { tasks: any[]; onChange: () => void }) {
  const update = trpc.employeePortal.updateOnboardingTask.useMutation({
    onSuccess: () => onChange(),
    onError: (err) => toast.error(err.message),
  });

  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          No onboarding tasks. You're all set!
        </CardContent>
      </Card>
    );
  }

  const byCategory = tasks.reduce<Record<string, any[]>>((acc, t) => {
    const key = t.category || "other";
    (acc[key] = acc[key] || []).push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(byCategory).map(([cat, items]) => (
        <Card key={cat}>
          <CardHeader>
            <CardTitle>{titleCase(cat)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {items.map((t) => {
              const done = t.status === "completed";
              return (
                <div
                  key={t.id}
                  className="flex items-start gap-3 border rounded p-3 hover:bg-muted/40"
                >
                  <button
                    onClick={() =>
                      update.mutate({
                        id: t.id,
                        status: done ? "pending" : "completed",
                      })
                    }
                    className="mt-0.5"
                  >
                    {done ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    )}
                  </button>
                  <div className="flex-1">
                    <div className={`font-medium ${done ? "line-through text-muted-foreground" : ""}`}>
                      {t.title}
                    </div>
                    {t.description && (
                      <div className="text-sm text-muted-foreground">{t.description}</div>
                    )}
                    {t.dueDate && (
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Due {formatDate(t.dueDate)}
                      </div>
                    )}
                  </div>
                  <Badge className={STATUS_COLORS[t.status] || ""}>{titleCase(t.status)}</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ==================== Benefits ====================
function BenefitsTab({ benefits, onChange }: { benefits: any[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [benefitType, setBenefitType] = useState<BenefitType>("health");
  const [plan, setPlan] = useState("");
  const [carrier, setCarrier] = useState("");
  const [coverageLevel, setCoverageLevel] = useState("employee_only");
  const [employeeContribution, setEmployeeContribution] = useState("");

  const upsert = trpc.employeePortal.upsertBenefitElection.useMutation({
    onSuccess: () => {
      toast.success("Election saved");
      setOpen(false);
      onChange();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Benefits</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New election
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Benefit election</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Benefit type</Label>
                <Select value={benefitType} onValueChange={(v) => setBenefitType(v as BenefitType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BENEFIT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {titleCase(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Plan</Label>
                <Input value={plan} onChange={(e) => setPlan(e.target.value)} />
              </div>
              <div>
                <Label>Carrier</Label>
                <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} />
              </div>
              <div>
                <Label>Coverage level</Label>
                <Select value={coverageLevel} onValueChange={setCoverageLevel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee_only">Employee only</SelectItem>
                    <SelectItem value="employee_spouse">Employee + spouse</SelectItem>
                    <SelectItem value="employee_children">Employee + children</SelectItem>
                    <SelectItem value="family">Family</SelectItem>
                    <SelectItem value="waived">Waived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Your contribution (per paycheck)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={employeeContribution}
                  onChange={(e) => setEmployeeContribution(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  upsert.mutate({
                    benefitType,
                    plan: plan || undefined,
                    carrier: carrier || undefined,
                    coverageLevel: coverageLevel as any,
                    employeeContribution: employeeContribution || undefined,
                    enrollmentStatus: coverageLevel === "waived" ? "waived" : "pending",
                  })
                }
                disabled={upsert.isPending}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {benefits.length === 0 ? (
          <p className="text-sm text-muted-foreground">No benefit elections yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Carrier</TableHead>
                <TableHead>Coverage</TableHead>
                <TableHead className="text-right">Your cost</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {benefits.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{titleCase(b.benefitType)}</TableCell>
                  <TableCell>{b.plan || "—"}</TableCell>
                  <TableCell>{b.carrier || "—"}</TableCell>
                  <TableCell>{b.coverageLevel ? titleCase(b.coverageLevel) : "—"}</TableCell>
                  <TableCell className="text-right">
                    {b.employeeContribution ? formatCurrency(b.employeeContribution) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[b.enrollmentStatus] || ""}>
                      {b.enrollmentStatus}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ==================== Documents ====================
function DocumentsTab({ documents }: { documents: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>My Documents</CardTitle>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No documents shared with you. Contracts, policies, and tax forms will appear here.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    {d.name}
                  </TableCell>
                  <TableCell>{titleCase(d.type)}</TableCell>
                  <TableCell>{formatDate(d.createdAt)}</TableCell>
                  <TableCell>
                    <a
                      href={d.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline text-sm"
                    >
                      Open
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ==================== Directory ====================
function DirectoryTab({ directory }: { directory: any[] }) {
  const [query, setQuery] = useState("");
  const filtered = directory.filter((p) =>
    `${p.firstName} ${p.lastName} ${p.jobTitle || ""}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" /> Team Directory
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Input
          placeholder="Search by name or title…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-4"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <div key={p.id} className="border rounded p-3">
              <div className="font-medium">
                {p.firstName} {p.lastName}
              </div>
              <div className="text-sm text-muted-foreground">{p.jobTitle || "—"}</div>
              {p.email && <div className="text-xs mt-1">{p.email}</div>}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">No matches.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ==================== Emergency Contacts ====================
function EmergencyContactsTab({
  contacts,
  onChange,
}: {
  contacts: any[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);

  const add = trpc.employeePortal.addEmergencyContact.useMutation({
    onSuccess: () => {
      toast.success("Contact added");
      setOpen(false);
      setName("");
      setRelationship("");
      setPhone("");
      setEmail("");
      setIsPrimary(false);
      onChange();
    },
    onError: (err) => toast.error(err.message),
  });

  const remove = trpc.employeePortal.deleteEmergencyContact.useMutation({
    onSuccess: () => {
      toast.success("Contact removed");
      onChange();
    },
    onError: (err) => toast.error(err.message),
  });

  const update = trpc.employeePortal.updateEmergencyContact.useMutation({
    onSuccess: () => {
      toast.success("Contact updated");
      onChange();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Emergency Contacts</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add contact
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add emergency contact</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>Relationship</Label>
                <Input value={relationship} onChange={(e) => setRelationship(e.target.value)} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                />
                Primary contact
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  add.mutate({
                    name,
                    relationship: relationship || undefined,
                    phone: phone || undefined,
                    email: email || undefined,
                    isPrimary,
                  })
                }
                disabled={add.isPending || !name.trim()}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No emergency contacts on file.</p>
        ) : (
          <div className="space-y-2">
            {contacts.map((c) => (
              <div key={c.id} className="flex items-start justify-between border rounded p-3">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {c.name}
                    {c.isPrimary && <Badge>Primary</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {c.relationship || "—"}
                  </div>
                  <div className="text-xs mt-1">
                    {c.phone && <span className="mr-2">{c.phone}</span>}
                    {c.email && <span>{c.email}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Mark as primary"
                    title={c.isPrimary ? "Already primary" : "Mark as primary"}
                    disabled={c.isPrimary || update.isPending}
                    onClick={() => update.mutate({ id: c.id, isPrimary: true })}
                  >
                    <Badge variant="outline" className="text-[10px]">Primary</Badge>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Edit phone"
                    onClick={() => {
                      const newPhone = prompt(`Update phone for "${c.name}"`, c.phone || "");
                      if (newPhone !== null && newPhone !== c.phone) {
                        update.mutate({ id: c.id, phone: newPhone });
                      }
                    }}
                    disabled={update.isPending}
                  >
                    <Phone className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Delete emergency contact"
                    onClick={() => remove.mutate({ id: c.id })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
