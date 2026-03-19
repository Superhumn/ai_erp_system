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
import { Skeleton } from "@/components/ui/skeleton";
import { PenLine, Plus, Search, Loader2, Sparkles, Send, Clock, Eye } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function ContentStudio() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<any>(null);
  const [generateForm, setGenerateForm] = useState({
    prompt: "",
    contentType: "blog_post" as string,
    platform: "website" as string,
    tone: "professional" as string,
  });

  const { data: contentPieces, isLoading, refetch } = trpc.marketing.contentPieces.useQuery();
  const generateContent = trpc.marketing.generateContent.useMutation({
    onSuccess: (data) => {
      toast.success("Content generated successfully");
      setIsGenerateOpen(false);
      setGenerateForm({ prompt: "", contentType: "blog_post", platform: "website", tone: "professional" });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const filteredContent = contentPieces?.filter((piece: any) => {
    const matchesSearch =
      piece.title?.toLowerCase().includes(search.toLowerCase()) ||
      piece.prompt?.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || piece.contentType === typeFilter;
    const matchesStatus = statusFilter === "all" || piece.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  const statusColors: Record<string, string> = {
    draft: "bg-gray-500/10 text-gray-600",
    generated: "bg-blue-500/10 text-blue-600",
    review: "bg-amber-500/10 text-amber-600",
    approved: "bg-green-500/10 text-green-600",
    published: "bg-emerald-500/10 text-emerald-600",
    scheduled: "bg-purple-500/10 text-purple-600",
  };

  const typeColors: Record<string, string> = {
    blog_post: "bg-blue-500/10 text-blue-600",
    social_media: "bg-pink-500/10 text-pink-600",
    email: "bg-amber-500/10 text-amber-600",
    press_release: "bg-purple-500/10 text-purple-600",
    newsletter: "bg-green-500/10 text-green-600",
    ad_copy: "bg-red-500/10 text-red-600",
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    generateContent.mutate({
      prompt: generateForm.prompt,
      contentType: generateForm.contentType,
      platform: generateForm.platform,
      tone: generateForm.tone,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <PenLine className="h-8 w-8" />
            Content Studio
          </h1>
          <p className="text-muted-foreground mt-1">
            AI-powered content generation and management hub.
          </p>
        </div>
        <Dialog open={isGenerateOpen} onOpenChange={setIsGenerateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Content
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <form onSubmit={handleGenerate}>
              <DialogHeader>
                <DialogTitle>Generate Content with AI</DialogTitle>
                <DialogDescription>
                  Describe what you need and AI will generate content for you.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                <div className="space-y-2">
                  <Label htmlFor="prompt">Prompt *</Label>
                  <Textarea
                    id="prompt"
                    value={generateForm.prompt}
                    onChange={(e) => setGenerateForm({ ...generateForm, prompt: e.target.value })}
                    placeholder="Describe the content you want to generate..."
                    rows={4}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contentType">Content Type</Label>
                    <Select
                      value={generateForm.contentType}
                      onValueChange={(value) => setGenerateForm({ ...generateForm, contentType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="blog_post">Blog Post</SelectItem>
                        <SelectItem value="social_media">Social Media</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="press_release">Press Release</SelectItem>
                        <SelectItem value="newsletter">Newsletter</SelectItem>
                        <SelectItem value="ad_copy">Ad Copy</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="platform">Platform</Label>
                    <Select
                      value={generateForm.platform}
                      onValueChange={(value) => setGenerateForm({ ...generateForm, platform: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="website">Website</SelectItem>
                        <SelectItem value="linkedin">LinkedIn</SelectItem>
                        <SelectItem value="twitter">Twitter / X</SelectItem>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="facebook">Facebook</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tone">Tone</Label>
                  <Select
                    value={generateForm.tone}
                    onValueChange={(value) => setGenerateForm({ ...generateForm, tone: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="formal">Formal</SelectItem>
                      <SelectItem value="witty">Witty</SelectItem>
                      <SelectItem value="inspirational">Inspirational</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsGenerateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={generateContent.isPending}>
                  {generateContent.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{previewContent?.title || "Content Preview"}</DialogTitle>
            <DialogDescription>
              {previewContent?.contentType?.replace("_", " ")} &middot; {previewContent?.platform}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 max-h-[60vh] overflow-y-auto">
            <div className="prose prose-sm dark:prose-invert whitespace-pre-wrap">
              {previewContent?.body || previewContent?.generatedContent || "No content available."}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>
              Close
            </Button>
            <Button variant="outline">
              <Clock className="h-4 w-4 mr-2" />
              Schedule
            </Button>
            <Button>
              <Send className="h-4 w-4 mr-2" />
              Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search content..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="blog_post">Blog Post</SelectItem>
                <SelectItem value="social_media">Social Media</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="press_release">Press Release</SelectItem>
                <SelectItem value="newsletter">Newsletter</SelectItem>
                <SelectItem value="ad_copy">Ad Copy</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="generated">Generated</SelectItem>
                <SelectItem value="review">In Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-[250px]" />
                  <Skeleton className="h-4 w-[100px]" />
                  <Skeleton className="h-4 w-[80px]" />
                  <Skeleton className="h-4 w-[120px]" />
                </div>
              ))}
            </div>
          ) : !filteredContent || filteredContent.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <PenLine className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No content found</p>
              <p className="text-sm">Generate your first piece of content to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContent.map((piece: any) => (
                  <TableRow key={piece.id}>
                    <TableCell className="font-medium">{piece.title || "Untitled"}</TableCell>
                    <TableCell>
                      <Badge className={typeColors[piece.contentType] || "bg-gray-500/10 text-gray-600"}>
                        {piece.contentType?.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">{piece.platform || "-"}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[piece.status] || "bg-gray-500/10 text-gray-600"}>
                        {piece.status?.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {piece.createdAt
                        ? format(new Date(piece.createdAt), "MMM d, yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPreviewContent(piece);
                            setIsPreviewOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Clock className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Send className="h-4 w-4" />
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
    </div>
  );
}
