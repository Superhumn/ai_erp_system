import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  FileText,
  Upload,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Download,
  Sparkles,
  DollarSign,
  Calendar,
  MapPin,
} from "lucide-react";
import { Link, useParams } from "wouter";
import { Streamdown } from "streamdown";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
const documentTypes = [
  { value: 'commercial_invoice', label: 'Commercial Invoice' },
  { value: 'packing_list', label: 'Packing List' },
  { value: 'bill_of_lading', label: 'Bill of Lading' },
  { value: 'airway_bill', label: 'Airway Bill' },
  { value: 'certificate_of_origin', label: 'Certificate of Origin' },
  { value: 'customs_declaration', label: 'Customs Declaration' },
  { value: 'import_license', label: 'Import License' },
  { value: 'export_license', label: 'Export License' },
  { value: 'insurance_certificate', label: 'Insurance Certificate' },
  { value: 'inspection_certificate', label: 'Inspection Certificate' },
  { value: 'phytosanitary_certificate', label: 'Phytosanitary Certificate' },
  { value: 'fumigation_certificate', label: 'Fumigation Certificate' },
  { value: 'dangerous_goods_declaration', label: 'Dangerous Goods Declaration' },
  { value: 'other', label: 'Other' },
];

const statusColors: Record<string, string> = {
  pending: "secondary",
  uploaded: "outline",
  verified: "default",
  rejected: "destructive",
  expired: "destructive",
};

export default function CustomsDetail() {
  const { id } = useParams<{ id: string }>();
  const clearanceId = parseInt(id || "0");
  
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<string>("");
  const [docName, setDocName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const { data: summaryData, isLoading: summaryLoading } = trpc.customs.clearances.getSummary.useQuery({ id: clearanceId });
  const { data: documents, isLoading: docsLoading } = trpc.customs.documents.list.useQuery({ clearanceId });

  const uploadMutation = trpc.customs.documents.upload.useMutation({
    onSuccess: () => {
      toast.success("Document uploaded successfully");
      utils.customs.documents.list.invalidate({ clearanceId });
      utils.customs.clearances.getSummary.invalidate({ id: clearanceId });
      setUploadDialogOpen(false);
      resetUploadForm();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to upload document");
    },
  });

  const updateStatusMutation = trpc.customs.clearances.update.useMutation({
    onSuccess: () => {
      toast.success("Status updated");
      utils.customs.clearances.getSummary.invalidate({ id: clearanceId });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update status");
    },
  });

  const verifyDocMutation = trpc.customs.documents.update.useMutation({
    onSuccess: () => {
      toast.success("Document verified");
      utils.customs.documents.list.invalidate({ clearanceId });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to verify document");
    },
  });

  const resetUploadForm = () => {
    setSelectedDocType("");
    setDocName("");
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!docName) {
        setDocName(file.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !selectedDocType || !docName) {
      toast.error("Please fill in all fields");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMutation.mutate({
        clearanceId,
        documentType: selectedDocType as any,
        name: docName,
        fileData: base64,
        mimeType: selectedFile.type,
      });
    };
    reader.readAsDataURL(selectedFile);
  };

  if (summaryLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!summaryData?.clearance) {
    return (
      <div className="p-6">
        <p>Clearance not found</p>
        <Link href="/freight/customs">
          <Button variant="link">Back to Customs</Button>
        </Link>
      </div>
    );
  }

  const { clearance, documents: clearanceDocs, aiSummary } = summaryData;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/freight/customs">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{clearance.clearanceNumber}</h1>
              <Badge variant={clearance.type === 'import' ? 'default' : 'secondary'}>
                {clearance.type}
              </Badge>
              <Badge variant={statusColors[clearance.status] as any}>
                {clearance.status.replace(/_/g, ' ')}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {clearance.portOfEntry && `${clearance.portOfEntry}, `}{clearance.country || 'Unknown location'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setUploadDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload Document
          </Button>
          {clearance.status === 'pending_documents' && clearanceDocs && clearanceDocs.length > 0 && (
            <Button onClick={() => updateStatusMutation.mutate({ id: clearanceId, status: 'documents_submitted' })}>
              Submit for Review
            </Button>
          )}
        </div>
      </div>

      {/* AI Summary */}
      {aiSummary && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-600" />
              AI Status Summary
            </CardTitle>
            <AITriggerButton message="Analyze this customs case - verify documentation completeness and compliance" label="AI Analysis" />
          </div>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              <Streamdown>{aiSummary}</Streamdown>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Location
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Port of Entry</span>
              <span>{clearance.portOfEntry || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Country</span>
              <span>{clearance.country || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customs Office</span>
              <span>{clearance.customsOffice || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Country of Origin</span>
              <span>{clearance.countryOfOrigin || 'N/A'}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Classification
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">HS Code</span>
              <span>{clearance.hsCode || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Broker Reference</span>
              <span>{clearance.brokerReference || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Clearance Number</span>
              <span>{clearance.clearanceNumber || 'Pending'}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Duties & Taxes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Duty Amount</span>
              <span>{clearance.dutyAmount ? `$${clearance.dutyAmount}` : 'TBD'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax Amount</span>
              <span>{clearance.taxAmount ? `$${clearance.taxAmount}` : 'TBD'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Other Fees</span>
              <span>{clearance.otherFees ? `$${clearance.otherFees}` : 'TBD'}</span>
            </div>
            <div className="flex justify-between font-medium border-t pt-2">
              <span>Total</span>
              <span>{clearance.totalAmount ? `$${clearance.totalAmount}` : 'TBD'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-8">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Created</p>
              <p className="font-medium">{new Date(clearance.createdAt).toLocaleDateString()}</p>
            </div>
            {clearance.submissionDate && (
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Submitted</p>
                <p className="font-medium">{new Date(clearance.submissionDate).toLocaleDateString()}</p>
              </div>
            )}
            {clearance.expectedClearanceDate && (
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Expected Clearance</p>
                <p className="font-medium">{new Date(clearance.expectedClearanceDate).toLocaleDateString()}</p>
              </div>
            )}
            {clearance.actualClearanceDate && (
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Cleared</p>
                <p className="font-medium text-green-600">{new Date(clearance.actualClearanceDate).toLocaleDateString()}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader>
          <CardTitle>Required Documents</CardTitle>
          <CardDescription>Upload and manage customs documents</CardDescription>
        </CardHeader>
        <CardContent>
          {docsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : documents && documents.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <Badge variant="outline">
                        {documentTypes.find(t => t.value === doc.documentType)?.label || doc.documentType}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{doc.name}</TableCell>
                    <TableCell>
                      <Badge variant={statusColors[doc.status || 'pending'] as any} className="flex items-center gap-1 w-fit">
                        {doc.status === 'verified' && <CheckCircle className="h-3 w-3" />}
                        {doc.status === 'rejected' && <XCircle className="h-3 w-3" />}
                        {doc.status === 'pending' && <Clock className="h-3 w-3" />}
                        {doc.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {doc.fileUrl && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(doc.fileUrl!, '_blank')}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                        {doc.status === 'uploaded' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => verifyDocMutation.mutate({ id: doc.id, status: 'verified' })}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Verify
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No documents uploaded yet</p>
              <Button variant="link" onClick={() => setUploadDialogOpen(true)}>
                Upload your first document
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Upload a customs document for this clearance
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Document Type *</Label>
              <Select value={selectedDocType} onValueChange={setSelectedDocType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  {documentTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Document Name *</Label>
              <Input
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="e.g., Commercial Invoice - PO12345"
              />
            </div>
            <div className="space-y-2">
              <Label>File *</Label>
              <Input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || !selectedDocType || !docName || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
