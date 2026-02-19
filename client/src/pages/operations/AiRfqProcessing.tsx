import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Search,
  Loader2,
  FileText,
  Send,
  Brain,
  Mail,
  MessageSquare,
  RefreshCw,
  ArrowUpDown,
  Eye,
  CheckCircle,
  AlertTriangle,
  Clock,
  Inbox,
  Zap,
  TrendingUp,
  Package,
  Ship,
  HelpCircle,
} from "lucide-react";

const priorityColors: Record<string, string> = {
  urgent: "destructive",
  high: "default",
  medium: "secondary",
  low: "outline",
};

const typeLabels: Record<string, { label: string; color: string }> = {
  vendor_rfq: { label: "Vendor RFQ", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  freight_rfq: { label: "Freight RFQ", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  vendor_quote: { label: "Vendor Quote", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  freight_quote: { label: "Freight Quote", color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200" },
  rfq_question: { label: "Question", color: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200" },
  general_inquiry: { label: "Inquiry", color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200" },
};

const statusIcons: Record<string, typeof CheckCircle> = {
  new: Inbox,
  processed: CheckCircle,
  replied: Send,
  needs_review: AlertTriangle,
};

export default function AiRfqProcessing() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [processDialogOpen, setProcessDialogOpen] = useState(false);
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [replyToEmail, setReplyToEmail] = useState("");

  // Queries
  const { data: items, isLoading, refetch } = trpc.aiRfqProcessing.list.useQuery();
  const { data: stats } = trpc.aiRfqProcessing.stats.useQuery();

  // Mutations
  const processBatch = trpc.aiRfqProcessing.processBatch.useMutation({
    onSuccess: (data) => {
      toast.success(`Processed ${data.processed} emails`);
      refetch();
    },
    onError: (err) => toast.error(`Processing failed: ${err.message}`),
  });

  const processEmail = trpc.aiRfqProcessing.processEmail.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Email processed successfully");
        if (data.suggestedReply) {
          setReplySubject(data.suggestedReply.subject);
          setReplyBody(data.suggestedReply.body);
          setReplyToEmail(data.classification.matchedVendorId ? "" : "");
          setReplyDialogOpen(true);
        }
      } else {
        toast.error(`Processing failed: ${data.error}`);
      }
      refetch();
    },
    onError: (err) => toast.error(`Processing failed: ${err.message}`),
  });

  const generateReply = trpc.aiRfqProcessing.generateReply.useMutation({
    onSuccess: (data) => {
      setReplySubject(data.reply.subject);
      setReplyBody(data.reply.body);
      toast.success(`Reply generated (confidence: ${data.reply.confidence}%)`);
    },
    onError: (err) => toast.error(`Reply generation failed: ${err.message}`),
  });

  const sendReply = trpc.aiRfqProcessing.sendReply.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Reply sent successfully");
        setReplyDialogOpen(false);
        refetch();
      } else {
        toast.error(`Send failed: ${data.error}`);
      }
    },
    onError: (err) => toast.error(`Send failed: ${err.message}`),
  });

  // Filter items
  const filteredItems = (items || []).filter((item: any) => {
    const matchesSearch =
      !search ||
      item.subject?.toLowerCase().includes(search.toLowerCase()) ||
      item.fromEmail?.toLowerCase().includes(search.toLowerCase()) ||
      item.summary?.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || item.rfqType === typeFilter;
    const matchesPriority = priorityFilter === "all" || item.priority === priorityFilter;
    return matchesSearch && matchesType && matchesPriority;
  });

  const handleProcessItem = (item: any) => {
    if (item.emailId) {
      processEmail.mutate({ emailId: item.emailId });
    }
  };

  const handleGenerateReply = (item: any) => {
    if (item.emailId) {
      setSelectedItem(item);
      setReplyToEmail(item.fromEmail || "");
      generateReply.mutate({ emailId: item.emailId });
      setReplyDialogOpen(true);
    }
  };

  const handleSendReply = () => {
    if (!replyToEmail || !replySubject || !replyBody) {
      toast.error("Please fill in all reply fields");
      return;
    }
    sendReply.mutate({
      toEmail: replyToEmail,
      subject: replySubject,
      body: replyBody,
      rfqType: selectedItem?.rfqType || "general_inquiry",
      relatedRfqId: selectedItem?.id,
    });
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6" />
            AI RFQ Processing
          </h1>
          <p className="text-muted-foreground mt-1">
            AI reads incoming RFQs and quotes, sorts them by priority, and drafts replies to questions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => processBatch.mutate({ limit: 10 })}
            disabled={processBatch.isPending}
          >
            {processBatch.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-1" />
            )}
            Process New Emails
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-amber-500" />
              <span className="text-sm text-muted-foreground">Vendor RFQs</span>
            </div>
            <div className="text-2xl font-bold mt-1">{stats?.activeVendorRfqs ?? 0}</div>
            <p className="text-xs text-muted-foreground">of {stats?.totalVendorRfqs ?? 0} total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Ship className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Freight RFQs</span>
            </div>
            <div className="text-2xl font-bold mt-1">{stats?.activeFreightRfqs ?? 0}</div>
            <p className="text-xs text-muted-foreground">of {stats?.totalFreightRfqs ?? 0} total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Pending Quotes</span>
            </div>
            <div className="text-2xl font-bold mt-1">
              {(stats?.pendingVendorQuotes ?? 0) + (stats?.pendingFreightQuotes ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">awaiting review</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-purple-500" />
              <span className="text-sm text-muted-foreground">Unprocessed</span>
            </div>
            <div className="text-2xl font-bold mt-1">{stats?.unprocessedEmails ?? 0}</div>
            <p className="text-xs text-muted-foreground">emails in queue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <span className="text-sm text-muted-foreground">Needs Review</span>
            </div>
            <div className="text-2xl font-bold mt-1">{stats?.needsReview ?? 0}</div>
            <p className="text-xs text-muted-foreground">quotes received</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search RFQs, quotes, vendors..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="vendor_rfq">Vendor RFQs</SelectItem>
                <SelectItem value="vendor_quote">Vendor Quotes</SelectItem>
                <SelectItem value="freight_rfq">Freight RFQs</SelectItem>
                <SelectItem value="freight_quote">Freight Quotes</SelectItem>
                <SelectItem value="rfq_question">Questions</SelectItem>
                <SelectItem value="general_inquiry">Inquiries</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Main Table */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">
            All Items ({filteredItems.length})
          </TabsTrigger>
          <TabsTrigger value="needs_action">
            Needs Action ({filteredItems.filter((i: any) => i.status === "new" || i.status === "needs_review").length})
          </TabsTrigger>
          <TabsTrigger value="questions">
            Questions ({filteredItems.filter((i: any) => i.hasQuestions || i.rfqType === "rfq_question").length})
          </TabsTrigger>
          <TabsTrigger value="processed">
            Processed ({filteredItems.filter((i: any) => i.status === "processed" || i.status === "replied").length})
          </TabsTrigger>
        </TabsList>

        {["all", "needs_action", "questions", "processed"].map((tab) => (
          <TabsContent key={tab} value={tab}>
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-muted-foreground">Loading RFQ data...</span>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">Priority</TableHead>
                        <TableHead className="w-[130px]">Type</TableHead>
                        <TableHead>Subject / RFQ</TableHead>
                        <TableHead>From</TableHead>
                        <TableHead>Summary</TableHead>
                        <TableHead className="w-[90px]">Status</TableHead>
                        <TableHead className="w-[100px]">Date</TableHead>
                        <TableHead className="w-[140px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getFilteredForTab(filteredItems, tab).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            No items found
                          </TableCell>
                        </TableRow>
                      ) : (
                        getFilteredForTab(filteredItems, tab).map((item: any, idx: number) => {
                          const typeInfo = typeLabels[item.rfqType] || typeLabels.general_inquiry;
                          const StatusIcon = statusIcons[item.status] || Clock;
                          return (
                            <TableRow key={`${item.rfqType}-${item.id}-${idx}`}>
                              <TableCell>
                                <Badge variant={priorityColors[item.priority] as any || "secondary"}>
                                  {item.priority}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${typeInfo.color}`}>
                                  {typeInfo.label}
                                </span>
                              </TableCell>
                              <TableCell>
                                <div className="font-medium text-sm truncate max-w-[250px]">
                                  {item.subject}
                                </div>
                                {item.matchedRfqNumber && (
                                  <span className="text-xs text-muted-foreground">{item.matchedRfqNumber}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="text-sm truncate max-w-[150px]">
                                  {item.fromName || item.fromEmail || "-"}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm text-muted-foreground truncate max-w-[250px]">
                                  {item.summary}
                                </div>
                                {item.hasQuestions && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <HelpCircle className="h-3 w-3 text-rose-500" />
                                    <span className="text-xs text-rose-600">{item.questionCount} question(s)</span>
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <StatusIcon className="h-3.5 w-3.5" />
                                  <span className="text-xs capitalize">{item.status?.replace("_", " ")}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="text-xs text-muted-foreground">
                                  {item.receivedAt ? new Date(item.receivedAt).toLocaleDateString() : "-"}
                                </span>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  {item.emailId > 0 && item.status === "new" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleProcessItem(item)}
                                      disabled={processEmail.isPending}
                                      title="Process with AI"
                                    >
                                      {processEmail.isPending ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Brain className="h-3.5 w-3.5" />
                                      )}
                                    </Button>
                                  )}
                                  {item.emailId > 0 && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleGenerateReply(item)}
                                      disabled={generateReply.isPending}
                                      title="Generate AI Reply"
                                    >
                                      <MessageSquare className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedItem(item);
                                      setProcessDialogOpen(true);
                                    }}
                                    title="View Details"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Detail Dialog */}
      <Dialog open={processDialogOpen} onOpenChange={setProcessDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>RFQ Item Details</DialogTitle>
            <DialogDescription>
              {selectedItem?.rfqType && (typeLabels[selectedItem.rfqType]?.label || selectedItem.rfqType)}
            </DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-3 text-sm">
              <div>
                <span className="font-medium">Subject:</span> {selectedItem.subject}
              </div>
              <div>
                <span className="font-medium">From:</span> {selectedItem.fromEmail || "System"}
              </div>
              <div>
                <span className="font-medium">Priority:</span>{" "}
                <Badge variant={priorityColors[selectedItem.priority] as any}>{selectedItem.priority}</Badge>
              </div>
              <div>
                <span className="font-medium">Status:</span> {selectedItem.status}
              </div>
              <div>
                <span className="font-medium">Summary:</span>
                <p className="text-muted-foreground mt-1">{selectedItem.summary}</p>
              </div>
              {selectedItem.matchedRfqNumber && (
                <div>
                  <span className="font-medium">RFQ Number:</span> {selectedItem.matchedRfqNumber}
                </div>
              )}
              {selectedItem.hasQuestions && (
                <div>
                  <span className="font-medium text-rose-600">Questions Detected:</span> {selectedItem.questionCount}
                </div>
              )}
              <div>
                <span className="font-medium">Confidence:</span> {selectedItem.confidence}%
              </div>
              <div>
                <span className="font-medium">Received:</span>{" "}
                {selectedItem.receivedAt ? new Date(selectedItem.receivedAt).toLocaleString() : "-"}
              </div>
            </div>
          )}
          <DialogFooter>
            {selectedItem?.emailId > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  setProcessDialogOpen(false);
                  handleGenerateReply(selectedItem);
                }}
              >
                <MessageSquare className="h-4 w-4 mr-1" />
                Generate Reply
              </Button>
            )}
            <Button variant="secondary" onClick={() => setProcessDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reply Dialog */}
      <Dialog open={replyDialogOpen} onOpenChange={setReplyDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              AI-Generated Reply
            </DialogTitle>
            <DialogDescription>
              Review and edit the AI-generated reply before sending
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">To</label>
              <Input
                value={replyToEmail}
                onChange={(e) => setReplyToEmail(e.target.value)}
                placeholder="recipient@example.com"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Subject</label>
              <Input
                value={replySubject}
                onChange={(e) => setReplySubject(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Message</label>
              <Textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
            </div>
            {generateReply.isPending && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating reply with AI...
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendReply}
              disabled={sendReply.isPending || !replyToEmail || !replyBody}
            >
              {sendReply.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-1" />
              )}
              Send Reply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getFilteredForTab(items: any[], tab: string): any[] {
  switch (tab) {
    case "needs_action":
      return items.filter((i) => i.status === "new" || i.status === "needs_review");
    case "questions":
      return items.filter((i) => i.hasQuestions || i.rfqType === "rfq_question");
    case "processed":
      return items.filter((i) => i.status === "processed" || i.status === "replied");
    default:
      return items;
  }
}
