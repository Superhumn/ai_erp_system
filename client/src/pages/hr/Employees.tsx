import { useState } from "react";
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
import { UserCircle, Plus, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
export default function People() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    employmentType: "full_time" as "full_time" | "part_time" | "contractor" | "intern",
    departmentId: 0,
    jobTitle: "",
    hireDate: "",
    notes: "",
  });

  const { data: people, isLoading, refetch } = trpc.employees.list.useQuery();
  const createPerson = trpc.employees.create.useMutation({
    onSuccess: () => {
      toast.success("Person added successfully");
      setIsOpen(false);
      setFormData({
        firstName: "", lastName: "", email: "", phone: "",
        employmentType: "full_time", departmentId: 0, jobTitle: "", hireDate: "", notes: "",
      });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const filteredPeople = people?.filter((person) => {
    const fullName = `${person.firstName} ${person.lastName}`.toLowerCase();
    const matchesSearch =
      fullName.includes(search.toLowerCase()) ||
      person.email?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || person.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusColors: Record<string, string> = {
    active: "bg-green-500/10 text-green-600",
    inactive: "bg-gray-500/10 text-gray-600",
    terminated: "bg-red-500/10 text-red-600",
    on_leave: "bg-amber-500/10 text-amber-600",
  };

  const typeColors: Record<string, string> = {
    full_time: "bg-blue-500/10 text-blue-600",
    part_time: "bg-green-500/10 text-green-600",
    contractor: "bg-purple-500/10 text-purple-600",
    intern: "bg-amber-500/10 text-amber-600",
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createPerson.mutate({
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email || undefined,
      phone: formData.phone || undefined,
      employmentType: formData.employmentType,
      departmentId: formData.departmentId || undefined,
      jobTitle: formData.jobTitle || undefined,
      hireDate: formData.hireDate ? new Date(formData.hireDate) : undefined,
      notes: formData.notes || undefined,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <UserCircle className="h-8 w-8" />
            People
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage employees, contractors, and consultants.
          </p>
        
          <AITriggerButton message="Analyze our workforce - show team composition, identify skill gaps, and provide HR insights" label="AI HR Insights" /></div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Person
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Add Person</DialogTitle>
                <DialogDescription>
                  Add a new employee, contractor, or consultant.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input
                      id="firstName"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      placeholder="First name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      placeholder="Last name"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@company.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="employmentType">Employment Type</Label>
                    <Select
                      value={formData.employmentType}
                      onValueChange={(value: any) => setFormData({ ...formData, employmentType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full_time">Full Time</SelectItem>
                        <SelectItem value="part_time">Part Time</SelectItem>
                        <SelectItem value="contractor">Contractor</SelectItem>
                        <SelectItem value="intern">Intern</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={formData.hireDate}
                      onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="jobTitle">Job Title</Label>
                    <Input
                      id="jobTitle"
                      value={formData.jobTitle}
                      onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                      placeholder="Software Engineer, etc."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="departmentId">Department ID</Label>
                    <Input
                      id="departmentId"
                      type="number"
                      value={formData.departmentId || ""}
                      onChange={(e) => setFormData({ ...formData, departmentId: parseInt(e.target.value) || 0 })}
                      placeholder="Department ID"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional notes..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createPerson.isPending}>
                  {createPerson.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add Person
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search people..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="on_leave">On Leave</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !filteredPeople || filteredPeople.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <UserCircle className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No people found</p>
              <p className="text-sm">Add your first team member to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPeople.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell className="font-medium">
                      {person.firstName} {person.lastName}
                    </TableCell>
                    <TableCell>{person.email || "-"}</TableCell>
                    <TableCell>
                      <Badge className={typeColors[person.employmentType]}>{person.employmentType.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell>Dept #{person.departmentId || "-"}</TableCell>
                    <TableCell>{person.jobTitle || "-"}</TableCell>
                    <TableCell>
                      {person.hireDate
                        ? format(new Date(person.hireDate), "MMM d, yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[person.status]}>{person.status.replace("_", " ")}</Badge>
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
