import { useState, useCallback, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Code2,
  Play,
  Save,
  Plus,
  Trash2,
  Search,
  Loader2,
  Terminal,
  Sparkles,
  Bug,
  RefreshCw,
  FileText,
  TestTube2,
  Zap,
  Eye,
  BookOpen,
  Wand2,
  Copy,
  Check,
  ChevronDown,
  Clock,
  FolderCode,
  MoreVertical,
  Download,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

const LANGUAGES = [
  { value: "typescript", label: "TypeScript" },
  { value: "javascript", label: "JavaScript" },
  { value: "python", label: "Python" },
  { value: "bash", label: "Bash" },
  { value: "sql", label: "SQL" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "markdown", label: "Markdown" },
  { value: "rust", label: "Rust" },
  { value: "go", label: "Go" },
  { value: "java", label: "Java" },
  { value: "csharp", label: "C#" },
  { value: "cpp", label: "C++" },
  { value: "ruby", label: "Ruby" },
  { value: "php", label: "PHP" },
  { value: "swift", label: "Swift" },
];

const AI_ACTIONS = [
  { value: "generate", label: "Generate Code", icon: Sparkles, description: "Generate code from a description" },
  { value: "explain", label: "Explain Code", icon: BookOpen, description: "Get a detailed explanation" },
  { value: "debug", label: "Debug Code", icon: Bug, description: "Find and fix bugs" },
  { value: "refactor", label: "Refactor Code", icon: RefreshCw, description: "Improve code quality" },
  { value: "review", label: "Code Review", icon: Eye, description: "Get a code review" },
  { value: "test", label: "Generate Tests", icon: TestTube2, description: "Create unit tests" },
  { value: "document", label: "Add Docs", icon: FileText, description: "Generate documentation" },
  { value: "optimize", label: "Optimize", icon: Zap, description: "Optimize performance" },
] as const;

type AIAction = typeof AI_ACTIONS[number]["value"];

export default function CodePage() {
  const [code, setCode] = useState("// Start coding here...\nconsole.log('Hello, World!');\n");
  const [language, setLanguage] = useState("typescript");
  const [activeTab, setActiveTab] = useState("editor");
  const [aiPrompt, setAiPrompt] = useState("");
  const [selectedAction, setSelectedAction] = useState<AIAction>("generate");
  const [aiResult, setAiResult] = useState<{ outputCode: string | null; explanation: string } | null>(null);
  const [executionOutput, setExecutionOutput] = useState<{
    output: string;
    errorOutput: string;
    exitCode: number;
    executionTimeMs: number;
  } | null>(null);
  const [snippetTitle, setSnippetTitle] = useState("");
  const [snippetDescription, setSnippetDescription] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [editingSnippetId, setEditingSnippetId] = useState<number | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Queries
  const snippetsQuery = trpc.code.snippets.useQuery();
  const searchResults = trpc.code.searchSnippets.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length > 0 }
  );
  const executionsQuery = trpc.code.executions.useQuery({});

  // Mutations
  const executeMutation = trpc.code.execute.useMutation({
    onSuccess: (data) => {
      setExecutionOutput(data);
      setActiveTab("output");
      if (data.exitCode === 0) {
        toast.success(`Executed in ${data.executionTimeMs}ms`);
      } else {
        toast.error("Execution failed");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const aiMutation = trpc.code.aiAction.useMutation({
    onSuccess: (data) => {
      setAiResult(data);
      setActiveTab("ai-result");
      toast.success("AI response received");
    },
    onError: (err) => toast.error(err.message),
  });

  const createSnippetMutation = trpc.code.createSnippet.useMutation({
    onSuccess: () => {
      toast.success("Snippet saved");
      setShowSaveDialog(false);
      snippetsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateSnippetMutation = trpc.code.updateSnippet.useMutation({
    onSuccess: () => {
      toast.success("Snippet updated");
      snippetsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteSnippetMutation = trpc.code.deleteSnippet.useMutation({
    onSuccess: () => {
      toast.success("Snippet deleted");
      snippetsQuery.refetch();
      if (editingSnippetId) {
        setEditingSnippetId(null);
        setCode("");
        setSnippetTitle("");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const handleRun = useCallback(() => {
    executeMutation.mutate({
      code,
      language,
      snippetId: editingSnippetId ?? undefined,
    });
  }, [code, language, editingSnippetId]);

  const handleAIAction = useCallback(() => {
    if (!aiPrompt.trim() && selectedAction !== "explain" && selectedAction !== "debug" && selectedAction !== "review") {
      toast.error("Please enter a prompt for the AI action");
      return;
    }
    aiMutation.mutate({
      action: selectedAction,
      prompt: aiPrompt || `${selectedAction} this code`,
      code: code || undefined,
      language,
      snippetId: editingSnippetId ?? undefined,
    });
  }, [selectedAction, aiPrompt, code, language, editingSnippetId]);

  const handleSave = useCallback(() => {
    if (editingSnippetId) {
      updateSnippetMutation.mutate({
        id: editingSnippetId,
        title: snippetTitle,
        description: snippetDescription,
        language,
        code,
      });
    } else {
      setShowSaveDialog(true);
    }
  }, [editingSnippetId, snippetTitle, snippetDescription, language, code]);

  const handleSaveNew = useCallback(() => {
    if (!snippetTitle.trim()) {
      toast.error("Please enter a title");
      return;
    }
    createSnippetMutation.mutate({
      title: snippetTitle,
      description: snippetDescription,
      language,
      code,
    });
  }, [snippetTitle, snippetDescription, language, code]);

  const loadSnippet = useCallback((snippet: any) => {
    setCode(snippet.code);
    setLanguage(snippet.language);
    setSnippetTitle(snippet.title);
    setSnippetDescription(snippet.description || "");
    setEditingSnippetId(snippet.id);
    setActiveTab("editor");
  }, []);

  const applyAiCode = useCallback(() => {
    if (aiResult?.outputCode) {
      setCode(aiResult.outputCode);
      setActiveTab("editor");
      toast.success("AI code applied to editor");
    }
  }, [aiResult]);

  const copyToClipboard = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    toast.success("Copied to clipboard");
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle Tab key for indentation
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newCode = code.substring(0, start) + "  " + code.substring(end);
      setCode(newCode);
      // Restore cursor position
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
    }
    // Ctrl/Cmd+Enter to run
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleRun();
    }
    // Ctrl/Cmd+S to save
    if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  }, [code, handleRun, handleSave]);

  const displayedSnippets = searchQuery.length > 0
    ? (searchResults.data ?? [])
    : (snippetsQuery.data ?? []);

  const lineCount = code.split("\n").length;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] gap-4 p-1">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Code2 className="h-8 w-8 text-emerald-500" />
            Claude Code
          </h1>
          <p className="text-muted-foreground mt-1">
            AI-powered code editor with generation, debugging, and execution
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            setCode("");
            setEditingSnippetId(null);
            setSnippetTitle("");
            setSnippetDescription("");
            setExecutionOutput(null);
            setAiResult(null);
          }}>
            <Plus className="h-4 w-4 mr-1" />
            New
          </Button>
          <Button variant="outline" size="sm" onClick={handleSave}>
            <Save className="h-4 w-4 mr-1" />
            {editingSnippetId ? "Update" : "Save"}
          </Button>
          <Button
            size="sm"
            onClick={handleRun}
            disabled={executeMutation.isPending || !code.trim()}
          >
            {executeMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-1" />
            )}
            Run
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left Sidebar - Snippets */}
        <Card className="w-64 flex-shrink-0 flex flex-col">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-sm flex items-center gap-1">
              <FolderCode className="h-4 w-4" />
              Snippets
            </CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
          </CardHeader>
          <ScrollArea className="flex-1">
            <div className="px-3 pb-3 space-y-1">
              {displayedSnippets.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {searchQuery ? "No snippets found" : "No saved snippets yet"}
                </p>
              ) : (
                displayedSnippets.map((snippet: any) => (
                  <div
                    key={snippet.id}
                    className={`group flex items-center justify-between rounded-md px-2 py-1.5 cursor-pointer hover:bg-accent text-sm ${
                      editingSnippetId === snippet.id ? "bg-accent" : ""
                    }`}
                    onClick={() => loadSnippet(snippet)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium text-xs">{snippet.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {snippet.language}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => copyToClipboard(snippet.code)}>
                          <Copy className="h-3 w-3 mr-2" />
                          Copy Code
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => deleteSnippetMutation.mutate({ id: snippet.id })}
                        >
                          <Trash2 className="h-3 w-3 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* Center - Editor */}
        <div className="flex-1 flex flex-col min-w-0 gap-4">
          {/* Editor toolbar */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {editingSnippetId && (
              <Badge variant="secondary" className="text-xs">
                Editing: {snippetTitle}
              </Badge>
            )}
            <div className="flex-1" />
            <span className="text-xs text-muted-foreground">
              {lineCount} lines | {code.length} chars
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => copyToClipboard(code)}
            >
              {copiedCode ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>

          {/* Code editor textarea */}
          <Card className="flex-1 min-h-0 overflow-hidden">
            <div className="h-full flex">
              {/* Line numbers */}
              <div className="bg-muted/50 text-muted-foreground text-xs font-mono py-3 px-2 text-right select-none overflow-hidden leading-[1.5rem]">
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i + 1}>{i + 1}</div>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-background text-foreground font-mono text-sm p-3 resize-none outline-none leading-[1.5rem] overflow-auto"
                spellCheck={false}
                placeholder="// Start writing code here..."
              />
            </div>
          </Card>

          {/* Bottom Tabs - Output / AI Result */}
          <Card className="h-56 flex-shrink-0 flex flex-col">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
              <TabsList className="mx-3 mt-2 w-fit">
                <TabsTrigger value="editor" className="text-xs">
                  <Code2 className="h-3 w-3 mr-1" />
                  Editor
                </TabsTrigger>
                <TabsTrigger value="output" className="text-xs">
                  <Terminal className="h-3 w-3 mr-1" />
                  Output
                  {executionOutput && (
                    <Badge
                      variant={executionOutput.exitCode === 0 ? "default" : "destructive"}
                      className="ml-1 h-4 text-[10px] px-1"
                    >
                      {executionOutput.exitCode === 0 ? "OK" : "ERR"}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="ai-result" className="text-xs">
                  <Sparkles className="h-3 w-3 mr-1" />
                  AI Result
                </TabsTrigger>
                <TabsTrigger value="history" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  History
                </TabsTrigger>
              </TabsList>

              <TabsContent value="editor" className="flex-1 m-0 px-3 pb-2 overflow-hidden">
                <p className="text-xs text-muted-foreground">
                  Use the editor above to write code. Press <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">Ctrl+Enter</kbd> to run, <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">Ctrl+S</kbd> to save.
                </p>
              </TabsContent>

              <TabsContent value="output" className="flex-1 m-0 overflow-hidden">
                <ScrollArea className="h-full px-3 pb-2">
                  {executionOutput ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant={executionOutput.exitCode === 0 ? "default" : "destructive"}>
                          Exit: {executionOutput.exitCode}
                        </Badge>
                        <span>{executionOutput.executionTimeMs}ms</span>
                      </div>
                      {executionOutput.output && (
                        <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/50 rounded p-2">
                          {executionOutput.output}
                        </pre>
                      )}
                      {executionOutput.errorOutput && (
                        <pre className="font-mono text-xs whitespace-pre-wrap bg-destructive/10 text-destructive rounded p-2">
                          {executionOutput.errorOutput}
                        </pre>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      No output yet. Run your code to see results.
                    </p>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="ai-result" className="flex-1 m-0 overflow-hidden">
                <ScrollArea className="h-full px-3 pb-2">
                  {aiResult ? (
                    <div className="space-y-2">
                      {aiResult.explanation && (
                        <div className="text-xs whitespace-pre-wrap">
                          {aiResult.explanation}
                        </div>
                      )}
                      {aiResult.outputCode && (
                        <div className="relative">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">Generated Code</span>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() => copyToClipboard(aiResult.outputCode!)}
                              >
                                <Copy className="h-3 w-3 mr-1" />
                                Copy
                              </Button>
                              <Button
                                variant="default"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={applyAiCode}
                              >
                                <Check className="h-3 w-3 mr-1" />
                                Apply to Editor
                              </Button>
                            </div>
                          </div>
                          <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/50 rounded p-2 max-h-24 overflow-auto">
                            {aiResult.outputCode}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      Use the AI panel on the right to generate, debug, or improve code.
                    </p>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="history" className="flex-1 m-0 overflow-hidden">
                <ScrollArea className="h-full px-3 pb-2">
                  {(executionsQuery.data ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      No execution history yet.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {(executionsQuery.data ?? []).slice(0, 20).map((exec: any) => (
                        <div
                          key={exec.id}
                          className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-accent cursor-pointer"
                          onClick={() => {
                            setCode(exec.code);
                            setLanguage(exec.language);
                          }}
                        >
                          <Badge
                            variant={exec.status === "completed" ? "default" : "destructive"}
                            className="text-[10px] h-4 px-1"
                          >
                            {exec.status}
                          </Badge>
                          <span className="text-muted-foreground">{exec.language}</span>
                          <span className="truncate flex-1 font-mono">
                            {exec.code.slice(0, 60)}...
                          </span>
                          <span className="text-muted-foreground">
                            {exec.executionTimeMs ? `${exec.executionTimeMs}ms` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        {/* Right Sidebar - AI Actions */}
        <Card className="w-80 flex-shrink-0 flex flex-col">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-sm flex items-center gap-1">
              <Sparkles className="h-4 w-4 text-violet-500" />
              Claude AI Assistant
            </CardTitle>
            <CardDescription className="text-xs">
              Select an action and describe what you need
            </CardDescription>
          </CardHeader>
          <div className="px-3 space-y-3 flex-1 flex flex-col">
            {/* Action grid */}
            <div className="grid grid-cols-2 gap-1.5">
              {AI_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.value}
                    variant={selectedAction === action.value ? "default" : "outline"}
                    size="sm"
                    className="h-auto py-2 px-2 flex flex-col items-center gap-1 text-xs"
                    onClick={() => setSelectedAction(action.value)}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[10px] leading-tight text-center">{action.label}</span>
                  </Button>
                );
              })}
            </div>

            <Separator />

            {/* Prompt input */}
            <div className="space-y-2 flex-1 flex flex-col">
              <label className="text-xs font-medium">
                {AI_ACTIONS.find(a => a.value === selectedAction)?.description}
              </label>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder={
                  selectedAction === "generate"
                    ? "Describe the code you want to generate..."
                    : selectedAction === "explain"
                    ? "Any specific aspects to explain? (optional)"
                    : selectedAction === "debug"
                    ? "Describe the expected behavior..."
                    : "Additional instructions (optional)..."
                }
                className="flex-1 min-h-[80px] bg-muted/50 rounded-md p-2 text-xs resize-none outline-none focus:ring-1 focus:ring-ring"
              />
              <Button
                className="w-full"
                size="sm"
                onClick={handleAIAction}
                disabled={aiMutation.isPending}
              >
                {aiMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-1" />
                    Run {AI_ACTIONS.find(a => a.value === selectedAction)?.label}
                  </>
                )}
              </Button>
            </div>

            <Separator />

            {/* Quick actions */}
            <div className="pb-3">
              <p className="text-[10px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                Quick Actions
              </p>
              <div className="space-y-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start h-7 text-xs"
                  onClick={() => {
                    setSelectedAction("explain");
                    setAiPrompt("Explain this code step by step");
                    handleAIAction();
                  }}
                  disabled={!code.trim() || aiMutation.isPending}
                >
                  <BookOpen className="h-3 w-3 mr-2" />
                  Explain this code
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start h-7 text-xs"
                  onClick={() => {
                    setSelectedAction("debug");
                    setAiPrompt("Find all bugs and potential issues");
                    handleAIAction();
                  }}
                  disabled={!code.trim() || aiMutation.isPending}
                >
                  <Bug className="h-3 w-3 mr-2" />
                  Find bugs
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start h-7 text-xs"
                  onClick={() => {
                    setSelectedAction("test");
                    setAiPrompt("Generate comprehensive unit tests");
                    handleAIAction();
                  }}
                  disabled={!code.trim() || aiMutation.isPending}
                >
                  <TestTube2 className="h-3 w-3 mr-2" />
                  Generate tests
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start h-7 text-xs"
                  onClick={() => {
                    setSelectedAction("optimize");
                    setAiPrompt("Optimize for performance");
                    handleAIAction();
                  }}
                  disabled={!code.trim() || aiMutation.isPending}
                >
                  <Zap className="h-3 w-3 mr-2" />
                  Optimize
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Save Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Code Snippet</DialogTitle>
            <DialogDescription>
              Give your snippet a name and optional description.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input
                value={snippetTitle}
                onChange={(e) => setSnippetTitle(e.target.value)}
                placeholder="My awesome snippet"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description (optional)</label>
              <Input
                value={snippetDescription}
                onChange={(e) => setSnippetDescription(e.target.value)}
                placeholder="What does this code do?"
                className="mt-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{language}</Badge>
              <span className="text-xs text-muted-foreground">{code.split("\n").length} lines</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveNew} disabled={createSnippetMutation.isPending}>
              {createSnippetMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
