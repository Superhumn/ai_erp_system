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
import { FileArchive, Plus, Search, Loader2, ExternalLink, Upload } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
type Document = {
  id: number;
  name: string;
  type: "contract" | "invoice" | "receipt" | "report" | "legal" | "hr" | "other";
  category: string | null;
  fileUrl: string;
  description: string | null;
  createdAt: Date;
};

export default function Documents() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    type: "legal" as "contract" | "invoice" | "receipt" | "report" | "legal" | "hr" | "other",
    description: "",
    file: null as File | null,
  });

  const { data: documents, isLoading, refetch } = trpc.documents.list.useQuery();
  const uploadDocument = trpc.documents.upload.useMutation({
    onSuccess: () => {
      toast.success("Document uploaded successfully");
      setIsOpen(false);
      setFormData({
        name: "", type: "legal", description: "", file: null,
      });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const filteredDocuments = documents?.filter((doc: Document) => {
    const matchesSearch =
      doc.name.toLowerCase().includes(search.toLowerCase()) ||
      doc.description?.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || doc.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const typeColors: Record<string, string> = {
    contract: "bg-blue-500/10 text-blue-600",
    invoice: "bg-green-500/10 text-green-600",
    receipt: "bg-purple-500/10 text-purple-600",
    report: "bg-amber-500/10 text-amber-600",
    legal: "bg-indigo-500/10 text-indigo-600",
    hr: "bg-pink-500/10 text-pink-600",
    other: "bg-gray-500/10 text-gray-600",
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.file) {
      toast.error("Please select a file");
      return;
    }
    
    // Convert file to base64
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadDocument.mutate({
        name: formData.name,
        type: formData.type,
        description: formData.description || undefined,
        fileData: base64,
        mimeType: formData.file!.type,
      });
    };
    reader.readAsDataURL(formData.file);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileArchive className="h-8 w-8" />
            Documents
          </h1>
          <p className="text-muted-foreground mt-1">
            Store and manage legal documents.
          </p>
        
          <AITriggerButton message="Analyze our legal documents - classify by type, identify compliance issues, and summarize key content" label="AI Document Analysis" /></div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Upload Document
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Upload Document</DialogTitle>
                <DialogDescription>
                  Upload a new document to the system.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Document name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value: any) => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="invoice">Invoice</SelectItem>
                      <SelectItem value="receipt">Receipt</SelectItem>
                      <SelectItem value="report">Report</SelectItem>
                      <SelectItem value="legal">Legal</SelectItem>
                      <SelectItem value="hr">HR</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="file">File *</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="file"
                      type="file"
                      onChange={(e) => setFormData({ ...formData, file: e.target.files?.[0] || null })}
                      className="flex-1"
                    />
                    {formData.file && (
                      <Badge variant="outline">
                        <Upload className="h-3 w-3 mr-1" />
                        {formData.file.name}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Document description..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={uploadDocument.isPending}>
                  {uploadDocument.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Upload Document
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="contract">Contract</SelectItem>
                <SelectItem value="invoice">Invoice</SelectItem>
                <SelectItem value="receipt">Receipt</SelectItem>
                <SelectItem value="report">Report</SelectItem>
                <SelectItem value="legal">Legal</SelectItem>
                <SelectItem value="hr">HR</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !filteredDocuments || filteredDocuments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileArchive className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No documents found</p>
              <p className="text-sm">Upload your first document to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.map((doc: Document) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.name}</TableCell>
                    <TableCell>
                      <Badge className={typeColors[doc.type]}>{doc.type}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{doc.description || "-"}</TableCell>
                    <TableCell>
                      {doc.createdAt
                        ? format(new Date(doc.createdAt), "MMM d, yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {doc.fileUrl && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
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
