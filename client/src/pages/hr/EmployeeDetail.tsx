import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Loader2, Mail, Phone, MapPin, Briefcase,
  DollarSign, Calendar, Edit, Save, X, Plus, TrendingUp,
  User,
} from "lucide-react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import { format } from "date-fns";

function formatCurrency(value: string | number | null | undefined) {
  const num = parseFloat(String(value || "0"));
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

const statusColors: Record<string, string> = {
  active: "bg-green-500/10 text-green-600",
  inactive: "bg-gray-500/10 text-gray-600",
  terminated: "bg-red-500/10 text-red-600",
  on_leave: "bg-yellow-500/10 text-yellow-700",
};

export default function EmployeeDetail() {
  const { id } = useParams<{ id: string }>();
  const employeeId = parseInt(id || "0");
  const [isEditing, setIsEditing] = useState(false);
  const [isCompOpen, setIsCompOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [compForm, setCompForm] = useState({
    effectiveDate: new Date().toISOString().split("T")[0],
    salary: "",
    salaryFrequency: "annual",
    currency: "USD",
    reason: "",
    notes: "",
  });

  const { data: employee, isLoading, refetch } = trpc.employees.get.useQuery({ id: employeeId });
  const { data: compensation } = trpc.employees.compensationHistory.useQuery({ employeeId });
  const { data: departments } = trpc.departments.list.useQuery();

  const updateEmployee = trpc.employees.update.useMutation({
    onSuccess: () => {
      toast.success("Employee updated");
      setIsEditing(false);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const addCompensation = trpc.employees.addCompensation.useMutation({
    onSuccess: () => {
      toast.success("Compensation record added");
      setIsCompOpen(false);
      setCompForm({ effectiveDate: new Date().toISOString().split("T")[0], salary: "", salaryFrequency: "annual", currency: "USD", reason: "", notes: "" });
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="space-y-4">
        <Link href="/hr/employees">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
        </Link>
        <p className="text-muted-foreground">Employee not found.</p>
      </div>
    );
  }

  const department = departments?.find((d) => d.id === employee.departmentId);

  const startEditing = () => {
    setEditForm({
      firstName: employee.firstName || "",
      lastName: employee.lastName || "",
      email: employee.email || "",
      phone: employee.phone || "",
      address: employee.address || "",
      departmentId: employee.departmentId || "",
      jobTitle: employee.jobTitle || "",
      status: employee.status || "active",
      salary: employee.salary || "",
      notes: employee.notes || "",
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    updateEmployee.mutate({
      id: employeeId,
      ...editForm,
      departmentId: editForm.departmentId ? parseInt(editForm.departmentId) : undefined,
      salary: editForm.salary ? String(editForm.salary) : undefined,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/hr/employees">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Employees</Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <User className="h-6 w-6" />
              {employee.firstName} {employee.lastName}
            </h1>
            <p className="text-muted-foreground">{employee.jobTitle || "No title"} {department ? `- ${department.name}` : ""}</p>
          </div>
          <Badge className={statusColors[employee.status || "active"]}>{employee.status || "active"}</Badge>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}><X className="h-4 w-4 mr-2" />Cancel</Button>
              <Button onClick={handleSave} disabled={updateEmployee.isPending}>
                {updateEmployee.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={startEditing}><Edit className="h-4 w-4 mr-2" />Edit</Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Salary</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(employee.salary)}</div>
            <p className="text-xs text-muted-foreground capitalize">{employee.salaryFrequency || "annual"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Employment Type</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold capitalize">{employee.employmentType || "full-time"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hire Date</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {employee.hireDate ? format(new Date(employee.hireDate), "MMM d, yyyy") : "-"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Department</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{department?.name || "Unassigned"}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Contact Info */}
        <Card>
          <CardHeader><CardTitle>Contact Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {isEditing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>First Name</Label><Input value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} /></div>
                  <div><Label>Last Name</Label><Input value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} /></div>
                </div>
                <div><Label>Email</Label><Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></div>
                <div><Label>Phone</Label><Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></div>
                <div><Label>Address</Label><Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></div>
                <div><Label>Job Title</Label><Input value={editForm.jobTitle} onChange={(e) => setEditForm({ ...editForm, jobTitle: e.target.value })} /></div>
                <div>
                  <Label>Department</Label>
                  <Select value={String(editForm.departmentId || "")} onValueChange={(v) => setEditForm({ ...editForm, departmentId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {departments?.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Notes</Label><Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} /></div>
              </div>
            ) : (
              <>
                {employee.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${employee.email}`} className="text-sm hover:underline">{employee.email}</a>
                  </div>
                )}
                {employee.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{employee.phone}</span>
                  </div>
                )}
                {employee.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div className="text-sm">
                      <div>{employee.address}</div>
                      {employee.city && <div>{[employee.city, employee.state, employee.country].filter(Boolean).join(", ")}</div>}
                    </div>
                  </div>
                )}
                {employee.notes && (
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground">{employee.notes}</p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Compensation History */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Compensation History
                </CardTitle>
                <CardDescription>{compensation?.length || 0} records</CardDescription>
              </div>
              <Button size="sm" onClick={() => setIsCompOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />Add Record
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!compensation || compensation.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No compensation history.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Effective Date</TableHead>
                    <TableHead>Salary</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {compensation.map((record: any) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">
                        {record.effectiveDate ? format(new Date(record.effectiveDate), "MMM d, yyyy") : "-"}
                      </TableCell>
                      <TableCell className="font-medium">{formatCurrency(record.salary)}</TableCell>
                      <TableCell className="capitalize">{record.salaryFrequency || "annual"}</TableCell>
                      <TableCell className="text-muted-foreground">{record.reason || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Compensation Dialog */}
      <Dialog open={isCompOpen} onOpenChange={setIsCompOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Compensation Record</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Effective Date</Label>
              <Input type="date" value={compForm.effectiveDate} onChange={(e) => setCompForm({ ...compForm, effectiveDate: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Salary</Label>
                <Input type="number" step="0.01" value={compForm.salary} onChange={(e) => setCompForm({ ...compForm, salary: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select value={compForm.salaryFrequency} onValueChange={(v) => setCompForm({ ...compForm, salaryFrequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annual">Annual</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="biweekly">Biweekly</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input placeholder="e.g. Annual raise, Promotion" value={compForm.reason} onChange={(e) => setCompForm({ ...compForm, reason: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={compForm.notes} onChange={(e) => setCompForm({ ...compForm, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCompOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addCompensation.mutate({
                employeeId,
                effectiveDate: compForm.effectiveDate,
                salary: compForm.salary,
                salaryFrequency: compForm.salaryFrequency,
                currency: compForm.currency,
                reason: compForm.reason || undefined,
                notes: compForm.notes || undefined,
              })}
              disabled={addCompensation.isPending || !compForm.salary}
            >
              {addCompensation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
