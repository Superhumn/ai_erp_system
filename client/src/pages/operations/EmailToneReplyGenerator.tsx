import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Mail,
  Plus,
  Trash2,
  Loader2,
  Send,
  ScanSearch,
  Sparkles,
  Copy,
  Star,
  Pencil,
  MessageSquareReply,
  BarChart3,
  BookOpen,
} from "lucide-react";

export default function EmailToneReplyGenerator() {
  const [activeTab, setActiveTab] = useState("profiles");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Email Tone & Reply Generator</h1>
          <p className="text-muted-foreground">
            Scan your sent emails to learn your writing style, then generate replies that sound like you.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="profiles" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Tone Profiles
          </TabsTrigger>
          <TabsTrigger value="analyze" className="gap-2">
            <ScanSearch className="h-4 w-4" />
            Analyze Tone
          </TabsTrigger>
          <TabsTrigger value="generate" className="gap-2">
            <MessageSquareReply className="h-4 w-4" />
            Generate Reply
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profiles">
          <ProfilesTab />
        </TabsContent>
        <TabsContent value="analyze">
          <AnalyzeTab />
        </TabsContent>
        <TabsContent value="generate">
          <GenerateReplyTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================
// PROFILES TAB
// ============================================

function ProfilesTab() {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newEmails, setNewEmails] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const utils = trpc.useUtils();
  const profilesQuery = trpc.emailTone.getProfiles.useQuery();
  const createMutation = trpc.emailTone.createProfile.useMutation({
    onSuccess: () => {
      toast.success("Tone profile created successfully");
      setShowCreate(false);
      setNewName("");
      setNewDescription("");
      setNewEmails("");
      setIsDefault(false);
      utils.emailTone.getProfiles.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.emailTone.deleteProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile deleted");
      utils.emailTone.getProfiles.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.emailTone.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile updated");
      utils.emailTone.getProfiles.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const scanSentMutation = trpc.emailTone.scanSentEmails.useMutation({
    onSuccess: () => {
      toast.success("Sent emails scanned and profile updated");
      utils.emailTone.getProfiles.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleCreate = () => {
    const emails = newEmails
      .split(/\n---\n|\n\n\n/)
      .map((e) => e.trim())
      .filter((e) => e.length >= 10);

    if (emails.length === 0) {
      toast.error("Please paste at least one email (minimum 10 characters). Separate multiple emails with --- on a new line.");
      return;
    }

    createMutation.mutate({
      name: newName,
      description: newDescription || undefined,
      emails,
      isDefault,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Your Tone Profiles</h2>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Profile
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Tone Profile</DialogTitle>
              <DialogDescription>
                Paste your sent emails below to analyze your writing style. Separate multiple emails
                with a line containing only --- (three dashes).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile-name">Profile Name</Label>
                <Input
                  id="profile-name"
                  placeholder="e.g. My Professional Tone"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-desc">Description (optional)</Label>
                <Input
                  id="profile-desc"
                  placeholder="e.g. Tone I use for vendor communications"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sample-emails">Sample Emails</Label>
                <Textarea
                  id="sample-emails"
                  placeholder={`Paste your sent emails here. Separate multiple emails with ---\n\nExample:\n\nHi John,\n\nThanks for sending over the quote...\n\nBest,\nJane\n\n---\n\nHey team,\n\nQuick update on the project...`}
                  className="min-h-[250px] font-mono text-sm"
                  value={newEmails}
                  onChange={(e) => setNewEmails(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={isDefault} onCheckedChange={setIsDefault} id="default-profile" />
                <Label htmlFor="default-profile">Set as default profile</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!newName || !newEmails || createMutation.isPending}
                className="gap-2"
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Analyze & Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {profilesQuery.isLoading && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {profilesQuery.data?.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <Mail className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No tone profiles yet</h3>
            <p className="text-muted-foreground mt-1 max-w-md">
              Create a tone profile by pasting your sent emails. The AI will analyze your writing style
              and use it to generate replies that sound like you.
            </p>
            <Button className="mt-4 gap-2" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              Create Your First Profile
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {profilesQuery.data?.map((profile) => (
          <Card key={profile.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {profile.name}
                    {profile.isDefault && (
                      <Badge variant="secondary" className="gap-1">
                        <Star className="h-3 w-3" />
                        Default
                      </Badge>
                    )}
                  </CardTitle>
                  {profile.description && (
                    <CardDescription className="mt-1">{profile.description}</CardDescription>
                  )}
                </div>
                <div className="flex gap-1">
                  {!profile.isDefault && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Set as default"
                      onClick={() => updateMutation.mutate({ id: profile.id, isDefault: true })}
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Scan sent emails to improve"
                    disabled={scanSentMutation.isPending}
                    onClick={() => scanSentMutation.mutate({ profileId: profile.id, limit: 20 })}
                  >
                    {scanSentMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ScanSearch className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Delete"
                    onClick={() => deleteMutation.mutate({ id: profile.id })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <ToneBar label="Formality" value={Number(profile.formality) || 0} />
                <ToneBar label="Friendliness" value={Number(profile.friendliness) || 0} />
                <ToneBar label="Assertiveness" value={Number(profile.assertiveness) || 0} />
                <ToneBar label="Verbosity" value={Number(profile.verbosity) || 0} />
              </div>
              <Separator />
              <div className="flex flex-wrap gap-1.5 text-sm">
                {profile.vocabularyLevel && (
                  <Badge variant="outline">{profile.vocabularyLevel} vocabulary</Badge>
                )}
                {profile.sentenceStructure && (
                  <Badge variant="outline">{profile.sentenceStructure} sentences</Badge>
                )}
                {profile.usesEmoji && <Badge variant="outline">Uses emoji</Badge>}
                {profile.usesBulletPoints && <Badge variant="outline">Uses lists</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">
                {profile.emailsScanned} email{profile.emailsScanned !== 1 ? "s" : ""} scanned
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ToneBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{Math.round(value)}</span>
      </div>
      <Progress value={value} className="h-2" />
    </div>
  );
}

// ============================================
// ANALYZE TAB
// ============================================

function AnalyzeTab() {
  const [emailText, setEmailText] = useState("");
  const analyzeMutation = trpc.emailTone.analyzeTone.useMutation({
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanSearch className="h-5 w-5" />
            Analyze Email Tone
          </CardTitle>
          <CardDescription>
            Paste an email to analyze its tone, style, and writing characteristics.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Paste an email here to analyze its tone and style..."
            className="min-h-[300px] font-mono text-sm"
            value={emailText}
            onChange={(e) => setEmailText(e.target.value)}
          />
          <Button
            onClick={() => analyzeMutation.mutate({ emailText })}
            disabled={emailText.length < 10 || analyzeMutation.isPending}
            className="w-full gap-2"
          >
            {analyzeMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BarChart3 className="h-4 w-4" />
            )}
            Analyze Tone
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Analysis Results</CardTitle>
          <CardDescription>
            {analyzeMutation.data
              ? `Detected tone: ${analyzeMutation.data.detectedTone}`
              : "Results will appear here after analysis"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analyzeMutation.isPending && (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {analyzeMutation.data && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <ToneBar label="Formality" value={analyzeMutation.data.formality} />
                <ToneBar label="Friendliness" value={analyzeMutation.data.friendliness} />
                <ToneBar label="Assertiveness" value={analyzeMutation.data.assertiveness} />
                <ToneBar label="Verbosity" value={analyzeMutation.data.verbosity} />
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className="text-sm font-medium">Style Characteristics</h4>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline">{analyzeMutation.data.vocabularyLevel} vocabulary</Badge>
                  <Badge variant="outline">{analyzeMutation.data.sentenceStructure} sentences</Badge>
                  {analyzeMutation.data.usesEmoji && <Badge variant="outline">Uses emoji</Badge>}
                  {analyzeMutation.data.usesBulletPoints && <Badge variant="outline">Uses lists</Badge>}
                </div>
              </div>

              {analyzeMutation.data.commonGreetings.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-sm font-medium">Greetings</h4>
                  <p className="text-sm text-muted-foreground">
                    {analyzeMutation.data.commonGreetings.join(", ")}
                  </p>
                </div>
              )}

              {analyzeMutation.data.commonClosings.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-sm font-medium">Closings</h4>
                  <p className="text-sm text-muted-foreground">
                    {analyzeMutation.data.commonClosings.join(", ")}
                  </p>
                </div>
              )}

              {analyzeMutation.data.samplePhrases.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-sm font-medium">Characteristic Phrases</h4>
                  <ul className="list-disc pl-4 text-sm text-muted-foreground space-y-0.5">
                    {analyzeMutation.data.samplePhrases.map((phrase, i) => (
                      <li key={i}>"{phrase}"</li>
                    ))}
                  </ul>
                </div>
              )}

              {analyzeMutation.data.signatureStyle && (
                <div className="space-y-1">
                  <h4 className="text-sm font-medium">Signature Style</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {analyzeMutation.data.signatureStyle}
                  </p>
                </div>
              )}
            </div>
          )}

          {!analyzeMutation.data && !analyzeMutation.isPending && (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <BarChart3 className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                Paste an email on the left and click "Analyze Tone" to see results.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// GENERATE REPLY TAB
// ============================================

function GenerateReplyTab() {
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [fromEmail, setFromEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [senderName, setSenderName] = useState("");
  const [additionalInstructions, setAdditionalInstructions] = useState("");

  const profilesQuery = trpc.emailTone.getProfiles.useQuery();

  const generateMutation = trpc.emailTone.generateReply.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const quickReplyMutation = trpc.emailTone.quickReply.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const replyData = generateMutation.data || quickReplyMutation.data;
  const isGenerating = generateMutation.isPending || quickReplyMutation.isPending;

  const handleGenerate = () => {
    const incomingEmail = {
      from: fromEmail || "unknown@example.com",
      subject,
      body,
    };

    if (selectedProfileId) {
      generateMutation.mutate({
        profileId: Number(selectedProfileId),
        incomingEmail,
        senderName: senderName || undefined,
        additionalInstructions: additionalInstructions || undefined,
      });
    } else {
      quickReplyMutation.mutate({
        incomingEmail,
        additionalInstructions: additionalInstructions || undefined,
      });
    }
  };

  const handleCopy = () => {
    if (replyData) {
      navigator.clipboard.writeText(replyData.body);
      toast.success("Reply copied to clipboard");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Incoming Email
          </CardTitle>
          <CardDescription>
            Paste the email you want to reply to. The reply will match your selected tone profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Tone Profile</Label>
            <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
              <SelectTrigger>
                <SelectValue placeholder="Use default profile" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Use default profile</SelectItem>
                {profilesQuery.data?.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name} {p.isDefault ? "(Default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="from-email">From (sender email)</Label>
            <Input
              id="from-email"
              placeholder="sender@example.com"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              placeholder="Email subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-body">Email Body</Label>
            <Textarea
              id="email-body"
              placeholder="Paste the email body here..."
              className="min-h-[200px]"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sender-name">Your Name (optional)</Label>
            <Input
              id="sender-name"
              placeholder="e.g. Jane Smith"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="instructions">Additional Instructions (optional)</Label>
            <Textarea
              id="instructions"
              placeholder="e.g. Mention that we can offer a 10% discount..."
              className="min-h-[80px]"
              value={additionalInstructions}
              onChange={(e) => setAdditionalInstructions(e.target.value)}
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!body || body.length < 10 || isGenerating}
            className="w-full gap-2"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate Reply
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquareReply className="h-5 w-5" />
                Generated Reply
              </CardTitle>
              {replyData && (
                <CardDescription className="mt-1">
                  Tone: {replyData.tone} | Confidence: {Math.round(replyData.confidence)}%
                </CardDescription>
              )}
            </div>
            {replyData && (
              <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2">
                <Copy className="h-4 w-4" />
                Copy
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isGenerating && (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {replyData && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Subject</Label>
                <p className="text-sm font-medium">{replyData.subject}</p>
              </div>
              <Separator />
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Body</Label>
                <div className="rounded-md border bg-muted/30 p-4 text-sm whitespace-pre-wrap">
                  {replyData.body}
                </div>
              </div>
            </div>
          )}

          {!replyData && !isGenerating && (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <MessageSquareReply className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                Fill in the email details on the left and click "Generate Reply" to create a
                tone-matched response.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
