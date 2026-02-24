import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Wallet, Search, Loader2, DollarSign, Users, TrendingUp } from "lucide-react";
import { format } from "date-fns";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
type Employee = {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  employmentType: "full_time" | "part_time" | "contractor" | "intern";
  status: "active" | "inactive" | "on_leave" | "terminated";
  salary: string | null;
  salaryFrequency: "hourly" | "weekly" | "biweekly" | "monthly" | "annual" | null;
  currency: string | null;
  hireDate: Date | null;
};

function formatCurrency(value: string | null | undefined, currency: string = "USD") {
  const num = parseFloat(value || "0");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
  }).format(num);
}

export default function Payroll() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data: employees, isLoading } = trpc.employees.list.useQuery();

  const filteredEmployees = employees?.filter((emp: Employee) => {
    const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase();
    const matchesSearch = fullName.includes(search.toLowerCase()) || emp.email?.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || emp.employmentType === typeFilter;
    return matchesSearch && matchesType && emp.status === "active";
  });

  const typeColors: Record<string, string> = {
    full_time: "bg-blue-500/10 text-blue-600",
    part_time: "bg-green-500/10 text-green-600",
    contractor: "bg-purple-500/10 text-purple-600",
    intern: "bg-amber-500/10 text-amber-600",
  };

  // Calculate summary stats
  const activeEmployees = employees?.filter((e: Employee) => e.status === "active") || [];
  const totalSalary = activeEmployees.reduce((sum: number, e: Employee) => {
    if (e.salaryFrequency === "annual") {
      return sum + parseFloat(e.salary || "0");
    } else if (e.salaryFrequency === "monthly") {
      return sum + parseFloat(e.salary || "0") * 12;
    }
    return sum;
  }, 0);
  const avgSalary = activeEmployees.length > 0 ? totalSalary / activeEmployees.length : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Wallet className="h-8 w-8" />
            Payroll & Compensation
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage employee compensation and payroll information.
          </p>
        </div>
        <AITriggerButton message="Analyze payroll data - identify anomalies, ensure compliance, and show compensation trends" label="AI Payroll Analysis" />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Active Employees</span>
            </div>
            <div className="text-2xl font-bold mt-2">{activeEmployees.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Annual Payroll</span>
            </div>
            <div className="text-2xl font-bold mt-2">{formatCurrency(totalSalary.toString())}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Avg. Salary</span>
            </div>
            <div className="text-2xl font-bold mt-2">{formatCurrency(avgSalary.toString())}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Monthly Payroll</span>
            </div>
            <div className="text-2xl font-bold mt-2">{formatCurrency((totalSalary / 12).toString())}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search employees..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="full_time">Full Time</SelectItem>
                <SelectItem value="part_time">Part Time</SelectItem>
                <SelectItem value="contractor">Contractor</SelectItem>
                <SelectItem value="intern">Intern</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !filteredEmployees || filteredEmployees.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Wallet className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No active employees found</p>
              <p className="text-sm">Add employees in the HR module.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Hire Date</TableHead>
                  <TableHead className="text-right">Salary</TableHead>
                  <TableHead>Frequency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.map((emp: Employee) => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">
                      {emp.firstName} {emp.lastName}
                    </TableCell>
                    <TableCell>{emp.email || "-"}</TableCell>
                    <TableCell>
                      <Badge className={typeColors[emp.employmentType]}>
                        {emp.employmentType.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {emp.hireDate
                        ? format(new Date(emp.hireDate), "MMM d, yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {emp.salary ? formatCurrency(emp.salary, emp.currency || "USD") : "-"}
                    </TableCell>
                    <TableCell>
                      {emp.salaryFrequency ? (
                        <Badge variant="outline">{emp.salaryFrequency}</Badge>
                      ) : "-"}
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
