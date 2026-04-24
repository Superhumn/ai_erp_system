import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  PenTool, Plus, Loader2, Sparkles, Copy, Download, Globe,
  Instagram, Hash, FileText, TrendingUp, Users, Search,
} from "lucide-react";
import { toast } from "sonner";

const contentTypes = [
  { value: "blog", label: "Blog Post", icon: FileText },
  { value: "social", label: "Social Media", icon: Instagram },
  { value: "email", label: "Email Newsletter", icon: Globe },
  { value: "pr", label: "Press Release", icon: Globe },
  { value: "product", label: "Product Description", icon: Hash },
] as const;

interface ContentItem {
  id: number;
  type: string;
  title: string;
  content: string;
  status: "draft" | "review" | "published";
  keywords: string[];
  createdAt: string;
}

export default function ContentHub() {
  const [tab, setTab] = useState("create");
  const [contentType, setContentType] = useState("blog");
  const [topic, setTopic] = useState("");
  const [keywords, setKeywords] = useState("");
  const [tone, setTone] = useState("professional");
  const [generating, setGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState("");
  const [savedContent, setSavedContent] = useState<ContentItem[]>([]);

  const aiMutation = (trpc.ai as any).query.useMutation({
    onSuccess: (data: any) => {
      setGeneratedContent(data.response || data.answer || "");
      setGenerating(false);
    },
    onError: (err: any) => {
      toast.error(err.message);
      setGenerating(false);
    },
  });

  const handleGenerate = () => {
    if (!topic.trim()) { toast.error("Enter a topic"); return; }
    setGenerating(true);
    const prompts: Record<string, string> = {
      blog: `Write a 600-word SEO-optimized blog post about "${topic}" for a plant-based meat company called SUPERHUMN. Keywords: ${keywords || topic}. Tone: ${tone}. Include a compelling headline, intro, 3-4 sections with subheadings, and a conclusion with CTA. Format in markdown.`,
      social: `Create 5 social media posts about "${topic}" for SUPERHUMN (plant-based meats). Include: 1 Instagram caption (with emojis + hashtags), 1 Twitter/X post, 1 LinkedIn post, 1 TikTok caption, 1 Facebook post. Keywords: ${keywords || topic}. Tone: ${tone}.`,
      email: `Write an email newsletter about "${topic}" for SUPERHUMN subscribers. Include subject line, preview text, greeting, 2-3 content sections, and CTA. Keywords: ${keywords || topic}. Tone: ${tone}. Format in markdown.`,
      pr: `Write a press release about "${topic}" for SUPERHUMN, a plant-based meat company. Include headline, dateline, lead paragraph, 2-3 body paragraphs with quotes, boilerplate, and media contact info. Tone: ${tone}.`,
      product: `Write a compelling product description for "${topic}" by SUPERHUMN. Include: tagline, 150-word description, key benefits (bullet points), ingredients callout, and suggested usage. Keywords: ${keywords || topic}. Tone: ${tone}.`,
    };
    aiMutation.mutate({ question: prompts[contentType] || prompts.blog });
  };

  const handleSave = () => {
    if (!generatedContent) return;
    const item: ContentItem = {
      id: Date.now(),
      type: contentType,
      title: topic,
      content: generatedContent,
      status: "draft",
      keywords: keywords.split(",").map(k => k.trim()).filter(Boolean),
      createdAt: new Date().toISOString(),
    };
    setSavedContent([item, ...savedContent]);
    toast.success("Content saved as draft");
  };

  return (
    <div className="space-y-2 animate-fade-in">
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-sm font-bold tracking-[-0.02em] flex items-center gap-1.5">
            <PenTool className="h-4 w-4" /> Marketing & Content
          </h1>
          <TabsList>
            <TabsTrigger value="create">Create Content</TabsTrigger>
            <TabsTrigger value="saved">Saved ({savedContent.length})</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="create" className="space-y-3">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Content Type</Label>
                  <Select value={contentType} onValueChange={setContentType}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {contentTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tone</Label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="bold">Bold & Energetic</SelectItem>
                      <SelectItem value="educational">Educational</SelectItem>
                      <SelectItem value="witty">Witty</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">SEO Keywords</Label>
                  <Input placeholder="plant-based, protein, vegan" value={keywords} onChange={(e) => setKeywords(e.target.value)} className="h-8" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Topic / Brief</Label>
                <Textarea placeholder="What should the content be about?" value={topic} onChange={(e) => setTopic(e.target.value)} rows={2} />
              </div>
              <Button onClick={handleGenerate} disabled={generating || !topic.trim()}>
                {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                {generating ? "Generating..." : "Generate Content"}
              </Button>
            </CardContent>
          </Card>

          {generatedContent && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Generated Content</CardTitle>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { navigator.clipboard.writeText(generatedContent); toast.success("Copied"); }}>
                      <Copy className="h-3 w-3 mr-1" /> Copy
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleSave}>
                      <Download className="h-3 w-3 mr-1" /> Save Draft
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm whitespace-pre-wrap bg-muted/30 rounded-lg p-4 max-h-[60vh] overflow-y-auto leading-relaxed">
                  {generatedContent}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="saved">
          {savedContent.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <PenTool className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No saved content yet. Generate and save your first piece.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {savedContent.map(item => (
                <Card key={item.id} className="py-2">
                  <CardContent className="py-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{item.title}</span>
                          <Badge variant="outline">{item.type}</Badge>
                          <Badge className="bg-gray-500/10 text-gray-600">{item.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{new Date(item.createdAt).toLocaleDateString()}</p>
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { navigator.clipboard.writeText(item.content); toast.success("Copied"); }}>
                        <Copy className="h-3 w-3 mr-1" /> Copy
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
