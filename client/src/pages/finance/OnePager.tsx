import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  FileText,
  Plus,
  Eye,
  ExternalLink,
  Copy,
  Globe,
  Lock,
  Loader2,
  Trash2,
  Edit,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

function formatCurrency(value: string | number | null | undefined) {
  const num = typeof value === "number" ? value : parseFloat(value || "0");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type OnePagerFormData = {
  title: string;
  slug: string;
  companyName: string;
  tagline: string;
  problem: string;
  solution: string;
  traction: string;
  businessModel: string;
  market: string;
  team: string;
  askAmount: string;
  askType: string;
  useOfFunds: string;
  contactName: string;
  contactEmail: string;
  websiteUrl: string;
  showLiveMetrics: boolean;
  showFinancials: boolean;
  isPublished: boolean;
  password: string;
};

const defaultFormData: OnePagerFormData = {
  title: "",
  slug: "",
  companyName: "",
  tagline: "",
  problem: "",
  solution: "",
  traction: "",
  businessModel: "",
  market: "",
  team: "",
  askAmount: "",
  askType: "equity",
  useOfFunds: "",
  contactName: "",
  contactEmail: "",
  websiteUrl: "",
  showLiveMetrics: false,
  showFinancials: false,
  isPublished: false,
  password: "",
};

export default function OnePager() {
  const [, setLocation] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<OnePagerFormData>(defaultFormData);
  const [activeTab, setActiveTab] = useState("overview");

  const { data: onePagers, isLoading, refetch } = trpc.onePager.list.useQuery();

  const createOnePager = trpc.onePager.create.useMutation({
    onSuccess: () => {
      toast.success("One-pager created successfully");
      closeDialog();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateOnePager = trpc.onePager.update.useMutation({
    onSuccess: () => {
      toast.success("One-pager updated successfully");
      closeDialog();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteOnePager = trpc.onePager.delete.useMutation({
    onSuccess: () => {
      toast.success("One-pager deleted successfully");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  function closeDialog() {
    setIsDialogOpen(false);
    setEditingId(null);
    setFormData(defaultFormData);
    setActiveTab("overview");
  }

  function openCreateDialog() {
    setEditingId(null);
    setFormData(defaultFormData);
    setActiveTab("overview");
    setIsDialogOpen(true);
  }

  function openEditDialog(onePager: any) {
    setEditingId(onePager.id);
    setFormData({
      title: onePager.title || "",
      slug: onePager.slug || "",
      companyName: onePager.companyName || "",
      tagline: onePager.tagline || "",
      problem: onePager.problem || "",
      solution: onePager.solution || "",
      traction: onePager.traction || "",
      businessModel: onePager.businessModel || "",
      market: onePager.market || "",
      team: onePager.team || "",
      askAmount: onePager.askAmount?.toString() || "",
      askType: onePager.askType || "equity",
      useOfFunds: onePager.useOfFunds || "",
      contactName: onePager.contactName || "",
      contactEmail: onePager.contactEmail || "",
      websiteUrl: onePager.websiteUrl || "",
      showLiveMetrics: onePager.showLiveMetrics ?? false,
      showFinancials: onePager.showFinancials ?? false,
      isPublished: onePager.isPublished ?? false,
      password: onePager.password || "",
    });
    setActiveTab("overview");
    setIsDialogOpen(true);
  }

  function handleTitleChange(title: string) {
    setFormData((prev) => ({
      ...prev,
      title,
      slug: editingId ? prev.slug : slugify(title),
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...formData,
      askAmount: formData.askAmount ? parseFloat(formData.askAmount) : undefined,
    };

    if (editingId) {
      updateOnePager.mutate({ id: editingId, ...payload });
    } else {
      createOnePager.mutate(payload);
    }
  }

  function handleCopyLink(slug: string) {
    const url = `${window.location.origin}/pitch/${slug}`;
    navigator.clipboard.writeText(url).then(() => {
      toast.success("Link copied to clipboard");
    }).catch(() => {
      toast.error("Failed to copy link");
    });
  }

  function handleDelete(id: number) {
    if (window.confirm("Are you sure you want to delete this one-pager?")) {
      deleteOnePager.mutate({ id });
    }
  }

  const isSaving = createOnePager.isPending || updateOnePager.isPending;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-8 w-8" />
            Startup One-Pager
          </h1>
          <p className="text-muted-foreground mt-1">
            Create and share a live snapshot of your startup with investors
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Create One-Pager
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && (!onePagers || onePagers.length === 0) && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-1">No one-pagers yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Create your first one-pager to share with investors.
            </p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Create One-Pager
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Grid of one-pager cards */}
      {!isLoading && onePagers && onePagers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {onePagers.map((pager: any) => (
            <Card
              key={pager.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 min-w-0 flex-1">
                    <CardTitle className="text-base truncate">
                      {pager.companyName || pager.title || "Untitled"}
                    </CardTitle>
                    {pager.tagline && (
                      <p className="text-sm text-muted-foreground truncate">
                        {pager.tagline}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 ml-2 shrink-0">
                    {pager.isPublished ? (
                      <Badge className="bg-green-500/10 text-green-600 border-transparent">
                        Published
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Draft</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    {pager.askAmount && (
                      <span className="font-medium">
                        {formatCurrency(pager.askAmount)}
                      </span>
                    )}
                    {pager.askType && (
                      <Badge variant="outline" className="text-xs">
                        {pager.askType}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Eye className="h-3.5 w-3.5" />
                    <span>{pager.viewCount ?? 0}</span>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  Created{" "}
                  {pager.createdAt
                    ? new Date(pager.createdAt).toLocaleDateString()
                    : "N/A"}
                </div>

                <div className="flex items-center gap-1 pt-1 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditDialog(pager);
                    }}
                  >
                    <Edit className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyLink(pager.slug);
                    }}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Copy Link
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(pager.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit One-Pager" : "Create One-Pager"}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update your startup one-pager details."
                : "Fill in the details to create a shareable one-pager for investors."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Top-level fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="My Startup One-Pager"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, slug: e.target.value }))
                  }
                  placeholder="my-startup"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  value={formData.companyName}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      companyName: e.target.value,
                    }))
                  }
                  placeholder="Acme Inc."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tagline">Tagline</Label>
                <Input
                  id="tagline"
                  value={formData.tagline}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, tagline: e.target.value }))
                  }
                  placeholder="Making the world a better place"
                />
              </div>
            </div>

            {/* Tabbed sections */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full">
                <TabsTrigger value="overview" className="flex-1">
                  Overview
                </TabsTrigger>
                <TabsTrigger value="funding" className="flex-1">
                  Funding
                </TabsTrigger>
                <TabsTrigger value="settings" className="flex-1">
                  Settings
                </TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="problem">Problem</Label>
                  <Textarea
                    id="problem"
                    value={formData.problem}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        problem: e.target.value,
                      }))
                    }
                    placeholder="What problem are you solving?"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="solution">Solution</Label>
                  <Textarea
                    id="solution"
                    value={formData.solution}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        solution: e.target.value,
                      }))
                    }
                    placeholder="How does your product solve this problem?"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="traction">Traction</Label>
                  <Textarea
                    id="traction"
                    value={formData.traction}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        traction: e.target.value,
                      }))
                    }
                    placeholder="Key metrics, revenue, users, growth..."
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessModel">Business Model</Label>
                  <Textarea
                    id="businessModel"
                    value={formData.businessModel}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        businessModel: e.target.value,
                      }))
                    }
                    placeholder="How do you make money?"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="market">Market</Label>
                  <Textarea
                    id="market"
                    value={formData.market}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        market: e.target.value,
                      }))
                    }
                    placeholder="Target market size, TAM/SAM/SOM..."
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="team">Team</Label>
                  <Textarea
                    id="team"
                    value={formData.team}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        team: e.target.value,
                      }))
                    }
                    placeholder="Key team members and their backgrounds"
                    rows={3}
                  />
                </div>
              </TabsContent>

              {/* Funding Tab */}
              <TabsContent value="funding" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="askAmount">Ask Amount</Label>
                    <Input
                      id="askAmount"
                      type="number"
                      value={formData.askAmount}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          askAmount: e.target.value,
                        }))
                      }
                      placeholder="500000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="askType">Ask Type</Label>
                    <Select
                      value={formData.askType}
                      onValueChange={(value) =>
                        setFormData((prev) => ({ ...prev, askType: value }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="equity">Equity</SelectItem>
                        <SelectItem value="convertible_note">
                          Convertible Note
                        </SelectItem>
                        <SelectItem value="safe">SAFE</SelectItem>
                        <SelectItem value="debt">Debt</SelectItem>
                        <SelectItem value="grant">Grant</SelectItem>
                        <SelectItem value="revenue_share">
                          Revenue Share
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="useOfFunds">Use of Funds</Label>
                  <Textarea
                    id="useOfFunds"
                    value={formData.useOfFunds}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        useOfFunds: e.target.value,
                      }))
                    }
                    placeholder="How will the funds be allocated?"
                    rows={4}
                  />
                </div>
                {formData.askAmount && (
                  <div className="rounded-lg border p-4 bg-muted/50">
                    <p className="text-sm text-muted-foreground">
                      Raising{" "}
                      <span className="font-semibold text-foreground">
                        {formatCurrency(formData.askAmount)}
                      </span>{" "}
                      via{" "}
                      <span className="font-semibold text-foreground">
                        {formData.askType.replace(/_/g, " ")}
                      </span>
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contactName">Contact Name</Label>
                    <Input
                      id="contactName"
                      value={formData.contactName}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          contactName: e.target.value,
                        }))
                      }
                      placeholder="John Doe"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactEmail">Contact Email</Label>
                    <Input
                      id="contactEmail"
                      type="email"
                      value={formData.contactEmail}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          contactEmail: e.target.value,
                        }))
                      }
                      placeholder="john@acme.com"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="websiteUrl">Website URL</Label>
                  <Input
                    id="websiteUrl"
                    type="url"
                    value={formData.websiteUrl}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        websiteUrl: e.target.value,
                      }))
                    }
                    placeholder="https://acme.com"
                  />
                </div>

                <div className="space-y-4 rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="showLiveMetrics">Show Live Metrics</Label>
                      <p className="text-xs text-muted-foreground">
                        Display real-time metrics from your ERP on the one-pager
                      </p>
                    </div>
                    <Switch
                      id="showLiveMetrics"
                      checked={formData.showLiveMetrics}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({
                          ...prev,
                          showLiveMetrics: checked,
                        }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="showFinancials">Show Financials</Label>
                      <p className="text-xs text-muted-foreground">
                        Include financial data on the public one-pager
                      </p>
                    </div>
                    <Switch
                      id="showFinancials"
                      checked={formData.showFinancials}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({
                          ...prev,
                          showFinancials: checked,
                        }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="isPublished">Published</Label>
                      <p className="text-xs text-muted-foreground">
                        Make this one-pager publicly accessible
                      </p>
                    </div>
                    <Switch
                      id="isPublished"
                      checked={formData.isPublished}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({
                          ...prev,
                          isPublished: checked,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password Protection</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        password: e.target.value,
                      }))
                    }
                    placeholder="Leave blank for no password"
                  />
                  <p className="text-xs text-muted-foreground">
                    Optionally require a password to view this one-pager
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeDialog}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingId ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
