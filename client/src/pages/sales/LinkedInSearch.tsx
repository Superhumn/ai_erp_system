import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  Search,
  Loader2,
  ExternalLink,
  UserPlus,
  Star,
  History,
  Briefcase,
  MapPin,
  Building2,
  Send,
  Users,
  TrendingUp,
  Target,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";

type SearchPurpose = "hiring" | "investor" | "sales_prospect";

type SearchResult = {
  id: number;
  name: string;
  headline: string | null;
  profileUrl: string;
  snippet: string | null;
  location: string | null;
  company: string | null;
  jobTitle: string | null;
  industry: string | null;
  relevanceScore: number | null;
  status: string;
  enrichedData: {
    estimatedSeniority?: string;
    keySkills?: string[];
    potentialFit?: string;
    suggestedOutreach?: string;
  } | null;
};

const purposeConfig: Record<SearchPurpose, { label: string; icon: any; description: string; defaultIndustry: string }> = {
  hiring: {
    label: "Hire Candidates",
    icon: Users,
    description: "Find candidates to recruit for open positions",
    defaultIndustry: "",
  },
  investor: {
    label: "Find Investors",
    icon: TrendingUp,
    description: "Discover investors for fundraising and cold outreach",
    defaultIndustry: "",
  },
  sales_prospect: {
    label: "Sales Prospects",
    icon: Target,
    description: "Identify sales prospects in foodservice or retail internationally",
    defaultIndustry: "foodservice retail",
  },
};

export default function LinkedInSearch() {
  const [activeTab, setActiveTab] = useState("search");
  const [purpose, setPurpose] = useState<SearchPurpose>("sales_prospect");
  const [keywords, setKeywords] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");
  const [country, setCountry] = useState("");
  const [seniority, setSeniority] = useState("");
  const [limit, setLimit] = useState(10);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Results state
  const [selectedResults, setSelectedResults] = useState<Set<number>>(new Set());
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportContactType, setExportContactType] = useState("lead");
  const [activeSearchId, setActiveSearchId] = useState<number | null>(null);
  const [copiedOutreach, setCopiedOutreach] = useState<number | null>(null);

  // Queries
  const { data: pastSearches, refetch: refetchSearches } = trpc.linkedinSearch.listSearches.useQuery();
  const { data: activeSearchData, isLoading: isLoadingResults } = trpc.linkedinSearch.getSearch.useQuery(
    { id: activeSearchId! },
    { enabled: !!activeSearchId }
  );

  // Mutations
  const searchMutation = trpc.linkedinSearch.search.useMutation({
    onSuccess: (data) => {
      toast.success(`Found ${data.totalResults} LinkedIn profiles`);
      setActiveSearchId(data.searchId);
      setActiveTab("results");
      refetchSearches();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const exportMutation = trpc.linkedinSearch.exportToCRM.useMutation({
    onSuccess: (data) => {
      toast.success(`Imported ${data.imported} contacts to CRM${data.skipped > 0 ? `, ${data.skipped} already existed` : ""}`);
      if (data.errors.length > 0) {
        toast.error(`${data.errors.length} errors during import`);
      }
      setExportDialogOpen(false);
      setSelectedResults(new Set());
      // Refresh search results
      if (activeSearchId) {
        refetchSearches();
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateResultMutation = trpc.linkedinSearch.updateResult.useMutation();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keywords.trim()) {
      toast.error("Please enter search keywords");
      return;
    }
    searchMutation.mutate({
      purpose,
      keywords: keywords.trim(),
      jobTitle: jobTitle || undefined,
      company: company || undefined,
      industry: industry || undefined,
      location: location || undefined,
      country: country || undefined,
      seniority: seniority || undefined,
      limit,
    });
  };

  const handleExport = () => {
    if (selectedResults.size === 0) {
      toast.error("Select at least one result to export");
      return;
    }
    exportMutation.mutate({
      resultIds: Array.from(selectedResults),
      contactType: exportContactType as any,
    });
  };

  const handleSelectAll = () => {
    const results = activeSearchData?.results || [];
    if (selectedResults.size === results.length) {
      setSelectedResults(new Set());
    } else {
      setSelectedResults(new Set(results.map((r: SearchResult) => r.id)));
    }
  };

  const toggleResult = (id: number) => {
    setSelectedResults(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDismiss = (resultId: number) => {
    updateResultMutation.mutate({ id: resultId, status: "dismissed" });
  };

  const handleSave = (resultId: number) => {
    updateResultMutation.mutate({ id: resultId, status: "saved" });
    toast.success("Result saved");
  };

  const handleCopyOutreach = (text: string, resultId: number) => {
    navigator.clipboard.writeText(text);
    setCopiedOutreach(resultId);
    setTimeout(() => setCopiedOutreach(null), 2000);
    toast.success("Outreach message copied to clipboard");
  };

  const getScoreColor = (score: number | null) => {
    if (!score) return "bg-gray-100 text-gray-700";
    if (score >= 80) return "bg-green-100 text-green-800";
    if (score >= 60) return "bg-blue-100 text-blue-800";
    if (score >= 40) return "bg-yellow-100 text-yellow-800";
    return "bg-gray-100 text-gray-700";
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      new: "bg-blue-100 text-blue-800",
      saved: "bg-purple-100 text-purple-800",
      exported_to_crm: "bg-green-100 text-green-800",
      already_in_crm: "bg-gray-100 text-gray-800",
      dismissed: "bg-red-100 text-red-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const results: SearchResult[] = activeSearchData?.results || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Search className="h-6 w-6" />
            LinkedIn Search
          </h1>
          <p className="text-muted-foreground mt-1">
            Find candidates, investors, and sales prospects on LinkedIn
          </p>
        </div>
        {selectedResults.size > 0 && (
          <Button onClick={() => setExportDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Export {selectedResults.size} to CRM
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="search">
            <Search className="h-4 w-4 mr-1" />
            Search
          </TabsTrigger>
          <TabsTrigger value="results" disabled={!activeSearchId}>
            <Users className="h-4 w-4 mr-1" />
            Results {results.length > 0 && `(${results.length})`}
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-1" />
            History
          </TabsTrigger>
        </TabsList>

        {/* SEARCH TAB */}
        <TabsContent value="search" className="space-y-6">
          {/* Purpose Selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(Object.keys(purposeConfig) as SearchPurpose[]).map((key) => {
              const config = purposeConfig[key];
              const Icon = config.icon;
              return (
                <Card
                  key={key}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    purpose === key
                      ? "border-primary ring-2 ring-primary/20"
                      : "hover:border-primary/50"
                  }`}
                  onClick={() => {
                    setPurpose(key);
                    if (config.defaultIndustry && !industry) {
                      setIndustry(config.defaultIndustry);
                    }
                  }}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${purpose === key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">{config.label}</h3>
                        <p className="text-xs text-muted-foreground mt-1">{config.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Search Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Search Criteria</CardTitle>
              <CardDescription>
                {purpose === "hiring" && "Define the role and qualifications you're looking for"}
                {purpose === "investor" && "Describe the type of investors you want to connect with"}
                {purpose === "sales_prospect" && "Specify the market and decision-makers you want to reach"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSearch} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="keywords">Keywords *</Label>
                    <Input
                      id="keywords"
                      value={keywords}
                      onChange={(e) => setKeywords(e.target.value)}
                      placeholder={
                        purpose === "hiring"
                          ? "e.g., React developer, food scientist"
                          : purpose === "investor"
                          ? "e.g., food tech investor, angel investor CPG"
                          : "e.g., procurement director, buyer frozen foods"
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="jobTitle">Job Title</Label>
                    <Input
                      id="jobTitle"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder={
                        purpose === "hiring"
                          ? "e.g., Senior Software Engineer"
                          : purpose === "investor"
                          ? "e.g., Managing Partner, General Partner"
                          : "e.g., VP of Procurement, Buyer"
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    <Input
                      id="industry"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      placeholder="e.g., foodservice, retail, CPG, food & beverage"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g., New York, London, Dubai, Southeast Asia"
                    />
                  </div>
                </div>

                {/* Advanced Options */}
                <button
                  type="button"
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                >
                  {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  Advanced Filters
                </button>

                {showAdvanced && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t">
                    <div className="space-y-2">
                      <Label htmlFor="company">Company</Label>
                      <Input
                        id="company"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="e.g., Sysco, Walmart, Nestlé"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="country">Country</Label>
                      <Input
                        id="country"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        placeholder="e.g., UK, Germany, UAE, Singapore"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="seniority">Seniority Level</Label>
                      <Select value={seniority} onValueChange={setSeniority}>
                        <SelectTrigger>
                          <SelectValue placeholder="Any level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Any level</SelectItem>
                          <SelectItem value="entry">Entry Level</SelectItem>
                          <SelectItem value="mid">Mid Level</SelectItem>
                          <SelectItem value="senior">Senior</SelectItem>
                          <SelectItem value="director">Director</SelectItem>
                          <SelectItem value="VP">VP / Executive</SelectItem>
                          <SelectItem value="C-level">C-Level</SelectItem>
                          <SelectItem value="founder">Founder / Owner</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="limit">Max Results</Label>
                      <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5 results</SelectItem>
                          <SelectItem value="10">10 results</SelectItem>
                          <SelectItem value="20">20 results</SelectItem>
                          <SelectItem value="30">30 results</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-4">
                  <Button
                    type="submit"
                    disabled={searchMutation.isPending || !keywords.trim()}
                    size="lg"
                  >
                    {searchMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Searching LinkedIn...
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4 mr-2" />
                        Search LinkedIn
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* RESULTS TAB */}
        <TabsContent value="results" className="space-y-4">
          {isLoadingResults ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                <p className="text-muted-foreground mt-3">Loading results...</p>
              </CardContent>
            </Card>
          ) : results.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Search className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-muted-foreground mt-3">No results yet. Run a search first.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Results Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedResults.size === results.length && results.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                  <span className="text-sm text-muted-foreground">
                    {selectedResults.size > 0 ? `${selectedResults.size} selected` : `${results.length} results`}
                  </span>
                </div>
                {selectedResults.size > 0 && (
                  <Button onClick={() => setExportDialogOpen(true)} size="sm">
                    <UserPlus className="h-4 w-4 mr-1" />
                    Export to CRM
                  </Button>
                )}
              </div>

              {/* Results Cards */}
              <div className="space-y-3">
                {results.map((result: SearchResult) => (
                  <Card key={result.id} className={`transition-all ${result.status === "dismissed" ? "opacity-50" : ""}`}>
                    <CardContent className="py-4">
                      <div className="flex gap-4">
                        {/* Checkbox */}
                        <div className="pt-1">
                          <Checkbox
                            checked={selectedResults.has(result.id)}
                            onCheckedChange={() => toggleResult(result.id)}
                          />
                        </div>

                        {/* Main Content */}
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <a
                                  href={result.profileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-semibold text-base hover:underline flex items-center gap-1"
                                >
                                  {result.name}
                                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                </a>
                                <Badge className={getScoreColor(result.relevanceScore)}>
                                  {result.relevanceScore}% match
                                </Badge>
                                <Badge className={getStatusBadge(result.status)}>
                                  {result.status.replace(/_/g, " ")}
                                </Badge>
                              </div>
                              {result.headline && (
                                <p className="text-sm text-muted-foreground mt-0.5">{result.headline}</p>
                              )}
                            </div>
                          </div>

                          {/* Meta info */}
                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                            {result.jobTitle && (
                              <span className="flex items-center gap-1">
                                <Briefcase className="h-3 w-3" />
                                {result.jobTitle}
                              </span>
                            )}
                            {result.company && (
                              <span className="flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                {result.company}
                              </span>
                            )}
                            {result.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {result.location}
                              </span>
                            )}
                            {result.enrichedData?.estimatedSeniority && (
                              <span className="flex items-center gap-1">
                                <Star className="h-3 w-3" />
                                {result.enrichedData.estimatedSeniority}
                              </span>
                            )}
                          </div>

                          {/* Skills */}
                          {result.enrichedData?.keySkills && result.enrichedData.keySkills.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {result.enrichedData.keySkills.map((skill, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {skill}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {/* AI Assessment */}
                          {result.enrichedData?.potentialFit && (
                            <p className="text-sm bg-muted/50 p-2 rounded-md">
                              {result.enrichedData.potentialFit}
                            </p>
                          )}

                          {/* Suggested Outreach */}
                          {result.enrichedData?.suggestedOutreach && (
                            <div className="bg-primary/5 border border-primary/10 p-3 rounded-md">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium text-primary flex items-center gap-1">
                                  <Send className="h-3 w-3" />
                                  Suggested Outreach
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-xs"
                                  onClick={() => handleCopyOutreach(result.enrichedData!.suggestedOutreach!, result.id)}
                                >
                                  {copiedOutreach === result.id ? (
                                    <><Check className="h-3 w-3 mr-1" /> Copied</>
                                  ) : (
                                    <><Copy className="h-3 w-3 mr-1" /> Copy</>
                                  )}
                                </Button>
                              </div>
                              <p className="text-sm italic text-muted-foreground">
                                "{result.enrichedData.suggestedOutreach}"
                              </p>
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div className="flex gap-2 pt-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSave(result.id)}
                              disabled={result.status === "saved"}
                            >
                              <Star className="h-3 w-3 mr-1" />
                              Save
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedResults(new Set([result.id]));
                                setExportDialogOpen(true);
                              }}
                              disabled={result.status === "exported_to_crm" || result.status === "already_in_crm"}
                            >
                              <UserPlus className="h-3 w-3 mr-1" />
                              Add to CRM
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground"
                              onClick={() => handleDismiss(result.id)}
                            >
                              Dismiss
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* HISTORY TAB */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Search History</CardTitle>
              <CardDescription>Your past LinkedIn searches</CardDescription>
            </CardHeader>
            <CardContent>
              {!pastSearches || pastSearches.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No search history yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>Keywords</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Results</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pastSearches.map((search) => (
                      <TableRow key={search.id}>
                        <TableCell className="text-sm">
                          {new Date(search.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {search.purpose.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate">
                          {search.keywords}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {search.location || search.country || "-"}
                        </TableCell>
                        <TableCell>{search.resultCount}</TableCell>
                        <TableCell>
                          <Badge className={
                            search.status === "completed" ? "bg-green-100 text-green-800" :
                            search.status === "processing" ? "bg-blue-100 text-blue-800" :
                            "bg-red-100 text-red-800"
                          }>
                            {search.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setActiveSearchId(search.id);
                              setActiveTab("results");
                            }}
                            disabled={search.status !== "completed"}
                          >
                            View
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
      </Tabs>

      {/* Export to CRM Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export to CRM</DialogTitle>
            <DialogDescription>
              Import {selectedResults.size} selected profile{selectedResults.size !== 1 ? "s" : ""} as CRM contacts
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Contact Type</Label>
              <Select value={exportContactType} onValueChange={setExportContactType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="prospect">Prospect</SelectItem>
                  <SelectItem value="investor">Investor</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={exportMutation.isPending}>
              {exportMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Import to CRM
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
