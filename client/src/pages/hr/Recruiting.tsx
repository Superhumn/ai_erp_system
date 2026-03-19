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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Briefcase,
  Plus,
  Search,
  Loader2,
  Users,
  Calendar,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function Recruiting() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [isPostingOpen, setIsPostingOpen] = useState(false);
  const [isCandidateOpen, setIsCandidateOpen] = useState(false);
  const [isInterviewOpen, setIsInterviewOpen] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);

  const [postingForm, setPostingForm] = useState({
    title: "",
    department: "",
    location: "",
    employmentType: "full_time" as "full_time" | "part_time" | "contractor" | "intern",
    description: "",
    requirements: "",
    salaryMin: "",
    salaryMax: "",
  });

  const [candidateForm, setCandidateForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    resumeUrl: "",
    notes: "",
    jobPostingId: 0,
  });

  const [interviewForm, setInterviewForm] = useState({
    candidateId: 0,
    interviewerName: "",
    scheduledAt: "",
    type: "phone_screen" as "phone_screen" | "technical" | "behavioral" | "final",
    notes: "",
  });

  const { data: jobPostings, isLoading: loadingPostings, refetch: refetchPostings } =
    trpc.recruiting.jobPostings.useQuery();
  const { data: candidates, isLoading: loadingCandidates, refetch: refetchCandidates } =
    trpc.recruiting.candidates.useQuery(
      { jobPostingId: selectedJobId! },
      { enabled: !!selectedJobId }
    );

  const createPosting = trpc.recruiting.createJobPosting.useMutation({
    onSuccess: () => {
      toast.success("Job posting created successfully");
      setIsPostingOpen(false);
      setPostingForm({
        title: "", department: "", location: "", employmentType: "full_time",
        description: "", requirements: "", salaryMin: "", salaryMax: "",
      });
      refetchPostings();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const createCandidate = trpc.recruiting.createCandidate.useMutation({
    onSuccess: () => {
      toast.success("Candidate added successfully");
      setIsCandidateOpen(false);
      setCandidateForm({
        firstName: "", lastName: "", email: "", phone: "",
        resumeUrl: "", notes: "", jobPostingId: 0,
      });
      refetchCandidates();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const scheduleInterview = trpc.recruiting.scheduleInterview.useMutation({
    onSuccess: () => {
      toast.success("Interview scheduled successfully");
      setIsInterviewOpen(false);
      setInterviewForm({
        candidateId: 0, interviewerName: "", scheduledAt: "",
        type: "phone_screen", notes: "",
      });
      refetchCandidates();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const aiScreen = trpc.recruiting.aiScreenCandidate.useMutation({
    onSuccess: () => {
      toast.success("AI screening completed");
      refetchCandidates();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const filteredPostings = jobPostings?.filter((posting) => {
    const matchesSearch =
      posting.title.toLowerCase().includes(search.toLowerCase()) ||
      posting.department?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || posting.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const postingStatusColors: Record<string, string> = {
    draft: "bg-gray-500/10 text-gray-600",
    open: "bg-green-500/10 text-green-600",
    closed: "bg-red-500/10 text-red-600",
    on_hold: "bg-amber-500/10 text-amber-600",
    filled: "bg-blue-500/10 text-blue-600",
  };

  const candidateStatusColors: Record<string, string> = {
    new: "bg-blue-500/10 text-blue-600",
    screening: "bg-purple-500/10 text-purple-600",
    interview: "bg-amber-500/10 text-amber-600",
    offer: "bg-green-500/10 text-green-600",
    hired: "bg-emerald-500/10 text-emerald-600",
    rejected: "bg-red-500/10 text-red-600",
    withdrawn: "bg-gray-500/10 text-gray-600",
  };

  const interviewTypeLabels: Record<string, string> = {
    phone_screen: "Phone Screen",
    technical: "Technical",
    behavioral: "Behavioral",
    final: "Final Round",
  };

  const handlePostingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createPosting.mutate({
      title: postingForm.title,
      department: postingForm.department || undefined,
      location: postingForm.location || undefined,
      employmentType: postingForm.employmentType,
      description: postingForm.description || undefined,
      requirements: postingForm.requirements || undefined,
      salaryMin: postingForm.salaryMin ? parseFloat(postingForm.salaryMin) : undefined,
      salaryMax: postingForm.salaryMax ? parseFloat(postingForm.salaryMax) : undefined,
    });
  };

  const handleCandidateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createCandidate.mutate({
      firstName: candidateForm.firstName,
      lastName: candidateForm.lastName,
      email: candidateForm.email || undefined,
      phone: candidateForm.phone || undefined,
      resumeUrl: candidateForm.resumeUrl || undefined,
      notes: candidateForm.notes || undefined,
      jobPostingId: selectedJobId!,
    });
  };

  const handleInterviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    scheduleInterview.mutate({
      candidateId: selectedCandidateId!,
      interviewerName: interviewForm.interviewerName,
      scheduledAt: new Date(interviewForm.scheduledAt),
      type: interviewForm.type,
      notes: interviewForm.notes || undefined,
    });
  };

  const handleAiScreen = (candidateId: number) => {
    aiScreen.mutate({ candidateId });
  };

  // Summary stats
  const openPostings = jobPostings?.filter((p) => p.status === "open").length || 0;
  const totalCandidates = jobPostings?.reduce((sum, p) => sum + (p.candidateCount || 0), 0) || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Briefcase className="h-8 w-8" />
            Recruiting
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage job postings, candidates, and interviews.
          </p>
        </div>
        <Dialog open={isPostingOpen} onOpenChange={setIsPostingOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Job Posting
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <form onSubmit={handlePostingSubmit}>
              <DialogHeader>
                <DialogTitle>New Job Posting</DialogTitle>
                <DialogDescription>
                  Create a new job posting to start recruiting candidates.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                <div className="space-y-2">
                  <Label htmlFor="title">Job Title *</Label>
                  <Input
                    id="title"
                    value={postingForm.title}
                    onChange={(e) => setPostingForm({ ...postingForm, title: e.target.value })}
                    placeholder="e.g. Senior Software Engineer"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="department">Department</Label>
                    <Input
                      id="department"
                      value={postingForm.department}
                      onChange={(e) => setPostingForm({ ...postingForm, department: e.target.value })}
                      placeholder="Engineering"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      value={postingForm.location}
                      onChange={(e) => setPostingForm({ ...postingForm, location: e.target.value })}
                      placeholder="Remote, NYC, etc."
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postingType">Employment Type</Label>
                  <Select
                    value={postingForm.employmentType}
                    onValueChange={(value: any) => setPostingForm({ ...postingForm, employmentType: value })}
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="salaryMin">Salary Min</Label>
                    <Input
                      id="salaryMin"
                      type="number"
                      value={postingForm.salaryMin}
                      onChange={(e) => setPostingForm({ ...postingForm, salaryMin: e.target.value })}
                      placeholder="50000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="salaryMax">Salary Max</Label>
                    <Input
                      id="salaryMax"
                      type="number"
                      value={postingForm.salaryMax}
                      onChange={(e) => setPostingForm({ ...postingForm, salaryMax: e.target.value })}
                      placeholder="100000"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={postingForm.description}
                    onChange={(e) => setPostingForm({ ...postingForm, description: e.target.value })}
                    placeholder="Job description..."
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="requirements">Requirements</Label>
                  <Textarea
                    id="requirements"
                    value={postingForm.requirements}
                    onChange={(e) => setPostingForm({ ...postingForm, requirements: e.target.value })}
                    placeholder="Required qualifications..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsPostingOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createPosting.isPending}>
                  {createPosting.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Posting
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Open Positions</span>
            </div>
            <div className="text-2xl font-bold mt-2">{openPostings}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Candidates</span>
            </div>
            <div className="text-2xl font-bold mt-2">{totalCandidates}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Postings</span>
            </div>
            <div className="text-2xl font-bold mt-2">{jobPostings?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="postings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="postings">Job Postings</TabsTrigger>
          <TabsTrigger value="candidates" disabled={!selectedJobId}>
            Candidates {selectedJobId ? "" : "(select a posting)"}
          </TabsTrigger>
        </TabsList>

        {/* Job Postings Tab */}
        <TabsContent value="postings">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search postings..."
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
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="filled">Filled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loadingPostings ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !filteredPostings || filteredPostings.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No job postings found</p>
                  <p className="text-sm">Create your first job posting to start recruiting.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Salary Range</TableHead>
                      <TableHead>Candidates</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPostings.map((posting) => (
                      <TableRow key={posting.id}>
                        <TableCell className="font-medium">{posting.title}</TableCell>
                        <TableCell>{posting.department || "-"}</TableCell>
                        <TableCell>{posting.location || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {posting.employmentType?.replace("_", " ") || "-"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {posting.salaryMin && posting.salaryMax
                            ? `$${Number(posting.salaryMin).toLocaleString()} - $${Number(posting.salaryMax).toLocaleString()}`
                            : "-"}
                        </TableCell>
                        <TableCell>{posting.candidateCount || 0}</TableCell>
                        <TableCell>
                          <Badge className={postingStatusColors[posting.status] || ""}>
                            {posting.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {posting.createdAt
                            ? format(new Date(posting.createdAt), "MMM d, yyyy")
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedJobId(posting.id)}
                          >
                            View Candidates
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Candidates Tab */}
        <TabsContent value="candidates">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">
                    Candidates for: {jobPostings?.find((p) => p.id === selectedJobId)?.title || ""}
                  </h3>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedJobId(null)}>
                    Clear
                  </Button>
                </div>
                <Dialog open={isCandidateOpen} onOpenChange={setIsCandidateOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Candidate
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <form onSubmit={handleCandidateSubmit}>
                      <DialogHeader>
                        <DialogTitle>Add Candidate</DialogTitle>
                        <DialogDescription>
                          Add a new candidate to this job posting.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="candFirstName">First Name *</Label>
                            <Input
                              id="candFirstName"
                              value={candidateForm.firstName}
                              onChange={(e) => setCandidateForm({ ...candidateForm, firstName: e.target.value })}
                              placeholder="First name"
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="candLastName">Last Name *</Label>
                            <Input
                              id="candLastName"
                              value={candidateForm.lastName}
                              onChange={(e) => setCandidateForm({ ...candidateForm, lastName: e.target.value })}
                              placeholder="Last name"
                              required
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="candEmail">Email</Label>
                            <Input
                              id="candEmail"
                              type="email"
                              value={candidateForm.email}
                              onChange={(e) => setCandidateForm({ ...candidateForm, email: e.target.value })}
                              placeholder="candidate@email.com"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="candPhone">Phone</Label>
                            <Input
                              id="candPhone"
                              value={candidateForm.phone}
                              onChange={(e) => setCandidateForm({ ...candidateForm, phone: e.target.value })}
                              placeholder="+1 (555) 000-0000"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="resumeUrl">Resume URL</Label>
                          <Input
                            id="resumeUrl"
                            value={candidateForm.resumeUrl}
                            onChange={(e) => setCandidateForm({ ...candidateForm, resumeUrl: e.target.value })}
                            placeholder="https://..."
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="candNotes">Notes</Label>
                          <Textarea
                            id="candNotes"
                            value={candidateForm.notes}
                            onChange={(e) => setCandidateForm({ ...candidateForm, notes: e.target.value })}
                            placeholder="Additional notes about the candidate..."
                            rows={3}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsCandidateOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createCandidate.isPending}>
                          {createCandidate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Add Candidate
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {loadingCandidates ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !candidates || candidates.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No candidates yet</p>
                  <p className="text-sm">Add candidates to start the screening process.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>AI Score</TableHead>
                      <TableHead>Applied</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidates.map((candidate) => (
                      <TableRow key={candidate.id}>
                        <TableCell className="font-medium">
                          {candidate.firstName} {candidate.lastName}
                        </TableCell>
                        <TableCell>{candidate.email || "-"}</TableCell>
                        <TableCell>{candidate.phone || "-"}</TableCell>
                        <TableCell>
                          <Badge className={candidateStatusColors[candidate.status] || ""}>
                            {candidate.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {candidate.aiScore != null ? (
                            <Badge
                              className={
                                candidate.aiScore >= 80
                                  ? "bg-green-500/10 text-green-600"
                                  : candidate.aiScore >= 60
                                  ? "bg-amber-500/10 text-amber-600"
                                  : "bg-red-500/10 text-red-600"
                              }
                            >
                              {candidate.aiScore}%
                            </Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>
                          {candidate.createdAt
                            ? format(new Date(candidate.createdAt), "MMM d, yyyy")
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAiScreen(candidate.id)}
                              disabled={aiScreen.isPending}
                              title="AI Screen"
                            >
                              {aiScreen.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Sparkles className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedCandidateId(candidate.id);
                                setIsInterviewOpen(true);
                              }}
                              title="Schedule Interview"
                            >
                              <Calendar className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Schedule Interview Dialog */}
      <Dialog open={isInterviewOpen} onOpenChange={setIsInterviewOpen}>
        <DialogContent className="max-w-lg">
          <form onSubmit={handleInterviewSubmit}>
            <DialogHeader>
              <DialogTitle>Schedule Interview</DialogTitle>
              <DialogDescription>
                Schedule an interview for the selected candidate.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="interviewerName">Interviewer Name *</Label>
                <Input
                  id="interviewerName"
                  value={interviewForm.interviewerName}
                  onChange={(e) => setInterviewForm({ ...interviewForm, interviewerName: e.target.value })}
                  placeholder="Interviewer name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduledAt">Date & Time *</Label>
                <Input
                  id="scheduledAt"
                  type="datetime-local"
                  value={interviewForm.scheduledAt}
                  onChange={(e) => setInterviewForm({ ...interviewForm, scheduledAt: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="interviewType">Interview Type</Label>
                <Select
                  value={interviewForm.type}
                  onValueChange={(value: any) => setInterviewForm({ ...interviewForm, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="phone_screen">Phone Screen</SelectItem>
                    <SelectItem value="technical">Technical</SelectItem>
                    <SelectItem value="behavioral">Behavioral</SelectItem>
                    <SelectItem value="final">Final Round</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="interviewNotes">Notes</Label>
                <Textarea
                  id="interviewNotes"
                  value={interviewForm.notes}
                  onChange={(e) => setInterviewForm({ ...interviewForm, notes: e.target.value })}
                  placeholder="Interview notes or agenda..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsInterviewOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={scheduleInterview.isPending}>
                {scheduleInterview.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Schedule Interview
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
