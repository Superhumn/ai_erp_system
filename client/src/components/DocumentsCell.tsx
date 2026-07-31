import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Upload, Download, File, FileSpreadsheet, FileImage, Loader2 } from "lucide-react";
import { toast } from "sonner";

const DOC_TYPES = [
  "contract",
  "invoice",
  "receipt",
  "freight",
  "customs",
  "bol",
  "packing_list",
  "certificate",
  "po",
  "other",
] as const;

const HR_DOC_TYPES = [
  "employment_agreement",
  "option_grant",
  "offer_letter",
  "nda",
  "ip_assignment",
  "termination",
  "other",
] as const;

type DocType = typeof DOC_TYPES[number];

function getFileIcon(mimeType?: string | null) {
  if (!mimeType) return <File className="h-3.5 w-3.5 text-muted-foreground" />;
  if (mimeType.includes("image")) return <FileImage className="h-3.5 w-3.5 text-blue-500" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv"))
    return <FileSpreadsheet className="h-3.5 w-3.5 text-green-500" />;
  if (mimeType.includes("pdf")) return <FileText className="h-3.5 w-3.5 text-red-500" />;
  return <File className="h-3.5 w-3.5 text-muted-foreground" />;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface DocumentsCellProps {
  referenceType: string;
  referenceId: number;
  docTypeSet?: "default" | "hr";
  /**
   * Doc count supplied by the parent table (batch-loaded for all rows in one
   * query). Used for the closed-state badge so this cell doesn't fetch on mount.
   */
  count?: number;
}

export default function DocumentsCell({ referenceType, referenceId, docTypeSet = "default", count }: DocumentsCellProps) {
  const typeOptions = docTypeSet === "hr" ? HR_DOC_TYPES : DOC_TYPES;
  const [docType, setDocType] = useState<string>(typeOptions[0]);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  // Only fetch the full document list once the popover is opened — this avoids
  // one query per row on table mount. The closed badge uses the `count` prop.
  const { data: docs, isLoading } = trpc.documents.list.useQuery(
    { referenceType, referenceId },
    { enabled: open },
  );

  const uploadMutation = trpc.documents.upload.useMutation({
    onSuccess: () => {
      toast.success("Document uploaded");
      utils.documents.list.invalidate({ referenceType, referenceId });
      utils.documents.countsByReferences.invalidate();
      setUploading(false);
    },
    onError: (err) => {
      toast.error(err.message || "Upload failed");
      setUploading(false);
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMutation.mutate({
        name: file.name,
        type: docType as any,
        referenceType,
        referenceId,
        fileData: base64,
        mimeType: file.type || "application/octet-stream",
      });
    };
    reader.onerror = () => {
      toast.error("Failed to read file");
      setUploading(false);
    };
    reader.readAsDataURL(file);

    // Reset the input so the same file can be re-selected
    e.target.value = "";
  };

  const docCount = docs?.length ?? count ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors hover:bg-muted cursor-pointer border border-transparent hover:border-border"
        >
          <FileText className="h-3 w-3" />
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <span>{docCount} doc{docCount !== 1 ? "s" : ""}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <div className="space-y-3">
          <div className="text-sm font-medium">
            Documents ({docCount})
          </div>

          {/* Document list */}
          {isLoading ? (
            <div className="text-xs text-muted-foreground text-center py-3">
              Loading…
            </div>
          ) : docs && docs.length > 0 ? (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {docs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-2 text-xs py-1.5 px-2 rounded hover:bg-muted group"
                >
                  {getFileIcon(doc.mimeType)}
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{doc.name}</div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                        {doc.type}
                      </Badge>
                      <span>{formatDate(doc.createdAt)}</span>
                    </div>
                  </div>
                  {doc.fileUrl && (
                    <a
                      href={doc.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Download"
                    >
                      <Download className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-3">
              No documents attached
            </div>
          )}

          {/* Upload section */}
          <div className="border-t pt-2 space-y-2">
            <div className="flex items-center gap-2">
              <Select value={docType} onValueChange={(v) => setDocType(v)}>
                <SelectTrigger className="h-7 text-xs flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">
                      {t.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Upload className="h-3 w-3 mr-1" />
                )}
                Upload
              </Button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
