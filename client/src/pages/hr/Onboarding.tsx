import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
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
  ClipboardList,
  Plus,
  Search,
  Loader2,
  Sparkles,
  CheckCircle2,
  Clock,
  Users,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function Onboarding() {
  const [search, setSearch] = useState("");
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [taskInput, setTaskInput] = useState({ name: "", description: "", dueInDays: "" });

  const [templateForm, setTemplateForm] = useState({
    name: "",
    description: "",
    department: "",
    tasks: [] as Array<{ name: string; description: string; dueInDays: number }>,
  });

  const [editForm, setEditForm] = useState({
    id: 0,
    name: "",
    description: "",
    department: "",
    tasks: [] as Array<{ name: string; description: string; dueInDays: number }>,
  });

  const { data: templates, isLoading: loadingTemplates, refetch: refetchTemplates } =
    trpc.recruiting.onboardingTemplates.useQuery();
  const { data: progressList, isLoading: loadingProgress, refetch: refetchProgress } =
    trpc.recruiting.onboardingProgress.useQuery();

  const createTemplate = trpc.recruiting.createOnboardingTemplate.useMutation({
    onSuccess: () => {
      toast.success("Onboarding template created successfully");
      setIsTemplateOpen(false);
      setTemplateForm({ name: "", description: "", department: "", tasks: [] });
      refetchTemplates();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateTemplate = trpc.recruiting.updateOnboardingTemplate.useMutation({
    onSuccess: () => {
      toast.success("Template updated successfully");
      setIsEditOpen(false);
      refetchTemplates();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const generatePlan = trpc.recruiting.aiGenerateOnboardingPlan.useMutation({
    onSuccess: (data) => {
      toast.success("AI onboarding plan generated successfully");
      refetchTemplates();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const filteredTemplates = templates?.filter((template) => {
    const matchesSearch =
      template.name.toLowerCase().includes(search.toLowerCase()) ||
      template.department?.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  const statusColors: Record<string, string> = {
    not_started: "bg-gray-500/10 text-gray-600",
    in_progress: "bg-blue-500/10 text-blue-600",
    completed: "bg-green-500/10 text-green-600",
    overdue: "bg-red-500/10 text-red-600",
  };

  const handleTemplateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createTemplate.mutate({
      name: templateForm.name,
      description: templateForm.description || undefined,
      department: templateForm.department || undefined,
      tasks: templateForm.tasks,
    });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateTemplate.mutate({
      id: editForm.id,
      name: editForm.name,
      description: editForm.description || undefined,
      department: editForm.department || undefined,
      tasks: editForm.tasks,
    });
  };

  const addTask = (form: "create" | "edit") => {
    if (!taskInput.name) return;
    const task = {
      name: taskInput.name,
      description: taskInput.description,
      dueInDays: parseInt(taskInput.dueInDays) || 7,
    };
    if (form === "create") {
      setTemplateForm({ ...templateForm, tasks: [...templateForm.tasks, task] });
    } else {
      setEditForm({ ...editForm, tasks: [...editForm.tasks, task] });
    }
    setTaskInput({ name: "", description: "", dueInDays: "" });
  };

  const removeTask = (form: "create" | "edit", index: number) => {
    if (form === "create") {
      setTemplateForm({
        ...templateForm,
        tasks: templateForm.tasks.filter((_, i) => i !== index),
      });
    } else {
      setEditForm({
        ...editForm,
        tasks: editForm.tasks.filter((_, i) => i !== index),
      });
    }
  };

  const openEditDialog = (template: any) => {
    setEditForm({
      id: template.id,
      name: template.name,
      description: template.description || "",
      department: template.department || "",
      tasks: template.tasks || [],
    });
    setIsEditOpen(true);
  };

  const handleGeneratePlan = (department: string) => {
    generatePlan.mutate({ department: department || "General" });
  };

  // Summary stats
  const activeOnboardings = progressList?.filter((p) => p.status === "in_progress").length || 0;
  const completedOnboardings = progressList?.filter((p) => p.status === "completed").length || 0;

  const TaskForm = ({ form }: { form: "create" | "edit" }) => (
    <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
      <Label className="text-sm font-medium">Tasks</Label>
      <div className="space-y-2">
        {(form === "create" ? templateForm.tasks : editForm.tasks).map((task, idx) => (
          <div key={idx} className="flex items-center gap-2 text-sm bg-background rounded p-2">
            <span className="flex-1">{task.name}</span>
            <Badge variant="outline">{task.dueInDays}d</Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeTask(form, idx)}
              className="h-6 w-6 p-0"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <Input
          placeholder="Task name"
          value={taskInput.name}
          onChange={(e) => setTaskInput({ ...taskInput, name: e.target.value })}
          size={1}
        />
        <Input
          placeholder="Due in days"
          type="number"
          value={taskInput.dueInDays}
          onChange={(e) => setTaskInput({ ...taskInput, dueInDays: e.target.value })}
          size={1}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => addTask(form)}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-8 w-8" />
            Onboarding
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage onboarding templates and track employee onboarding progress.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => handleGeneratePlan("General")}
            disabled={generatePlan.isPending}
          >
            {generatePlan.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            AI Generate Plan
          </Button>
          <Dialog open={isTemplateOpen} onOpenChange={setIsTemplateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <form onSubmit={handleTemplateSubmit}>
                <DialogHeader>
                  <DialogTitle>New Onboarding Template</DialogTitle>
                  <DialogDescription>
                    Create a reusable onboarding template with task definitions.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                  <div className="space-y-2">
                    <Label htmlFor="templateName">Template Name *</Label>
                    <Input
                      id="templateName"
                      value={templateForm.name}
                      onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                      placeholder="e.g. Engineering Onboarding"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="templateDept">Department</Label>
                      <Input
                        id="templateDept"
                        value={templateForm.department}
                        onChange={(e) => setTemplateForm({ ...templateForm, department: e.target.value })}
                        placeholder="Engineering"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="templateDesc">Description</Label>
                    <Textarea
                      id="templateDesc"
                      value={templateForm.description}
                      onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                      placeholder="Template description..."
                      rows={2}
                    />
                  </div>
                  <TaskForm form="create" />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsTemplateOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createTemplate.isPending}>
                    {createTemplate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Template
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Templates</span>
            </div>
            <div className="text-2xl font-bold mt-2">{templates?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Active Onboardings</span>
            </div>
            <div className="text-2xl font-bold mt-2">{activeOnboardings}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Completed</span>
            </div>
            <div className="text-2xl font-bold mt-2">{completedOnboardings}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="templates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="progress">Onboarding Progress</TabsTrigger>
        </TabsList>

        {/* Templates Tab */}
        <TabsContent value="templates">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search templates..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingTemplates ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !filteredTemplates || filteredTemplates.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No onboarding templates found</p>
                  <p className="text-sm">Create your first template or use AI to generate one.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Tasks</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTemplates.map((template) => (
                      <TableRow key={template.id}>
                        <TableCell className="font-medium">{template.name}</TableCell>
                        <TableCell>{template.department || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{template.taskCount || 0} tasks</Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {template.description || "-"}
                        </TableCell>
                        <TableCell>
                          {template.createdAt
                            ? format(new Date(template.createdAt), "MMM d, yyyy")
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(template)}
                          >
                            Edit
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

        {/* Progress Tab */}
        <TabsContent value="progress">
          <Card>
            <CardHeader className="pb-3">
              <h3 className="font-semibold">Employee Onboarding Progress</h3>
            </CardHeader>
            <CardContent>
              {loadingProgress ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !progressList || progressList.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No active onboardings</p>
                  <p className="text-sm">Assign onboarding templates to new hires to track their progress.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {progressList.map((entry) => (
                    <div key={entry.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">
                            {entry.employeeName || `Employee #${entry.employeeId}`}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            Template: {entry.templateName || `Template #${entry.templateId}`}
                          </p>
                        </div>
                        <Badge className={statusColors[entry.status] || ""}>
                          {entry.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Progress</span>
                          <span className="font-medium">{entry.completedTasks}/{entry.totalTasks} tasks</span>
                        </div>
                        <Progress
                          value={entry.totalTasks > 0 ? (entry.completedTasks / entry.totalTasks) * 100 : 0}
                          className="h-2"
                        />
                      </div>
                      {entry.startDate && (
                        <p className="text-xs text-muted-foreground">
                          Started: {format(new Date(entry.startDate), "MMM d, yyyy")}
                          {entry.expectedEndDate && (
                            <> -- Expected completion: {format(new Date(entry.expectedEndDate), "MMM d, yyyy")}</>
                          )}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Template Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg">
          <form onSubmit={handleEditSubmit}>
            <DialogHeader>
              <DialogTitle>Edit Onboarding Template</DialogTitle>
              <DialogDescription>
                Update the template name, description, and tasks.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                <Label htmlFor="editName">Template Name *</Label>
                <Input
                  id="editName"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="Template name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editDept">Department</Label>
                <Input
                  id="editDept"
                  value={editForm.department}
                  onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                  placeholder="Department"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editDesc">Description</Label>
                <Textarea
                  id="editDesc"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="Template description..."
                  rows={2}
                />
              </div>
              <TaskForm form="edit" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateTemplate.isPending}>
                {updateTemplate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
