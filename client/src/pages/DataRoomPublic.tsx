import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  FolderOpen, FileText, File, Download, Eye, Lock,
  ChevronRight, ChevronDown, Folder, ArrowLeft, Shield,
  X, ChevronLeft, Image, FileSpreadsheet, Presentation, Loader2,
} from "lucide-react";
import { useParams } from "wouter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface DocumentItem {
  id: number;
  name: string;
  description: string | null;
  fileType: string;
  mimeType: string | null;
  fileSize: number | null;
  pageCount: number | null;
  storageUrl: string | null;
  googleDriveWebViewLink: string | null;
  thumbnailUrl: string | null;
  folderId: number | null;
  sortOrder: number;
  version: number;
  [key: string]: unknown;
}

interface FolderItem {
  id: number;
  name: string;
  description: string | null;
  parentId: number | null;
  sortOrder: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileType: string) {
  switch (fileType) {
    case "pdf":
      return <FileText className="h-5 w-5 text-red-400" />;
    case "doc":
    case "docx":
      return <FileText className="h-5 w-5 text-blue-400" />;
    case "xls":
    case "xlsx":
    case "csv":
      return <FileSpreadsheet className="h-5 w-5 text-emerald-400" />;
    case "ppt":
    case "pptx":
      return <Presentation className="h-5 w-5 text-orange-400" />;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
    case "webp":
      return <Image className="h-5 w-5 text-purple-400" />;
    default:
      return <File className="h-5 w-5 text-muted-foreground" />;
  }
}

function getFileColorClass(fileType: string): string {
  switch (fileType) {
    case "pdf": return "bg-red-500/10 border-red-500/20";
    case "doc": case "docx": return "bg-blue-500/10 border-blue-500/20";
    case "xls": case "xlsx": case "csv": return "bg-emerald-500/10 border-emerald-500/20";
    case "ppt": case "pptx": return "bg-orange-500/10 border-orange-500/20";
    case "png": case "jpg": case "jpeg": case "gif": case "svg": case "webp":
      return "bg-purple-500/10 border-purple-500/20";
    default: return "bg-muted border-border";
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function DataRoomPublic() {
  const params = useParams<{ code: string }>();
  const linkCode = params.code || "";

  // Access gate state
  const [accessGranted, setAccessGranted] = useState(false);
  const [password, setPassword] = useState("");
  const [visitorInfo, setVisitorInfo] = useState({ email: "", name: "", company: "" });
  const [ndaAccepted, setNdaAccepted] = useState(false);
  const [dataRoomId, setDataRoomId] = useState<number | null>(null);
  const [visitorId, setVisitorId] = useState<number | null>(null);
  const [permissions, setPermissions] = useState({ allowDownload: true, allowPrint: true });
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [requiredFields, setRequiredFields] = useState<string[]>([]);

  // Document browser state
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
  const [selectedDocument, setSelectedDocument] = useState<DocumentItem | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  // Document viewer state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageDirection, setPageDirection] = useState<"left" | "right">("right");
  const [pageKey, setPageKey] = useState(0);

  // Invest form state
  const [investFormOpen, setInvestFormOpen] = useState(false);
  const [investSubmitted, setInvestSubmitted] = useState(false);
  const [investForm, setInvestForm] = useState({
    investorName: "",
    investorEmail: "",
    investorCompany: "",
    investorTitle: "",
    investmentAmount: "",
    instrumentType: "safe" as "equity" | "safe" | "convertible_note" | "warrant",
    valuationCap: "",
    notes: "",
  });

  // ---------------------------------------------------------------------------
  // tRPC
  // ---------------------------------------------------------------------------
  const accessMutation = trpc.dataRoom.public.accessByLink.useMutation({
    onSuccess: (data) => {
      if (data.requiresPassword) {
        setRequiresPassword(true);
        return;
      }
      if (data.requiresInfo) {
        setRequiredFields(data.requiredFields || []);
        return;
      }
      if (data.dataRoomId) {
        setDataRoomId(data.dataRoomId);
        setVisitorId(data.visitorId);
        setPermissions({
          allowDownload: data.allowDownload ?? true,
          allowPrint: data.allowPrint ?? true,
        });
        setAccessGranted(true);
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const { data: content, isLoading: contentLoading } = trpc.dataRoom.public.getContent.useQuery(
    {
      dataRoomId: dataRoomId!,
      visitorId: visitorId || undefined,
      visitorEmail: visitorInfo.email || undefined,
      folderId: currentFolderId,
    },
    { enabled: accessGranted && !!dataRoomId },
  );

  const recordViewMutation = trpc.dataRoom.public.recordView.useMutation();

  const investMutation = trpc.dataRoom.submitInvestment.useMutation({
    onSuccess: () => {
      setInvestSubmitted(true);
      toast.success("Investment interest submitted successfully!");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to submit investment interest");
    },
  });

  const handleInvestSubmit = () => {
    if (!dataRoomId) return;
    investMutation.mutate({
      dataRoomId,
      investorName: investForm.investorName,
      investorEmail: investForm.investorEmail,
      investorCompany: investForm.investorCompany || undefined,
      investorTitle: investForm.investorTitle || undefined,
      investmentAmount: investForm.investmentAmount,
      instrumentType: investForm.instrumentType,
      valuationCap: investForm.valuationCap || undefined,
      notes: investForm.notes || undefined,
    });
  };

  // Initial access attempt
  useEffect(() => {
    if (linkCode) {
      accessMutation.mutate({ linkCode });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkCode]);

  const handleAccessSubmit = () => {
    accessMutation.mutate({
      linkCode,
      password: password || undefined,
      visitorInfo: {
        email: visitorInfo.email || undefined,
        name: visitorInfo.name || undefined,
        company: visitorInfo.company || undefined,
      },
    });
  };

  // ---------------------------------------------------------------------------
  // Document Viewer Logic
  // ---------------------------------------------------------------------------
  const openDocument = useCallback(
    (doc: DocumentItem) => {
      setSelectedDocument(doc);
      setCurrentPage(1);
      setPageKey((k) => k + 1);
      if (visitorId) {
        recordViewMutation.mutate({ documentId: doc.id, visitorId });
      }
    },
    [visitorId, recordViewMutation],
  );

  const closeDocument = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setSelectedDocument(null);
      setIsClosing(false);
    }, 250);
  }, []);

  const goToPage = useCallback((page: number, direction: "left" | "right") => {
    setPageDirection(direction);
    setCurrentPage(page);
    setPageKey((k) => k + 1);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!selectedDocument) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeDocument();
      }
      if (e.key === "ArrowRight" && selectedDocument.pageCount && currentPage < selectedDocument.pageCount) {
        goToPage(currentPage + 1, "left");
      }
      if (e.key === "ArrowLeft" && currentPage > 1) {
        goToPage(currentPage - 1, "right");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedDocument, currentPage, closeDocument, goToPage]);

  // ---------------------------------------------------------------------------
  // Folder toggle
  // ---------------------------------------------------------------------------
  const toggleFolder = (folderId: number) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
    setCurrentFolderId(folderId);
  };

  // ---------------------------------------------------------------------------
  // Brand color helper
  // ---------------------------------------------------------------------------
  const brandColor = content?.room.brandingColor || content?.room.brandColor || undefined;

  // ---------------------------------------------------------------------------
  // RENDER: Access Gate
  // ---------------------------------------------------------------------------
  if (!accessGranted) {
    const showGateForm = requiresPassword || requiredFields.length > 0;
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
        style={{ background: "linear-gradient(145deg, #0a0c14 0%, #111827 50%, #0f172a 100%)" }}>
        {/* Subtle radial accent */}
        <div className="absolute inset-0 pointer-events-none"
          style={{
            background: brandColor
              ? `radial-gradient(ellipse 60% 50% at 50% 40%, ${brandColor}12 0%, transparent 70%)`
              : "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(99,102,241,0.06) 0%, transparent 70%)",
          }}
        />

        <div className="w-full max-w-md relative z-10 dr-fade-in">
          {/* Brand / Logo */}
          <div className="text-center mb-8">
            <div
              className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-5 border"
              style={{
                background: brandColor ? `${brandColor}18` : "rgba(99,102,241,0.1)",
                borderColor: brandColor ? `${brandColor}30` : "rgba(99,102,241,0.2)",
              }}
            >
              <Shield className="h-7 w-7" style={{ color: brandColor || "#818cf8" }} />
            </div>
            <h1 className="text-2xl font-semibold text-white tracking-tight">Secure Data Room</h1>
            <p className="text-sm text-gray-400 mt-2">
              {requiresPassword
                ? "Enter the password to access this data room"
                : requiredFields.length > 0
                  ? "Please provide your information to continue"
                  : "Verifying access..."}
            </p>
          </div>

          {/* Gate Form */}
          {showGateForm && (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm p-6 space-y-5 dr-fade-in">
              {requiresPassword && (
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-gray-300 text-sm">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-gray-500 rounded-xl h-11 focus:border-white/20"
                    onKeyDown={(e) => e.key === "Enter" && handleAccessSubmit()}
                  />
                </div>
              )}

              {requiredFields.includes("email") && (
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-gray-300 text-sm">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={visitorInfo.email}
                    onChange={(e) => setVisitorInfo({ ...visitorInfo, email: e.target.value })}
                    placeholder="you@company.com"
                    className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-gray-500 rounded-xl h-11 focus:border-white/20"
                    onKeyDown={(e) => e.key === "Enter" && handleAccessSubmit()}
                  />
                </div>
              )}

              {requiredFields.includes("name") && (
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-gray-300 text-sm">Name</Label>
                  <Input
                    id="name"
                    value={visitorInfo.name}
                    onChange={(e) => setVisitorInfo({ ...visitorInfo, name: e.target.value })}
                    placeholder="Your name"
                    className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-gray-500 rounded-xl h-11 focus:border-white/20"
                    onKeyDown={(e) => e.key === "Enter" && handleAccessSubmit()}
                  />
                </div>
              )}

              {requiredFields.includes("company") && (
                <div className="space-y-2">
                  <Label htmlFor="company" className="text-gray-300 text-sm">Company</Label>
                  <Input
                    id="company"
                    value={visitorInfo.company}
                    onChange={(e) => setVisitorInfo({ ...visitorInfo, company: e.target.value })}
                    placeholder="Your company"
                    className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-gray-500 rounded-xl h-11 focus:border-white/20"
                    onKeyDown={(e) => e.key === "Enter" && handleAccessSubmit()}
                  />
                </div>
              )}

              <Button
                className="w-full h-11 rounded-xl font-medium text-sm"
                style={brandColor ? { background: brandColor, color: "#fff" } : undefined}
                onClick={handleAccessSubmit}
                disabled={accessMutation.isPending}
              >
                {accessMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Access Documents"
                )}
              </Button>
            </div>
          )}

          {/* Loading state */}
          {!showGateForm && accessMutation.isPending && (
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: brandColor || "#818cf8" }} />
              <span className="text-sm">Verifying access...</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: NDA Gate
  // ---------------------------------------------------------------------------
  if (content?.room.requiresNda && !ndaAccepted) {
    return (
      <NdaSigningGate
        dataRoomId={dataRoomId!}
        visitorId={visitorId}
        visitorEmail={visitorInfo.email}
        visitorName={visitorInfo.name}
        visitorCompany={visitorInfo.company}
        ndaText={content.room.ndaText}
        onSigned={() => setNdaAccepted(true)}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: Document Viewer Overlay
  // ---------------------------------------------------------------------------
  const renderViewer = () => {
    if (!selectedDocument) return null;
    const doc = selectedDocument;
    const totalPages = doc.pageCount || 1;
    const isImage = ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(doc.fileType);
    const progressPct = totalPages > 1 ? (currentPage / totalPages) * 100 : 100;

    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-black/80 backdrop-blur-sm">
        {/* Viewer panel */}
        <div
          className={`flex flex-col flex-1 bg-[#0c0e16] ${isClosing ? "dr-slide-out" : "dr-slide-in"}`}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-white/[0.06] bg-[#0c0e16]/90 backdrop-blur-sm">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border ${getFileColorClass(doc.fileType)}`}>
                {getFileIcon(doc.fileType)}
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-medium text-white truncate">{doc.name}</h2>
                {totalPages > 1 && (
                  <p className="text-xs text-gray-500">
                    Page {currentPage} of {totalPages}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {permissions.allowDownload && (doc.storageUrl || doc.googleDriveWebViewLink) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-400 hover:text-white h-8 px-3 rounded-lg"
                  onClick={() => {
                    if (visitorId) {
                      recordViewMutation.mutate({ documentId: doc.id, visitorId, downloaded: true });
                    }
                    window.open(doc.storageUrl || doc.googleDriveWebViewLink || '', "_blank");
                  }}
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  <span className="hidden sm:inline text-xs">Download</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-white h-8 w-8 p-0 rounded-lg"
                onClick={closeDocument}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Document content */}
          <div className="flex-1 relative overflow-hidden">
            {/* Watermark overlay inside viewer */}
            {content?.watermark && (
              <div
                className="absolute inset-0 pointer-events-none z-10 overflow-hidden"
                style={{ opacity: content.watermark.opacity }}
              >
                {content.watermark.position === "tiled" && content.watermark.tiledPositions ? (
                  content.watermark.tiledPositions.slice(0, 50).map((pos, i) => (
                    <div
                      key={i}
                      className="absolute whitespace-nowrap"
                      style={{
                        left: `${pos.x}px`,
                        top: `${pos.y}px`,
                        transform: `rotate(${content.watermark!.rotation}deg)`,
                        fontSize: `${content.watermark!.fontSize}px`,
                        color: content.watermark!.color,
                        fontFamily: "Arial, sans-serif",
                        userSelect: "none",
                      }}
                    >
                      {content.watermark!.text}
                    </div>
                  ))
                ) : (
                  <div
                    className="absolute top-1/2 left-1/2 whitespace-nowrap"
                    style={{
                      transform: `translate(-50%, -50%) rotate(${content.watermark!.rotation}deg)`,
                      fontSize: `${content.watermark!.fontSize * 3}px`,
                      color: content.watermark!.color,
                      fontFamily: "Arial, sans-serif",
                      userSelect: "none",
                    }}
                  >
                    {content.watermark!.text}
                  </div>
                )}
              </div>
            )}

            <div
              key={pageKey}
              className={`w-full h-full ${pageDirection === "left" ? "dr-page-left" : "dr-page-right"}`}
            >
              {isImage && (doc.storageUrl || doc.googleDriveWebViewLink) ? (
                <div className="flex items-center justify-center h-full p-6">
                  <img
                    src={doc.storageUrl || doc.googleDriveWebViewLink || ''}
                    alt={doc.name}
                    className="max-w-full max-h-full object-contain rounded-lg"
                  />
                </div>
              ) : (doc.storageUrl || doc.googleDriveWebViewLink) ? (
                <iframe
                  src={doc.storageUrl || doc.googleDriveWebViewLink || ''}
                  className="w-full h-full border-0"
                  title={doc.name}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <File className="h-16 w-16 mb-4 text-gray-600" />
                  <p className="text-sm">Preview not available</p>
                </div>
              )}
            </div>

            {/* Page navigation arrows */}
            {totalPages > 1 && (
              <>
                <button
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white/70 hover:text-white transition-all disabled:opacity-30 disabled:cursor-default"
                  onClick={() => goToPage(currentPage - 1, "right")}
                  disabled={currentPage <= 1}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white/70 hover:text-white transition-all disabled:opacity-30 disabled:cursor-default"
                  onClick={() => goToPage(currentPage + 1, "left")}
                  disabled={currentPage >= totalPages}
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-white/[0.04]">
            <div
              className="h-full transition-all duration-300 ease-out rounded-r-full"
              style={{
                width: `${progressPct}%`,
                background: brandColor || "#818cf8",
              }}
            />
          </div>
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // RENDER: Main Data Room Browser
  // ---------------------------------------------------------------------------
  const folders = (content?.folders || []) as FolderItem[];
  const documents = (content?.documents || []) as DocumentItem[];

  return (
    <div className="min-h-screen flex flex-col relative"
      style={{ background: "linear-gradient(180deg, #080a12 0%, #0d1017 100%)" }}>

      {/* Watermark Overlay */}
      {content?.watermark && (
        <div
          className="fixed inset-0 pointer-events-none z-50 overflow-hidden"
          style={{ opacity: content.watermark.opacity }}
        >
          {content.watermark.position === "tiled" && content.watermark.tiledPositions ? (
            content.watermark.tiledPositions.slice(0, 50).map((pos, i) => (
              <div
                key={i}
                className="absolute whitespace-nowrap"
                style={{
                  left: `${pos.x}px`,
                  top: `${pos.y}px`,
                  transform: `rotate(${content.watermark!.rotation}deg)`,
                  fontSize: `${content.watermark!.fontSize}px`,
                  color: content.watermark!.color,
                  fontFamily: "Arial, sans-serif",
                  userSelect: "none",
                }}
              >
                {content.watermark!.text}
              </div>
            ))
          ) : (
            <div
              className="absolute top-1/2 left-1/2 whitespace-nowrap"
              style={{
                transform: `translate(-50%, -50%) rotate(${content.watermark!.rotation}deg)`,
                fontSize: `${content.watermark!.fontSize * 3}px`,
                color: content.watermark!.color,
                fontFamily: "Arial, sans-serif",
                userSelect: "none",
              }}
            >
              {content.watermark!.text}
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <header className="border-b border-white/[0.06] dr-fade-in">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {(content?.room.brandingLogo || content?.room.logoUrl) && (
                <img
                  src={content.room.brandingLogo || content.room.logoUrl!}
                  alt="Logo"
                  className="h-8 w-auto"
                />
              )}
              <div>
                {content?.room.brandingCompanyName && (
                  <p
                    className="text-[10px] font-semibold uppercase tracking-[0.15em] mb-0.5"
                    style={{ color: brandColor || "#818cf8" }}
                  >
                    {content.room.brandingCompanyName}
                  </p>
                )}
                <h1 className="text-lg font-semibold text-white tracking-tight">
                  {content?.room.name}
                </h1>
                {content?.room.description && (
                  <p className="text-sm text-gray-500 mt-0.5">{content.room.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {!permissions.allowDownload && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Lock className="h-3.5 w-3.5" />
                  View only
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Brand accent line */}
        <div className="h-[1px]" style={{ background: brandColor ? `linear-gradient(90deg, transparent, ${brandColor}40, transparent)` : undefined }} />
      </header>

      {/* Welcome message */}
      {content?.room.welcomeMessage && (
        <div className="border-b border-white/[0.04] dr-fade-in">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <p className="text-sm text-gray-400">{content.room.welcomeMessage}</p>
          </div>
        </div>
      )}

      {/* Main layout */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 gap-6">
        {/* Sidebar - folder tree */}
        {folders.length > 0 && (
          <aside className="w-full lg:w-64 flex-shrink-0 dr-fade-in">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-500 px-2 mb-2">
                Folders
              </p>
              <nav className="space-y-0.5">
                {/* Root level button */}
                <button
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                    currentFolderId === null
                      ? "bg-white/[0.06] text-white"
                      : "text-gray-400 hover:text-white hover:bg-white/[0.04]"
                  }`}
                  onClick={() => setCurrentFolderId(null)}
                >
                  <FolderOpen className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">All Documents</span>
                </button>

                {folders.map((folder) => {
                  const isExpanded = expandedFolders.has(folder.id);
                  const isActive = currentFolderId === folder.id;
                  return (
                    <div key={folder.id}>
                      <button
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                          isActive
                            ? "bg-white/[0.06] text-white"
                            : "text-gray-400 hover:text-white hover:bg-white/[0.04]"
                        }`}
                        onClick={() => toggleFolder(folder.id)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-gray-500" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-500" />
                        )}
                        <Folder className="h-4 w-4 flex-shrink-0" style={{ color: brandColor || "#818cf8" }} />
                        <span className="truncate">{folder.name}</span>
                      </button>
                      {isExpanded && (
                        <div className="dr-expand ml-5 pl-3 border-l border-white/[0.06] mt-0.5 mb-1">
                          {folder.description && (
                            <p className="text-xs text-gray-600 px-2 py-1">{folder.description}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>
            </div>
          </aside>
        )}

        {/* Document grid */}
        <main className="flex-1 min-w-0">
          {/* Breadcrumb */}
          {currentFolderId !== null && (
            <div className="mb-4 dr-fade-in">
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-white rounded-lg h-8 px-3 -ml-3"
                onClick={() => setCurrentFolderId(null)}
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                Back to all documents
              </Button>
            </div>
          )}

          {contentLoading ? (
            <div className="flex flex-col items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin mb-3" style={{ color: brandColor || "#818cf8" }} />
              <p className="text-sm text-gray-500">Loading documents...</p>
            </div>
          ) : (
            <div className="space-y-6 dr-fade-in">
              {/* Folder cards (if no sidebar, or on mobile) */}
              {folders.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {folders.map((folder) => (
                    <button
                      key={`folder-${folder.id}`}
                      className="flex items-center gap-3 p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-all dr-hover-lift text-left"
                      onClick={() => setCurrentFolderId(folder.id)}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{
                          background: brandColor ? `${brandColor}15` : "rgba(99,102,241,0.08)",
                        }}
                      >
                        <Folder className="h-5 w-5" style={{ color: brandColor || "#818cf8" }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{folder.name}</p>
                        {folder.description && (
                          <p className="text-xs text-gray-500 truncate">{folder.description}</p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-600 flex-shrink-0 ml-auto" />
                    </button>
                  ))}
                </div>
              )}

              {/* Documents */}
              {documents.length > 0 ? (
                <div className="space-y-2">
                  {documents.map((doc, idx) => (
                    <div
                      key={`doc-${doc.id}`}
                      className="group flex items-center gap-4 p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-all dr-hover-lift cursor-pointer"
                      style={{ animationDelay: `${idx * 40}ms`, animationFillMode: "backwards" }}
                      onClick={() => openDocument(doc)}
                    >
                      {/* File type icon */}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${getFileColorClass(doc.fileType)}`}>
                        {getFileIcon(doc.fileType)}
                      </div>

                      {/* File info */}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white truncate group-hover:text-white/90">
                          {doc.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-500 uppercase">{doc.fileType}</span>
                          {doc.fileSize ? (
                            <>
                              <span className="text-gray-700">&#183;</span>
                              <span className="text-xs text-gray-500">{formatFileSize(doc.fileSize)}</span>
                            </>
                          ) : null}
                          {doc.pageCount ? (
                            <>
                              <span className="text-gray-700">&#183;</span>
                              <span className="text-xs text-gray-500">{doc.pageCount} pages</span>
                            </>
                          ) : null}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-3 rounded-lg text-gray-400 hover:text-white text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDocument(doc);
                          }}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          View
                        </Button>
                        {permissions.allowDownload && (doc.storageUrl || doc.googleDriveWebViewLink) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-3 rounded-lg text-gray-400 hover:text-white text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (visitorId) {
                                recordViewMutation.mutate({
                                  documentId: doc.id,
                                  visitorId,
                                  downloaded: true,
                                });
                              }
                              window.open(doc.storageUrl || doc.googleDriveWebViewLink || '', "_blank");
                            }}
                          >
                            <Download className="h-3.5 w-3.5 mr-1" />
                            Download
                          </Button>
                        )}
                      </div>

                      {/* Mobile view arrow */}
                      <ChevronRight className="h-4 w-4 text-gray-600 flex-shrink-0 sm:hidden" />
                    </div>
                  ))}
                </div>
              ) : !folders.length ? (
                <div className="flex flex-col items-center justify-center py-24">
                  <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center mb-4">
                    <FolderOpen className="h-8 w-8 text-gray-600" />
                  </div>
                  <h3 className="text-sm font-medium text-gray-400">No documents available</h3>
                  <p className="text-xs text-gray-600 mt-1">
                    This folder is empty or you don&apos;t have access to its contents.
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </main>
      </div>

      {/* Floating Invest Button */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={() => setInvestFormOpen(true)}
          className="group flex items-center gap-2.5 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:scale-105 hover:shadow-indigo-500/40 active:scale-95"
          style={{
            background: `linear-gradient(135deg, ${brandColor || "#6366f1"}, ${brandColor ? brandColor + "cc" : "#818cf8"})`,
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Interested in Investing?
        </button>
      </div>

      {/* Invest Form Overlay */}
      {investFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { if (!investMutation.isPending) setInvestFormOpen(false); }}
          />
          {/* Panel */}
          <div
            className="relative w-full max-w-lg mx-4 rounded-2xl border border-white/[0.08] bg-[#0d1017] shadow-2xl overflow-y-auto max-h-[90vh]"
            style={{ animation: "fadeIn 0.2s ease-out" }}
          >
            {/* Close */}
            <button
              onClick={() => { if (!investMutation.isPending) setInvestFormOpen(false); }}
              className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {investSubmitted ? (
              /* Success state */
              <div className="p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-white mb-2">Thank You!</h2>
                <p className="text-gray-400 mb-6">
                  We have received your indication of interest for ${Number(investForm.investmentAmount || 0).toLocaleString()}.
                  Our team will be in touch shortly with next steps.
                </p>
                <button
                  onClick={() => { setInvestFormOpen(false); setInvestSubmitted(false); }}
                  className="rounded-xl px-6 py-2.5 text-sm font-medium text-white transition-colors"
                  style={{ background: brandColor || "#6366f1" }}
                >
                  Close
                </button>
              </div>
            ) : (
              /* Form */
              <div className="p-6">
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-white">Express Investment Interest</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Submit your details and our team will follow up with next steps.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Name & Email */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-gray-400 mb-1.5 block">Full Name *</Label>
                      <Input
                        className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-gray-600 rounded-xl h-10"
                        placeholder="John Smith"
                        value={investForm.investorName}
                        onChange={(e) => setInvestForm(f => ({ ...f, investorName: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400 mb-1.5 block">Email *</Label>
                      <Input
                        type="email"
                        className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-gray-600 rounded-xl h-10"
                        placeholder="john@firm.com"
                        value={investForm.investorEmail}
                        onChange={(e) => setInvestForm(f => ({ ...f, investorEmail: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Company & Title */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-gray-400 mb-1.5 block">Company / Fund</Label>
                      <Input
                        className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-gray-600 rounded-xl h-10"
                        placeholder="Acme Ventures"
                        value={investForm.investorCompany}
                        onChange={(e) => setInvestForm(f => ({ ...f, investorCompany: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400 mb-1.5 block">Title</Label>
                      <Input
                        className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-gray-600 rounded-xl h-10"
                        placeholder="Managing Partner"
                        value={investForm.investorTitle}
                        onChange={(e) => setInvestForm(f => ({ ...f, investorTitle: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Investment Amount */}
                  <div>
                    <Label className="text-xs text-gray-400 mb-1.5 block">Investment Amount (USD) *</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                      <Input
                        type="number"
                        className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-gray-600 rounded-xl h-10 pl-7"
                        placeholder="100,000"
                        value={investForm.investmentAmount}
                        onChange={(e) => setInvestForm(f => ({ ...f, investmentAmount: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Instrument Type */}
                  <div>
                    <Label className="text-xs text-gray-400 mb-1.5 block">Instrument Type</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(["safe", "equity", "convertible_note", "warrant"] as const).map((type) => {
                        const labels: Record<string, string> = { safe: "SAFE", equity: "Equity", convertible_note: "Conv. Note", warrant: "Warrant" };
                        const isActive = investForm.instrumentType === type;
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setInvestForm(f => ({ ...f, instrumentType: type }))}
                            className={`rounded-xl px-3 py-2 text-xs font-medium transition-all border ${
                              isActive
                                ? "text-white border-indigo-500/50 bg-indigo-500/10"
                                : "text-gray-400 border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]"
                            }`}
                            style={isActive ? { borderColor: (brandColor || "#6366f1") + "80", background: (brandColor || "#6366f1") + "1a" } : undefined}
                          >
                            {labels[type]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Valuation Cap (for SAFE/Convertible Note) */}
                  {(investForm.instrumentType === "safe" || investForm.instrumentType === "convertible_note") && (
                    <div>
                      <Label className="text-xs text-gray-400 mb-1.5 block">Valuation Cap (USD)</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                        <Input
                          type="number"
                          className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-gray-600 rounded-xl h-10 pl-7"
                          placeholder="10,000,000"
                          value={investForm.valuationCap}
                          onChange={(e) => setInvestForm(f => ({ ...f, valuationCap: e.target.value }))}
                        />
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  <div>
                    <Label className="text-xs text-gray-400 mb-1.5 block">Notes / Questions</Label>
                    <textarea
                      className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-gray-600 text-sm p-3 min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/30"
                      placeholder="Any additional information or questions..."
                      value={investForm.notes}
                      onChange={(e) => setInvestForm(f => ({ ...f, notes: e.target.value }))}
                    />
                  </div>

                  {/* Submit */}
                  <button
                    onClick={handleInvestSubmit}
                    disabled={
                      !investForm.investorName ||
                      !investForm.investorEmail ||
                      !investForm.investmentAmount ||
                      investMutation.isPending
                    }
                    className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.98]"
                    style={{ background: brandColor || "#6366f1" }}
                  >
                    {investMutation.isPending ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Submitting...
                      </span>
                    ) : (
                      "Submit Interest"
                    )}
                  </button>

                  <p className="text-[11px] text-gray-600 text-center">
                    By submitting, you agree to be contacted regarding this investment opportunity.
                    This is a non-binding indication of interest.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-white/[0.04] mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-center">
          <p className="text-xs text-gray-600">Powered by Superhumn Data Room</p>
        </div>
      </footer>

      {/* Document viewer overlay */}
      {renderViewer()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NDA Signing Gate Component (preserved from original)
// ---------------------------------------------------------------------------
function NdaSigningGate({
  dataRoomId,
  visitorId,
  visitorEmail,
  visitorName,
  visitorCompany,
  ndaText,
  onSigned,
}: {
  dataRoomId: number;
  visitorId: number | null;
  visitorEmail: string;
  visitorName: string;
  visitorCompany: string;
  ndaText: string | null;
  onSigned: () => void;
}) {
  const [step, setStep] = useState<"view" | "sign">("view");
  const [signerName, setSignerName] = useState(visitorName);
  const [signerEmail, setSignerEmail] = useState(visitorEmail);
  const [signerTitle, setSignerTitle] = useState("");
  const [signerCompany, setSignerCompany] = useState(visitorCompany);
  const [signatureType, setSignatureType] = useState<"typed" | "drawn">("typed");
  const [typedSignature, setTypedSignature] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const { data: activeNda } = trpc.nda.documents.getActive.useQuery({ dataRoomId });
  const { data: existingSignature } = trpc.nda.signatures.checkSigned.useQuery(
    { dataRoomId, email: signerEmail },
    { enabled: !!signerEmail },
  );

  const signMutation = trpc.nda.signatures.sign.useMutation({
    onSuccess: () => {
      toast.success("NDA signed successfully");
      onSigned();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Check if already signed
  useEffect(() => {
    if (existingSignature?.signed) {
      onSigned();
    }
  }, [existingSignature, onSigned]);

  // Canvas drawing handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleSign = async () => {
    if (!activeNda) {
      toast.error("No NDA document found");
      return;
    }
    let signatureData = "";
    if (signatureType === "typed") {
      signatureData = typedSignature;
    } else {
      const canvas = canvasRef.current;
      if (canvas) {
        signatureData = canvas.toDataURL("image/png");
      }
    }
    if (!signatureData) {
      toast.error("Please provide your signature");
      return;
    }
    signMutation.mutate({
      ndaDocumentId: activeNda.id,
      dataRoomId,
      visitorId: visitorId || undefined,
      signerName,
      signerEmail,
      signerTitle: signerTitle || undefined,
      signerCompany: signerCompany || undefined,
      signatureType,
      signatureData,
      consentCheckbox: consentChecked,
    });
  };

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
      }
    }
  }, [signatureType]);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(145deg, #0a0c14 0%, #111827 50%, #0f172a 100%)" }}
    >
      <Card className="w-full max-w-2xl rounded-2xl border-white/[0.06] bg-white/[0.03] dr-fade-in">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <CardTitle className="text-white">Non-Disclosure Agreement</CardTitle>
          </div>
          <CardDescription className="text-gray-400">
            {step === "view"
              ? "Please review the NDA before signing"
              : "Complete your signature to proceed"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "view" ? (
            <>
              {activeNda ? (
                <div className="border border-white/[0.06] rounded-xl overflow-hidden">
                  <div className="bg-white/[0.03] p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-red-400" />
                      <span className="font-medium text-white text-sm">{activeNda.name}</span>
                      <span className="text-xs text-gray-500">v{activeNda.version}</span>
                    </div>
                    <Button variant="outline" size="sm" className="rounded-lg" asChild>
                      <a href={activeNda.storageUrl} target="_blank" rel="noopener noreferrer">
                        <Eye className="h-4 w-4 mr-2" />
                        View Full Document
                      </a>
                    </Button>
                  </div>
                  <iframe
                    src={activeNda.storageUrl}
                    className="w-full h-96 border-0"
                    title="NDA Document"
                  />
                </div>
              ) : (
                <ScrollArea className="h-64 border border-white/[0.06] rounded-xl p-4">
                  <div className="prose prose-sm prose-invert">
                    {ndaText || (
                      <p>
                        By accessing this data room, you agree to keep all information
                        contained herein strictly confidential. You may not share, copy,
                        or distribute any documents or information without prior written
                        consent from the data room owner.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              )}
              <Button className="w-full h-11 rounded-xl" onClick={() => setStep("sign")}>
                Proceed to Sign
              </Button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-gray-300 text-sm">Full Name *</Label>
                  <Input
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="John Smith"
                    className="bg-white/[0.04] border-white/[0.08] text-white rounded-xl h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300 text-sm">Email *</Label>
                  <Input
                    type="email"
                    value={signerEmail}
                    onChange={(e) => setSignerEmail(e.target.value)}
                    placeholder="john@company.com"
                    className="bg-white/[0.04] border-white/[0.08] text-white rounded-xl h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300 text-sm">Title</Label>
                  <Input
                    value={signerTitle}
                    onChange={(e) => setSignerTitle(e.target.value)}
                    placeholder="CEO"
                    className="bg-white/[0.04] border-white/[0.08] text-white rounded-xl h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300 text-sm">Company</Label>
                  <Input
                    value={signerCompany}
                    onChange={(e) => setSignerCompany(e.target.value)}
                    placeholder="Acme Inc."
                    className="bg-white/[0.04] border-white/[0.08] text-white rounded-xl h-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300 text-sm">Signature Method</Label>
                <div className="flex gap-2">
                  <Button
                    variant={signatureType === "typed" ? "default" : "outline"}
                    size="sm"
                    className="rounded-lg"
                    onClick={() => setSignatureType("typed")}
                  >
                    Type Signature
                  </Button>
                  <Button
                    variant={signatureType === "drawn" ? "default" : "outline"}
                    size="sm"
                    className="rounded-lg"
                    onClick={() => setSignatureType("drawn")}
                  >
                    Draw Signature
                  </Button>
                </div>
              </div>

              {signatureType === "typed" ? (
                <div className="space-y-2">
                  <Label className="text-gray-300 text-sm">Type your full legal name as signature</Label>
                  <Input
                    value={typedSignature}
                    onChange={(e) => setTypedSignature(e.target.value)}
                    placeholder="John Smith"
                    className="font-signature text-2xl h-16 bg-white/[0.04] border-white/[0.08] text-white rounded-xl"
                    style={{ fontFamily: "cursive" }}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-gray-300 text-sm">Draw your signature</Label>
                    <Button variant="ghost" size="sm" onClick={clearCanvas} className="text-gray-400">
                      Clear
                    </Button>
                  </div>
                  <div className="border border-white/[0.08] rounded-xl bg-white overflow-hidden">
                    <canvas
                      ref={canvasRef}
                      width={500}
                      height={150}
                      className="w-full cursor-crosshair"
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-start space-x-2 pt-4 border-t border-white/[0.06]">
                <Checkbox
                  id="consent"
                  checked={consentChecked}
                  onCheckedChange={(checked) => setConsentChecked(checked as boolean)}
                />
                <Label htmlFor="consent" className="text-sm leading-relaxed text-gray-400">
                  I have read and understood the Non-Disclosure Agreement. By signing below,
                  I agree to be legally bound by its terms and conditions. I understand that
                  this electronic signature has the same legal effect as a handwritten signature.
                </Label>
              </div>

              <div className="flex gap-2 pt-4">
                <Button variant="outline" className="rounded-xl" onClick={() => setStep("view")}>
                  Back
                </Button>
                <Button
                  className="flex-1 rounded-xl h-11"
                  onClick={handleSign}
                  disabled={
                    !signerName ||
                    !signerEmail ||
                    !consentChecked ||
                    (signatureType === "typed" && !typedSignature) ||
                    signMutation.isPending
                  }
                >
                  {signMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Signing...
                    </>
                  ) : (
                    "Sign & Continue"
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
