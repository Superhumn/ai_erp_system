import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Users, Plus, Search, Loader2, Mail, Phone, Building2, Calendar, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

export default function CRMInvestors() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    title: "",
    type: "angel" as "angel" | "vc" | "family_office" | "strategic" | "accelerator" | "other",
    status: "lead" as "lead" | "contacted" | "interested" | "committed" | "invested" | "passed",
    linkedinUrl: "",
    website: "",
    source: "",
    priority: "medium" as "low" | "medium" | "high" | "critical",
    notes: "",
  });

  const { data: investorsRaw, isLoading, refetch } = trpc.crm.listInvestors.useQuery();
  const investors = investorsRaw as any[] | undefined;
  
  const createInvestor = trpc.crm.createInvestor.useMutation({
    onSuccess: () => {
      toast.success("Investor created successfully");
      setIsOpen(false);
      setFormData({
        name: "", email: "", phone: "", company: "", title: "",
        type: "angel", status: "lead", linkedinUrl: "", website: "",
        source: "", priority: "medium", notes: "",
      });
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createInvestor.mutate({ ...formData, firstName: formData.name } as any);
  };

  const filteredInvestors = investors?.filter((investor) => {
    const matchesSearch = investor.name.toLowerCase().includes(search.toLowerCase()) ||
      investor.email?.toLowerCase().includes(search.toLowerCase()) ||
      investor.company?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || investor.status === statusFilter;
    const matchesType = typeFilter === "all" || investor.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  }) || [];

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      lead: "bg-gray-100 text-gray-800",
      contacted: "bg-blue-100 text-blue-800",
      interested: "bg-purple-100 text-purple-800",
      committed: "bg-orange-100 text-orange-800",
      invested: "bg-green-100 text-green-800",
      passed: "bg-red-100 text-red-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      low: "bg-gray-100 text-gray-600",
      medium: "bg-blue-100 text-blue-600",
      high: "bg-orange-100 text-orange-600",
      critical: "bg-red-100 text-red-600",
    };
    return colors[priority] || "bg-gray-100 text-gray-600";
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Investors & Contacts</h1>
          <p className="text-muted-foreground">Manage your fundraising contacts and relationships</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Investor
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Investor</DialogTitle>
              <DialogDescription>Create a new investor contact in your CRM</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Company</Label>
                  <Input
                    id="company"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Investor Type</Label>
                  <Select value={formData.type} onValueChange={(value: any) => setFormData({ ...formData, type: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="angel">Angel</SelectItem>
                      <SelectItem value="vc">VC</SelectItem>
                      <SelectItem value="family_office">Family Office</SelectItem>
                      <SelectItem value="strategic">Strategic</SelectItem>
                      <SelectItem value="accelerator">Accelerator</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={formData.status} onValueChange={(value: any) => setFormData({ ...formData, status: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="interested">Interested</SelectItem>
                      <SelectItem value="committed">Committed</SelectItem>
                      <SelectItem value="invested">Invested</SelectItem>
                      <SelectItem value="passed">Passed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select value={formData.priority} onValueChange={(value: any) => setFormData({ ...formData, priority: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
                  <Input
                    id="linkedinUrl"
                    value={formData.linkedinUrl}
                    onChange={(e) => setFormData({ ...formData, linkedinUrl: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="source">Source</Label>
                <Input
                  id="source"
                  value={formData.source}
                  onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  placeholder="How did you find this investor?"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createInvestor.isPending}>
                  {createInvestor.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Investor
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Investor Pipeline</CardTitle>
              <CardDescription>Track and manage your investor relationships</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search investors..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="interested">Interested</SelectItem>
                  <SelectItem value="committed">Committed</SelectItem>
                  <SelectItem value="invested">Invested</SelectItem>
                  <SelectItem value="passed">Passed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="angel">Angel</SelectItem>
                  <SelectItem value="vc">VC</SelectItem>
                  <SelectItem value="family_office">Family Office</SelectItem>
                  <SelectItem value="strategic">Strategic</SelectItem>
                  <SelectItem value="accelerator">Accelerator</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredInvestors.length === 0 ? (
              <div className="text-center py-8">
                <Users className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-2 text-sm font-semibold text-foreground">No investors found</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {search || statusFilter !== "all" || typeFilter !== "all"
                    ? "Try adjusting your filters"
                    : "Get started by adding your first investor"}
                </p>
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Invested</TableHead>
                      <TableHead>Last Contact</TableHead>
                      <TableHead>Next Follow-up</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvestors.map((investor) => (
                      <TableRow key={investor.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell>
                          <Link href={`/crm/investors/${investor.id}`} className="block">
                            <div className="font-medium">{investor.name}</div>
                            <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                              {investor.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {investor.email}
                                </span>
                              )}
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell>
                          {investor.company && (
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <span>{investor.company}</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {investor.type.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(investor.status)}>
                            {investor.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={getPriorityColor(investor.priority)}>
                            {investor.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {investor.totalInvested && parseFloat(investor.totalInvested) > 0 ? (
                            <div className="flex items-center gap-1 text-green-600">
                              <TrendingUp className="h-4 w-4" />
                              ${parseFloat(investor.totalInvested).toLocaleString()}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {investor.lastContactedAt ? (
                            <div className="text-sm">
                              {new Date(investor.lastContactedAt).toLocaleDateString()}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Never</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {investor.nextFollowUpAt ? (
                            <div className="text-sm flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(investor.nextFollowUpAt).toLocaleDateString()}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
