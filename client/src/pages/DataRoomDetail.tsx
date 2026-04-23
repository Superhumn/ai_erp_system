import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Plus, FolderOpen, Link2, Users, Settings,
  Eye, Download, Clock, Trash2, Copy, ExternalLink,
  FileText, Lock, Upload, File, Folder,
  ChevronRight, ArrowLeft, MoreVertical, Mail, Send, Cloud,
  HardDrive, RefreshCw, Shield, Activity,
  AlertCircle, CheckCircle2, XCircle, ClipboardList,
  CheckSquare, Square, AlertTriangle, ChevronDown, Wand2
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// Helper: return the Google Drive embedded preview URL for a file
function getGooglePreviewUrl(fileId: string) {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

// Helper: open or download a file URL, handling data: URLs properly
function openFileUrl(url: string, filename?: string) {
  if (url.startsWith('data:')) {
    // Convert data URL to blob for proper download/viewing
    const [header, base64] = url.split(',');
    const mime = header.match(/data:(.*?);/)?.[1] || 'application/octet-stream';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const blobUrl = URL.createObjectURL(blob);
    if (filename) {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } else {
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    }
  } else {
    window.open(url, '_blank');
  }
}

export default function DataRoomDetail() {
  const params = useParams<{ id: string }>();
  const roomId = parseInt(params.id || "0");
  const [, setLocation] = useLocation();
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [folderStack, setFolderStack] = useState<Array<{ id: number; name: string }>>([]);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [createLinkOpen, setCreateLinkOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newLink, setNewLink] = useState({
    name: "",
    password: "",
    expiresAt: "",
    requireEmail: true,
    requireName: false,
    requireCompany: false,
    allowDownload: true,
  });
  const [newInvite, setNewInvite] = useState({
    email: "",
    name: "",
    message: "",
  });
  const [googleDriveSyncOpen, setGoogleDriveSyncOpen] = useState(false);
  const [selectedDriveFolderId, setSelectedDriveFolderId] = useState("");
  const [driveSyncTab, setDriveSyncTab] = useState<"folder" | "file">("folder");
  const [driveFileBrowseFolderId, setDriveFileBrowseFolderId] = useState("");
  const [driveFileBrowseInput, setDriveFileBrowseInput] = useState("");
  const [selectedDriveFileId, setSelectedDriveFileId] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<{
    id?: number;
    name?: string;
    fileType?: string;
    fileSize?: number | null;
    mimeType?: string | null;
    storageUrl?: string | null;
    storageType?: string | null;
    googleDriveFileId?: string | null;
    googleDriveWebViewLink?: string | null;
    [key: string]: unknown;
  } | null>(null);
  const [docVisible, setDocVisible] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: room, isLoading: roomLoading, refetch: refetchRoom } = trpc.dataRoom.getById.useQuery({ id: roomId });
  const { data: folders, refetch: refetchFolders } = trpc.dataRoom.folders.list.useQuery({ dataRoomId: roomId, parentId: currentFolderId });
  const { data: documents, refetch: refetchDocuments } = trpc.dataRoom.documents.list.useQuery({ dataRoomId: roomId, folderId: currentFolderId });
  const { data: links, refetch: refetchLinks } = trpc.dataRoom.links.list.useQuery({ dataRoomId: roomId });
  const { data: visitors } = trpc.dataRoom.visitors.list.useQuery({ dataRoomId: roomId });
  const { data: analytics } = trpc.dataRoom.analytics.getOverview.useQuery({ dataRoomId: roomId });

  const createFolderMutation = trpc.dataRoom.folders.create.useMutation({
    onSuccess: () => {
      toast.success("Folder created");
      setCreateFolderOpen(false);
      setNewFolderName("");
      refetchFolders();
    },
  });

  const uploadMutation = trpc.dataRoom.documents.upload.useMutation({
    onSuccess: () => {
      toast.success("File uploaded");
      refetchDocuments();
    },
    onError: (error) => {
      toast.error(error.message);
    },
    onSettled: () => {
      // Reset the file input so the same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
  });

  const createLinkMutation = trpc.dataRoom.links.create.useMutation({
    onSuccess: (data) => {
      toast.success("Share link created");
      setCreateLinkOpen(false);
      navigator.clipboard.writeText(`${window.location.origin}/share/${data.linkCode}`);
      toast.info("Link copied to clipboard");
      refetchLinks();
    },
  });

  const deleteLinkMutation = trpc.dataRoom.links.delete.useMutation({
    onSuccess: () => {
      toast.success("Link deleted");
      refetchLinks();
    },
  });

  const createInviteMutation = trpc.dataRoom.invitations.create.useMutation({
    onSuccess: () => {
      toast.success("Invitation sent");
      setInviteOpen(false);
      setNewInvite({ email: "", name: "", message: "" });
    },
  });

  const deleteDocMutation = trpc.dataRoom.documents.delete.useMutation({
    onSuccess: (_, variables) => {
      toast.success("Document deleted");
      if (variables && selectedDoc?.id === variables.id) setSelectedDoc(null);
      refetchDocuments();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteFolderMutation = trpc.dataRoom.folders.delete.useMutation({
    onSuccess: () => {
      toast.success("Folder deleted");
      refetchFolders();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleDeleteAll = async () => {
    setIsDeletingAll(true);
    try {
      await Promise.all([
        ...(documents || []).map((doc) => deleteDocMutation.mutateAsync({ id: doc.id })),
        ...(folders || []).map((folder) => deleteFolderMutation.mutateAsync({ id: folder.id })),
      ]);
      setSelectedDoc(null);
      toast.success("All files and folders deleted");
      setDeleteAllOpen(false);
      refetchDocuments();
      refetchFolders();
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete some files");
    } finally {
      setIsDeletingAll(false);
    }
  };

  const utils = trpc.useUtils();

  const ownerPreviewMutation = trpc.dataRoom.links.getOrCreateOwnerPreviewLink.useMutation({
    onSuccess: (data) => {
      window.open(`/share/${data.linkCode}`, '_blank');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to open preview');
    },
  });

  const blockVisitorMutation = trpc.dataRoom.visitors.block.useMutation({
    onSuccess: () => {
      toast.success("Visitor blocked");
      utils.dataRoom.visitors.list.invalidate({ dataRoomId: roomId });
    },
  });

  const unblockVisitorMutation = trpc.dataRoom.visitors.unblock.useMutation({
    onSuccess: () => {
      toast.success("Visitor unblocked");
      utils.dataRoom.visitors.list.invalidate({ dataRoomId: roomId });
    },
  });

  const revokeVisitorMutation = trpc.dataRoom.visitors.revoke.useMutation({
    onSuccess: () => {
      toast.success("Visitor access revoked");
      utils.dataRoom.visitors.list.invalidate({ dataRoomId: roomId });
    },
  });

  const restoreVisitorMutation = trpc.dataRoom.visitors.restore.useMutation({
    onSuccess: () => {
      toast.success("Visitor access restored");
      utils.dataRoom.visitors.list.invalidate({ dataRoomId: roomId });
    },
  });

  const syncGoogleDriveMutation = trpc.dataRoom.googleDrive.syncFolder.useMutation({
    onSuccess: (data) => {
      toast.success(`Synced ${data.foldersCreated} new folders and ${data.filesCreated} new files from Google Drive`);
      setGoogleDriveSyncOpen(false);
      setSelectedDriveFolderId("");
      refetchFolders();
      refetchDocuments();
      refetchRoom();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const { data: driveFilesData, isLoading: driveFilesLoading } = trpc.dataRoom.googleDrive.listFiles.useQuery(
    { folderId: driveFileBrowseFolderId },
    { enabled: !!driveFileBrowseFolderId }
  );

  const syncDriveFileMutation = trpc.dataRoom.googleDrive.syncFile.useMutation({
    onSuccess: (data) => {
      toast.success(`Imported "${data.fileName}" from Google Drive`);
      setGoogleDriveSyncOpen(false);
      setSelectedDriveFileId("");
      setDriveFileBrowseFolderId("");
      setDriveFileBrowseInput("");
      refetchDocuments();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const syncFromDriveMutation = trpc.dataRoom.syncFromDrive.useMutation({
    onSuccess: (data) => {
      toast.success(`Synced ${data.filesCreated} files and ${data.foldersCreated} folders from Google Drive${data.folderName ? ` (${data.folderName})` : ''}`);
      refetchFolders();
      refetchDocuments();
      refetchRoom();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Investment pipeline
  const { data: commitments, refetch: refetchCommitments } = trpc.dataRoom.listCommitments.useQuery({ dataRoomId: roomId });
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [selectedCommitment, setSelectedCommitment] = useState<any>(null);
  const [finalizeForm, setFinalizeForm] = useState({ shareClassId: "", shares: "", pricePerShare: "" });

  const updateStatusMutation = trpc.dataRoom.updateCommitmentStatus.useMutation({
    onSuccess: () => {
      toast.success("Status updated");
      refetchCommitments();
    },
  });

  const finalizeMutation = trpc.dataRoom.finalizeInvestment.useMutation({
    onSuccess: () => {
      toast.success("Investment finalized and added to cap table!");
      setFinalizeOpen(false);
      setSelectedCommitment(null);
      setFinalizeForm({ shareClassId: "", shares: "", pricePerShare: "" });
      refetchCommitments();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Animate the viewer panel each time a new document is selected
  useEffect(() => {
    if (!selectedDoc) { setDocVisible(false); return; }
    setDocVisible(false);
    const t = setTimeout(() => setDocVisible(true), 40);
    return () => clearTimeout(t);
  }, [selectedDoc?.id]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      const fileType = file.name.split(".").pop()?.toLowerCase() || "unknown";
      
      uploadMutation.mutate({
        dataRoomId: roomId,
        folderId: currentFolderId,
        name: file.name,
        fileType,
        mimeType: file.type,
        fileSize: file.size,
        base64Content: base64,
      });
    };
    reader.readAsDataURL(file);
  };

  const copyLinkUrl = (linkCode: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/share/${linkCode}`);
    toast.success("Link copied to clipboard");
  };

  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case "pdf":
        return <FileText className="h-5 w-5 text-red-500" />;
      case "doc":
      case "docx":
        return <FileText className="h-5 w-5 text-blue-500" />;
      case "xls":
      case "xlsx":
        return <FileText className="h-5 w-5 text-green-500" />;
      case "ppt":
      case "pptx":
        return <FileText className="h-5 w-5 text-orange-500" />;
      default:
        return <File className="h-5 w-5 text-gray-500" />;
    }
  };

  if (roomLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading...</div>
        </div>
    );
  }

  if (!room) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-64">
          <h2 className="text-xl font-semibold">Data Room Not Found</h2>
          <Button variant="link" onClick={() => setLocation("/datarooms")}>
            Back to Data Rooms
          </Button>
        </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/datarooms")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-[-0.02em]">{room.name}</h1>
            <p className="text-muted-foreground">/dataroom/{room.slug}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              const firstLink = links?.[0];
              if (firstLink) {
                copyLinkUrl(firstLink.linkCode);
              } else {
                toast.error("No share link exists yet. Create one first.");
              }
            }}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy Link
          </Button>
          <Button
            variant="outline"
            onClick={() => ownerPreviewMutation.mutate({ dataRoomId: roomId })}
            disabled={ownerPreviewMutation.isPending}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            {ownerPreviewMutation.isPending ? 'Opening...' : 'Preview as Investor'}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (room.googleDriveFolderId) {
                syncFromDriveMutation.mutate({ dataRoomId: roomId, driveFolderId: room.googleDriveFolderId });
              } else {
                setGoogleDriveSyncOpen(true);
              }
            }}
            disabled={syncFromDriveMutation.isPending}
          >
            {syncFromDriveMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <HardDrive className="h-4 w-4 mr-2" />
                Sync from Google Drive
              </>
            )}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                Visitors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-semibold tracking-[-0.02em]">{analytics?.totalVisitors || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Document Views
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-semibold tracking-[-0.02em]">{analytics?.totalDocumentViews || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Share Links
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-semibold tracking-[-0.02em]">{links?.length || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Time Spent
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-semibold tracking-[-0.02em]">
                {Math.round((analytics?.totalTimeSpent || 0) / 60)}m
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="documents">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="documents">
              <FolderOpen className="h-4 w-4 mr-2" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="links">
              <Link2 className="h-4 w-4 mr-2" />
              Share Links
            </TabsTrigger>
            <TabsTrigger value="visitors">
              <Users className="h-4 w-4 mr-2" />
              Visitors
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <Activity className="h-4 w-4 mr-2" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="checklist">
              <ClipboardList className="h-4 w-4 mr-2" />
              Checklist
            </TabsTrigger>
            {/* Drive Sync removed — use header button instead */}
            <TabsTrigger value="emailRules">
              <Shield className="h-4 w-4 mr-2" />
              Email Rules
            </TabsTrigger>
            <TabsTrigger value="nda">
              <FileText className="h-4 w-4 mr-2" />
              NDA
            </TabsTrigger>
            <TabsTrigger value="investments">
              <Activity className="h-4 w-4 mr-2" />
              Investments
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Documents Tab — Split-panel Investor Viewer */}
          <TabsContent value="documents" className="mt-4">
            <div
              className="flex rounded-xl border overflow-hidden bg-card shadow-sm"
              style={{ height: "calc(100vh - 330px)", minHeight: "540px" }}
            >
              {/* ── LEFT PANEL: Folder + file tree ── */}
              <div className="w-72 shrink-0 border-r flex flex-col bg-muted/20">
                {/* Panel header */}
                <div className="px-4 py-3 border-b flex items-center gap-2 shrink-0 bg-muted/30">
                  {currentFolderId ? (
                    <button
                      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => {
                        const prev = folderStack[folderStack.length - 2];
                        setFolderStack(folderStack.slice(0, -1));
                        setCurrentFolderId(prev ? prev.id : null);
                        setSelectedDoc(null);
                      }}
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      <span>Back</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Documents</span>
                    </div>
                  )}
                  <div className="ml-auto flex items-center gap-0.5">
                    {/* New Folder */}
                    <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
                      <DialogTrigger asChild>
                        <button
                          className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                          title="New folder"
                        >
                          <Folder className="h-3.5 w-3.5" />
                        </button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Create Folder</DialogTitle>
                        </DialogHeader>
                        <div className="py-4">
                          <Label>Folder Name</Label>
                          <Input
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            placeholder="Financial Documents"
                          />
                        </div>
                        <DialogFooter>
                          <Button
                            onClick={() => {
                              createFolderMutation.mutate({
                                dataRoomId: roomId,
                                parentId: currentFolderId,
                                name: newFolderName,
                              });
                            }}
                            disabled={!newFolderName || createFolderMutation.isPending}
                          >
                            Create
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    {/* Upload */}
                    <button
                      className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                      title="Upload file"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    {/* Delete All */}
                    {(!!folders?.length || !!documents?.length) && (
                      <button
                        className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-destructive"
                        title="Delete all files"
                        onClick={() => setDeleteAllOpen(true)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* File / folder list */}
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-0.5">
                    {/* Folders */}
                    {folders?.map((folder) => (
                      <div
                        key={`folder-${folder.id}`}
                        className="w-full flex items-center rounded-lg text-sm hover:bg-accent transition-colors group"
                      >
                        <button
                          className="flex items-center gap-2.5 flex-1 min-w-0 text-left px-3 py-2"
                          onClick={() => {
                            setFolderStack([...folderStack, { id: folder.id, name: folder.name }]);
                            setCurrentFolderId(folder.id);
                            setSelectedDoc(null);
                          }}
                        >
                          <Folder className="h-4 w-4 text-blue-500 shrink-0" />
                          <span className="flex-1 truncate">{folder.name}</span>
                          {folder.googleDriveFolderId && (
                            <Cloud className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                          )}
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="p-1.5 mr-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted-foreground/10 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                if (confirm(`Delete folder "${folder.name}" and all its contents?`)) {
                                  deleteFolderMutation.mutate({ id: folder.id });
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Folder
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}

                    {/* Documents */}
                    {documents?.map((doc) => {
                      const isSelected = selectedDoc?.id === doc.id;
                      return (
                        <div
                          key={`doc-${doc.id}`}
                          className={`w-full flex items-center rounded-lg text-sm transition-all duration-150 border-l-2 group ${
                            isSelected
                              ? "bg-primary/10 border-primary"
                              : "border-transparent hover:bg-accent"
                          }`}
                        >
                          <button
                            className="flex items-center gap-2.5 flex-1 min-w-0 text-left px-3 py-2"
                            onClick={() => setSelectedDoc(doc)}
                          >
                            <span className="shrink-0">{getFileIcon(doc.fileType)}</span>
                            <span className="flex-1 truncate">{doc.name}</span>
                            {doc.storageType === "google_drive" && (
                              <Cloud className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                            )}
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="p-1.5 mr-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted-foreground/10 shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {doc.storageUrl && (
                                <DropdownMenuItem
                                  onClick={() => openFileUrl(doc.storageUrl as string, doc.name)}
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Download
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => {
                                  if (confirm(`Delete "${doc.name}"?`)) {
                                    deleteDocMutation.mutate({ id: doc.id });
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      );
                    })}

                    {!folders?.length && !documents?.length && (
                      <div className="text-center py-10 text-muted-foreground">
                        <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        <p className="text-xs">No files yet</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* ── RIGHT PANEL: Document viewer ── */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {selectedDoc ? (
                  <>
                    {/* Viewer toolbar */}
                    <div className="px-5 py-3 border-b flex items-center gap-3 shrink-0 bg-muted/10">
                      <span className="shrink-0">{getFileIcon(selectedDoc.fileType)}</span>
                      <span className="text-sm font-medium truncate flex-1">{selectedDoc.name}</span>
                      {selectedDoc.fileSize && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {(selectedDoc.fileSize / 1024).toFixed(1)} KB
                        </span>
                      )}
                      {selectedDoc.storageType === "google_drive" && (
                        <Badge variant="outline" className="text-xs shrink-0">
                          <Cloud className="h-3 w-3 mr-1" />
                          Drive
                        </Badge>
                      )}
                      {selectedDoc.storageUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          title="Download"
                          onClick={() => openFileUrl(selectedDoc.storageUrl as string, selectedDoc.name)}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                        title="Delete file"
                        onClick={() => {
                          if (selectedDoc.id != null && confirm(`Delete "${selectedDoc.name}"?`)) {
                            deleteDocMutation.mutate({ id: selectedDoc.id });
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Viewer body — animated on selection */}
                    <div
                      className="flex-1 overflow-hidden"
                      style={{
                        opacity: docVisible ? 1 : 0,
                        transform: docVisible ? "translateX(0)" : "translateX(14px)",
                        transition: "opacity 0.35s ease, transform 0.35s ease",
                      }}
                    >
                      {(() => {
                        const ft = (selectedDoc.fileType || "").toLowerCase();
                        const isImg = ["png","jpg","jpeg","gif","webp","svg"].includes(ft);
                        const isOffice = ["doc","docx","xls","xlsx","ppt","pptx"].includes(ft);

                        if (selectedDoc.storageType === "google_drive") {
                          const drivePreviewUrl = selectedDoc.googleDriveFileId
                            ? getGooglePreviewUrl(selectedDoc.googleDriveFileId)
                            : selectedDoc.googleDriveWebViewLink ?? null;
                          if (drivePreviewUrl) {
                            return (
                              <iframe
                                key={selectedDoc.id}
                                src={drivePreviewUrl}
                                className="w-full h-full border-0"
                             sandbox="allow-same-origin allow-scripts allow-popups"
                                referrerPolicy="no-referrer"
                                allow="autoplay"
                                title={selectedDoc.name}
                              />
                            );
                          }
                        }

                        if (!selectedDoc.storageUrl) {
                          return (
                            <div className="flex-1 flex flex-col items-center justify-center gap-3 h-full text-muted-foreground">
                              <FileText className="h-14 w-14 opacity-20" />
                              <p className="text-sm font-medium">Preview not available</p>
                              <p className="text-xs opacity-70">No file URL found.</p>
                            </div>
                          );
                        }

                        // Images
                        if (isImg) {
                          return (
                            <div className="flex items-center justify-center h-full p-6">
                              <img
                                key={selectedDoc.id}
                                src={selectedDoc.storageUrl}
                                alt={selectedDoc.name}
                                className="max-w-full max-h-full object-contain rounded-lg"
                              />
                            </div>
                          );
                        }

                        // Office files: MS Office Online viewer
                        if (isOffice) {
                          return (
                            <iframe
                              key={selectedDoc.id}
                              src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(selectedDoc.storageUrl)}`}
                              className="w-full h-full border-0"
                              allow="autoplay"
                              title={selectedDoc.name}
                            />
                          );
                        }

                        // PDF, txt, html, csv — direct URL
                        return (
                          <iframe
                            key={selectedDoc.id}
                            src={selectedDoc.storageUrl}
                            className="w-full h-full border-0"
                            sandbox="allow-same-origin"
                            referrerPolicy="no-referrer"
                            title={selectedDoc.name}
                          />
                        );
                      })()}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
                    <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center">
                      <FileText className="h-8 w-8 opacity-25" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium">No document selected</p>
                      <p className="text-xs mt-1 opacity-70">Choose a file from the panel on the left to preview it here</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Share Links Tab */}
          <TabsContent value="links" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Share Links</CardTitle>
                    <CardDescription>Create unique links with custom access controls</CardDescription>
                  </div>
                  <Dialog open={createLinkOpen} onOpenChange={setCreateLinkOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Link
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create Share Link</DialogTitle>
                        <DialogDescription>
                          Generate a unique link with custom permissions
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Link Name (optional)</Label>
                          <Input
                            value={newLink.name}
                            onChange={(e) => setNewLink({ ...newLink, name: e.target.value })}
                            placeholder="Investor A"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Password (optional)</Label>
                          <Input
                            type="password"
                            value={newLink.password}
                            onChange={(e) => setNewLink({ ...newLink, password: e.target.value })}
                            placeholder="Leave empty for no password"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Link Expiration (optional)</Label>
                          <Input
                            type="datetime-local"
                            value={newLink.expiresAt}
                            onChange={(e) => setNewLink({ ...newLink, expiresAt: e.target.value })}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label>Require Email</Label>
                          <Switch
                            checked={newLink.requireEmail}
                            onCheckedChange={(checked) => setNewLink({ ...newLink, requireEmail: checked })}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label>Require Name</Label>
                          <Switch
                            checked={newLink.requireName}
                            onCheckedChange={(checked) => setNewLink({ ...newLink, requireName: checked })}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label>Require Company</Label>
                          <Switch
                            checked={newLink.requireCompany}
                            onCheckedChange={(checked) => setNewLink({ ...newLink, requireCompany: checked })}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label>Allow Downloads</Label>
                          <Switch
                            checked={newLink.allowDownload}
                            onCheckedChange={(checked) => setNewLink({ ...newLink, allowDownload: checked })}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          onClick={() => {
                            createLinkMutation.mutate({
                              dataRoomId: roomId,
                              name: newLink.name || undefined,
                              password: newLink.password || undefined,
                              expiresAt: newLink.expiresAt ? new Date(newLink.expiresAt) : undefined,
                              requireEmail: newLink.requireEmail,
                              requireName: newLink.requireName,
                              requireCompany: newLink.requireCompany,
                              allowDownload: newLink.allowDownload,
                            });
                          }}
                          disabled={createLinkMutation.isPending}
                        >
                          Create Link
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {!links?.length ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Link2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No share links yet</p>
                    <p className="text-sm">Create a link to share this data room</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Views</TableHead>
                        <TableHead>Security</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {links.filter((link) => link.name !== '__owner_preview__').map((link) => (
                        <TableRow key={link.id}>
                          <TableCell>
                            <div className="font-medium">{link.name || "Unnamed Link"}</div>
                            <div className="text-sm text-muted-foreground font-mono">
                              {link.linkCode}
                            </div>
                          </TableCell>
                          <TableCell>{link.viewCount}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {link.password && <Badge variant="outline">Password</Badge>}
                              {link.requireEmail && <Badge variant="outline">Email</Badge>}
                              {!link.allowDownload && <Badge variant="outline">No DL</Badge>}
                            </div>
                          </TableCell>
                          <TableCell>
                            {new Date(link.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => copyLinkUrl(link.linkCode)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteLinkMutation.mutate({ id: link.id })}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
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
          </TabsContent>

          {/* Visitors Tab */}
          <TabsContent value="visitors" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Visitors</CardTitle>
                    <CardDescription>See who has viewed your data room</CardDescription>
                  </div>
                  <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Mail className="h-4 w-4 mr-2" />
                        Send Invitation
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Invite to Data Room</DialogTitle>
                        <DialogDescription>
                          Send a direct invitation to access this data room
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Email</Label>
                          <Input
                            type="email"
                            value={newInvite.email}
                            onChange={(e) => setNewInvite({ ...newInvite, email: e.target.value })}
                            placeholder="investor@example.com"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Name (optional)</Label>
                          <Input
                            value={newInvite.name}
                            onChange={(e) => setNewInvite({ ...newInvite, name: e.target.value })}
                            placeholder="John Smith"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Personal Message (optional)</Label>
                          <Textarea
                            value={newInvite.message}
                            onChange={(e) => setNewInvite({ ...newInvite, message: e.target.value })}
                            placeholder="Hi, I'd like to share our due diligence materials with you..."
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          onClick={() => {
                            createInviteMutation.mutate({
                              dataRoomId: roomId,
                              email: newInvite.email,
                              name: newInvite.name || undefined,
                              message: newInvite.message || undefined,
                            });
                          }}
                          disabled={!newInvite.email || createInviteMutation.isPending}
                        >
                          <Send className="h-4 w-4 mr-2" />
                          Send Invitation
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {!visitors?.length ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No visitors yet</p>
                    <p className="text-sm">Share a link to start tracking engagement</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Visitor</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Views</TableHead>
                        <TableHead>Time Spent</TableHead>
                        <TableHead>Last Viewed</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visitors.map((visitor) => (
                        <TableRow key={visitor.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{visitor.name || "Anonymous"}</div>
                              <div className="text-sm text-muted-foreground">{visitor.email}</div>
                            </div>
                          </TableCell>
                          <TableCell>{visitor.company || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={
                              visitor.accessStatus === 'active' ? 'default' :
                              visitor.accessStatus === 'blocked' ? 'destructive' :
                              visitor.accessStatus === 'revoked' ? 'secondary' : 'outline'
                            }>
                              {visitor.accessStatus || 'active'}
                            </Badge>
                          </TableCell>
                          <TableCell>{visitor.totalViews}</TableCell>
                          <TableCell>{Math.round((visitor.totalTimeSpent || 0) / 60)}m</TableCell>
                          <TableCell>
                            {visitor.lastViewedAt
                              ? new Date(visitor.lastViewedAt).toLocaleString()
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {visitor.accessStatus === 'active' ? (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        if (confirm('Block this visitor? They will no longer be able to access the data room.')) {
                                          blockVisitorMutation.mutate({ id: visitor.id, reason: 'Blocked by admin' });
                                        }
                                      }}
                                      className="text-destructive"
                                    >
                                      Block Visitor
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        if (confirm('Revoke access for this visitor?')) {
                                          revokeVisitorMutation.mutate({ id: visitor.id, reason: 'Access revoked by admin' });
                                        }
                                      }}
                                    >
                                      Revoke Access
                                    </DropdownMenuItem>
                                  </>
                                ) : visitor.accessStatus === 'blocked' ? (
                                  <DropdownMenuItem
                                    onClick={() => unblockVisitorMutation.mutate({ id: visitor.id })}
                                  >
                                    Unblock Visitor
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() => restoreVisitorMutation.mutate({ id: visitor.id })}
                                  >
                                    Restore Access
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="mt-4">
            <DetailedAnalytics dataRoomId={roomId} />
          </TabsContent>

          {/* Checklist Tab */}
          <TabsContent value="checklist" className="mt-4">
            <DueDiligenceChecklist dataRoomId={roomId} />
          </TabsContent>

          {/* Google Drive Sync Tab */}
          {/* Drive Sync tab removed — use header button */}

          {/* Email Access Rules Tab */}
          <TabsContent value="emailRules" className="mt-4">
            <EmailAccessRulesManager dataRoomId={roomId} />
          </TabsContent>

          {/* NDA Tab */}
          <TabsContent value="nda" className="mt-4">
            <NdaManagement dataRoomId={roomId} requiresNda={room?.requiresNda || false} />
          </TabsContent>

          {/* Investments Tab */}
          <TabsContent value="investments" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Investment Pipeline</CardTitle>
                    <CardDescription>Track investor commitments and onboard to cap table</CardDescription>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {commitments?.length || 0} total
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {!commitments?.length ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Activity className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm font-medium">No investment commitments yet</p>
                    <p className="text-xs mt-1">Investors can express interest from the public data room page.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Investor</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {commitments.map((c: any) => {
                        const statusColors: Record<string, string> = {
                          interested: "bg-blue-500/10 text-blue-500 border-blue-500/20",
                          committed: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
                          docs_sent: "bg-amber-500/10 text-amber-500 border-amber-500/20",
                          signed: "bg-purple-500/10 text-purple-500 border-purple-500/20",
                          funded: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
                          completed: "bg-green-500/10 text-green-500 border-green-500/20",
                          declined: "bg-red-500/10 text-red-500 border-red-500/20",
                        };
                        const typeLabels: Record<string, string> = {
                          safe: "SAFE",
                          equity: "Equity",
                          convertible_note: "Conv. Note",
                          warrant: "Warrant",
                        };
                        const statusSteps = ["interested", "committed", "docs_sent", "signed", "funded", "completed"];
                        const currentIdx = statusSteps.indexOf(c.status);
                        const nextStatus = c.status !== "declined" && c.status !== "completed" && currentIdx < statusSteps.length - 1
                          ? statusSteps[currentIdx + 1]
                          : null;

                        return (
                          <TableRow key={c.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">{c.investorName}</p>
                                <p className="text-xs text-muted-foreground">{c.investorEmail}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">
                              {c.investorCompany || "-"}
                              {c.investorTitle && (
                                <span className="text-xs text-muted-foreground block">{c.investorTitle}</span>
                              )}
                            </TableCell>
                            <TableCell className="font-medium text-sm">
                              ${Number(c.investmentAmount || 0).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {typeLabels[c.instrumentType] || c.instrumentType}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-xs ${statusColors[c.status] || ""}`}>
                                {c.status?.replace(/_/g, " ")}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "-"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {nextStatus && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-7 text-xs">
                                        <ChevronDown className="h-3 w-3 mr-1" />
                                        Advance
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      {statusSteps.slice(currentIdx + 1).map((s) => (
                                        <DropdownMenuItem
                                          key={s}
                                          onClick={() => updateStatusMutation.mutate({ id: c.id, status: s as any })}
                                        >
                                          {s.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
                                        </DropdownMenuItem>
                                      ))}
                                      <DropdownMenuItem
                                        className="text-red-500"
                                        onClick={() => updateStatusMutation.mutate({ id: c.id, status: "declined" })}
                                      >
                                        Decline
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                                {(c.status === "funded" || c.status === "signed") && !c.addedToCapTable && (
                                  <Button
                                    variant="default"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => {
                                      setSelectedCommitment(c);
                                      setFinalizeOpen(true);
                                    }}
                                  >
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Finalize
                                  </Button>
                                )}
                                {c.addedToCapTable && (
                                  <Badge variant="outline" className="text-xs text-green-600 border-green-600/30">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    On Cap Table
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}

                {/* Pipeline summary */}
                {commitments && commitments.length > 0 && (
                  <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Total Interest</p>
                      <p className="text-lg font-semibold">
                        ${commitments.reduce((sum: number, c: any) => sum + Number(c.investmentAmount || 0), 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Active Pipeline</p>
                      <p className="text-lg font-semibold">
                        {commitments.filter((c: any) => !["completed", "declined"].includes(c.status)).length}
                      </p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Completed</p>
                      <p className="text-lg font-semibold">
                        {commitments.filter((c: any) => c.status === "completed").length}
                      </p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">On Cap Table</p>
                      <p className="text-lg font-semibold">
                        {commitments.filter((c: any) => c.addedToCapTable).length}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Finalize Investment Dialog */}
            <Dialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Finalize Investment</DialogTitle>
                  <DialogDescription>
                    Add {selectedCommitment?.investorName} to the cap table. This will create a stakeholder record and equity grant.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                    <p className="text-sm"><span className="text-muted-foreground">Investor:</span> {selectedCommitment?.investorName}</p>
                    <p className="text-sm"><span className="text-muted-foreground">Amount:</span> ${Number(selectedCommitment?.investmentAmount || 0).toLocaleString()}</p>
                    <p className="text-sm"><span className="text-muted-foreground">Type:</span> {selectedCommitment?.instrumentType?.replace(/_/g, " ")}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Share Class ID</Label>
                    <Input
                      type="number"
                      placeholder="e.g., 1"
                      value={finalizeForm.shareClassId}
                      onChange={(e) => setFinalizeForm(f => ({ ...f, shareClassId: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Number of Shares</Label>
                    <Input
                      placeholder="e.g., 10000"
                      value={finalizeForm.shares}
                      onChange={(e) => setFinalizeForm(f => ({ ...f, shares: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Price Per Share</Label>
                    <Input
                      placeholder="e.g., 1.00"
                      value={finalizeForm.pricePerShare}
                      onChange={(e) => setFinalizeForm(f => ({ ...f, pricePerShare: e.target.value }))}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setFinalizeOpen(false)}>Cancel</Button>
                  <Button
                    disabled={!finalizeForm.shareClassId || !finalizeForm.shares || !finalizeForm.pricePerShare || finalizeMutation.isPending}
                    onClick={() => {
                      if (selectedCommitment) {
                        finalizeMutation.mutate({
                          commitmentId: selectedCommitment.id,
                          shareClassId: parseInt(finalizeForm.shareClassId),
                          shares: finalizeForm.shares,
                          pricePerShare: finalizeForm.pricePerShare,
                        });
                      }
                    }}
                  >
                    {finalizeMutation.isPending ? "Adding..." : "Add to Cap Table"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Data Room Settings</CardTitle>
                <CardDescription>Configure access controls and permissions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={room.name} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={room.description || ""} disabled />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Password Protection</Label>
                    <p className="text-sm text-muted-foreground">
                      {room.password ? "Password is set" : "No password required"}
                    </p>
                  </div>
                  <Badge variant={room.password ? "default" : "outline"}>
                    {room.password ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>NDA Required</Label>
                    <p className="text-sm text-muted-foreground">
                      Visitors must accept NDA before viewing
                    </p>
                  </div>
                  <Badge variant={room.requiresNda ? "default" : "outline"}>
                    {room.requiresNda ? "Required" : "Not Required"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Allow Downloads</Label>
                    <p className="text-sm text-muted-foreground">
                      Visitors can download documents
                    </p>
                  </div>
                  <Badge variant={room.allowDownload ? "default" : "outline"}>
                    {room.allowDownload ? "Allowed" : "Disabled"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Status</Label>
                    <p className="text-sm text-muted-foreground">
                      Current status of this data room
                    </p>
                  </div>
                  <Badge variant={room.status === 'active' ? "default" : "secondary"}>
                    {room.status}
                  </Badge>
                </div>
                <div className="border-t pt-6 mt-6">
                  <h3 className="font-medium mb-4">Access Controls</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Invitation Only</Label>
                        <p className="text-sm text-muted-foreground">
                          Only invited users can access this data room
                        </p>
                      </div>
                      <Badge variant={room.invitationOnly ? "default" : "outline"}>
                        {room.invitationOnly ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Watermark Documents</Label>
                        <p className="text-sm text-muted-foreground">
                          Add visitor email watermark to all documents
                        </p>
                      </div>
                      <Badge variant={room.watermarkEnabled ? "default" : "outline"}>
                        {room.watermarkEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    {room.watermarkEnabled && room.watermarkText && (
                      <div className="pl-4 border-l-2 border-muted">
                        <Label className="text-sm text-muted-foreground">Custom Watermark Text</Label>
                        <p className="text-sm">{room.watermarkText}</p>
                      </div>
                    )}
                  </div>
                </div>
                {/* Google Drive sync — use header button only */}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Delete All Confirmation Dialog */}
        <Dialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete All Files</DialogTitle>
              <DialogDescription>
                This will permanently delete all {(documents?.length || 0) + (folders?.length || 0)} items
                ({documents?.length || 0} file{(documents?.length || 0) !== 1 ? "s" : ""} and{" "}
                {folders?.length || 0} folder{(folders?.length || 0) !== 1 ? "s" : ""}) in the current view.
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteAllOpen(false)} disabled={isDeletingAll}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAll}
                disabled={isDeletingAll}
              >
                {isDeletingAll ? "Deleting..." : "Delete All"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Google Drive Sync Dialog */}
        <Dialog open={googleDriveSyncOpen} onOpenChange={(open) => {
          setGoogleDriveSyncOpen(open);
          if (!open) {
            setSelectedDriveFolderId("");
            setDriveFileBrowseFolderId("");
            setDriveFileBrowseInput("");
            setSelectedDriveFileId("");
            setDriveSyncTab("folder");
          }
        }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Import from Google Drive</DialogTitle>
              <DialogDescription>
                Import a full folder or a single file from Google Drive into this data room.
              </DialogDescription>
            </DialogHeader>

            <Tabs value={driveSyncTab} onValueChange={(v) => setDriveSyncTab(v as "folder" | "file")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="folder">Sync Folder</TabsTrigger>
                <TabsTrigger value="file">Import Single File</TabsTrigger>
              </TabsList>

              {/* ── Sync Folder tab ── */}
              <TabsContent value="folder" className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="driveFolderId">Google Drive Folder ID</Label>
                  <Input
                    id="driveFolderId"
                    placeholder="Paste folder ID here"
                    value={selectedDriveFolderId}
                    onChange={(e) => setSelectedDriveFolderId(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Open the folder in Google Drive and copy the ID from the URL (the part after /folders/)
                  </p>
                </div>
                <div className="bg-muted p-3 rounded-lg space-y-1 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">What gets synced:</p>
                  <p>All files and subfolders are imported recursively (up to 5 levels deep). Folders named "private", "confidential", or starting with "_" are skipped. Google Docs/Sheets/Slides are exported as PDF.</p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setGoogleDriveSyncOpen(false)}>Cancel</Button>
                  <Button
                    onClick={() => {
                      if (!selectedDriveFolderId) {
                        toast.error("Please enter a Google Drive folder ID");
                        return;
                      }
                      syncGoogleDriveMutation.mutate({ dataRoomId: roomId, googleDriveFolderId: selectedDriveFolderId });
                    }}
                    disabled={syncGoogleDriveMutation.isPending}
                  >
                    {syncGoogleDriveMutation.isPending ? "Syncing..." : "Sync Folder"}
                  </Button>
                </DialogFooter>
              </TabsContent>

              {/* ── Import Single File tab ── */}
              <TabsContent value="file" className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="driveFileBrowse">Google Drive Folder ID to browse</Label>
                  <div className="flex gap-2">
                    <Input
                      id="driveFileBrowse"
                      placeholder="Paste folder ID to list its files"
                      value={driveFileBrowseInput}
                      onChange={(e) => setDriveFileBrowseInput(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (!driveFileBrowseInput.trim()) {
                          toast.error("Enter a folder ID first");
                          return;
                        }
                        setSelectedDriveFileId("");
                        setDriveFileBrowseFolderId(driveFileBrowseInput.trim());
                      }}
                    >
                      Browse
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Open the parent folder in Google Drive and copy the ID from the URL.
                  </p>
                </div>

                {driveFileBrowseFolderId && (
                  <div className="space-y-2">
                    <Label>Select a file</Label>
                    {driveFilesLoading ? (
                      <p className="text-sm text-muted-foreground">Loading files…</p>
                    ) : !driveFilesData?.files?.length ? (
                      <p className="text-sm text-muted-foreground">No files found in this folder.</p>
                    ) : (
                      <ScrollArea className="h-48 rounded-md border p-2">
                        <div className="space-y-1">
                          {driveFilesData.files.map((f) => (
                            <div
                              key={f.id}
                              className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm hover:bg-muted transition-colors ${selectedDriveFileId === f.id ? "bg-muted font-medium" : ""}`}
                              onClick={() => setSelectedDriveFileId(f.id)}
                            >
                              <File className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="truncate flex-1">{f.name}</span>
                              {selectedDriveFileId === f.id && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </div>
                )}

                <DialogFooter>
                  <Button variant="outline" onClick={() => setGoogleDriveSyncOpen(false)}>Cancel</Button>
                  <Button
                    onClick={() => {
                      if (!selectedDriveFileId) {
                        toast.error("Please select a file");
                        return;
                      }
                      syncDriveFileMutation.mutate({
                        dataRoomId: roomId,
                        googleDriveFileId: selectedDriveFileId,
                        folderId: currentFolderId,
                      });
                    }}
                    disabled={syncDriveFileMutation.isPending || !selectedDriveFileId}
                  >
                    {syncDriveFileMutation.isPending ? "Importing…" : "Import File"}
                  </Button>
                </DialogFooter>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>


      </div>
  );
}

// NDA Management Component
function NdaManagement({ dataRoomId, requiresNda }: { dataRoomId: number; requiresNda: boolean }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [ndaName, setNdaName] = useState("");
  const [ndaVersion, setNdaVersion] = useState("1.0");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: ndaDocuments, refetch: refetchNda } = trpc.nda.documents.list.useQuery({ dataRoomId });
  const { data: signatures, refetch: refetchSignatures } = trpc.nda.signatures.list.useQuery({ dataRoomId });

  const uploadNdaMutation = trpc.nda.documents.upload.useMutation({
    onSuccess: () => {
      toast.success("NDA document uploaded");
      setUploadOpen(false);
      setSelectedFile(null);
      setNdaName("");
      refetchNda();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteNdaMutation = trpc.nda.documents.delete.useMutation({
    onSuccess: () => {
      toast.success("NDA document deleted");
      refetchNda();
    },
  });

  const revokeSignatureMutation = trpc.nda.signatures.revoke.useMutation({
    onSuccess: () => {
      toast.success("Signature revoked");
      refetchSignatures();
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check if file is a PDF by MIME type or file extension
      const isPdf = file.type === 'application/pdf' || 
                    file.type === 'application/x-pdf' ||
                    file.name.toLowerCase().endsWith('.pdf');
      
      if (!isPdf) {
        toast.error("Please upload a PDF file");
        return;
      }
      setSelectedFile(file);
      if (!ndaName) {
        setNdaName(file.name.replace('.pdf', ''));
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      uploadNdaMutation.mutate({
        dataRoomId,
        name: ndaName || selectedFile.name,
        version: ndaVersion,
        fileContent: base64,
        mimeType: 'application/pdf',
        fileSize: selectedFile.size,
      });
    };
    reader.readAsDataURL(selectedFile);
  };

  const activeNda = ndaDocuments?.find(d => d.isActive);

  return (
    <div className="p-6 space-y-6">
      {/* NDA Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                NDA Document
              </CardTitle>
              <CardDescription>
                Upload and manage NDA documents for this data room
              </CardDescription>
            </div>
            <Badge variant={requiresNda ? "default" : "outline"}>
              {requiresNda ? "NDA Required" : "NDA Optional"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {activeNda ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 bg-red-100 rounded-lg flex items-center justify-center">
                    <FileText className="h-6 w-6 text-red-600" />
                  </div>
                  <div>
                    <div className="font-medium">{activeNda.name}</div>
                    <div className="text-sm text-muted-foreground">
                      Version {activeNda.version} • Uploaded {new Date(activeNda.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={activeNda.storageUrl} target="_blank" rel="noopener noreferrer">
                      <Eye className="h-4 w-4 mr-2" />
                      View
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setUploadOpen(true)}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Replace
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteNdaMutation.mutate({ id: activeNda.id })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-4">No NDA document uploaded</p>
              <Button onClick={() => setUploadOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Upload NDA Document
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Signatures Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Signatures ({signatures?.length || 0})
          </CardTitle>
          <CardDescription>
            View all signed NDAs for this data room
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!signatures?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Lock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No signatures yet</p>
              <p className="text-sm">Signatures will appear here when visitors sign the NDA</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Signer</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Signed At</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signatures.map((sig) => (
                  <TableRow key={sig.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{sig.signerName}</div>
                        <div className="text-sm text-muted-foreground">{sig.signerEmail}</div>
                      </div>
                    </TableCell>
                    <TableCell>{sig.signerCompany || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {sig.signatureType === 'drawn' ? 'Drawn' : 'Typed'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(sig.signedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {sig.ipAddress}
                    </TableCell>
                    <TableCell>
                      <Badge variant={sig.status === 'signed' ? 'default' : 'destructive'}>
                        {sig.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {sig.signatureImageUrl && (
                            <DropdownMenuItem asChild>
                              <a href={sig.signatureImageUrl} target="_blank" rel="noopener noreferrer">
                                <Eye className="h-4 w-4 mr-2" />
                                View Signature
                              </a>
                            </DropdownMenuItem>
                          )}
                          {sig.status === 'signed' && (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => revokeSignatureMutation.mutate({ id: sig.id })}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Revoke Signature
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload NDA Document</DialogTitle>
            <DialogDescription>
              Upload a PDF document that visitors must sign before accessing the data room
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleFileSelect}
              />
              {selectedFile ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="h-8 w-8 text-red-600" />
                  <span className="font-medium">{selectedFile.name}</span>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-muted-foreground">Click to upload PDF</p>
                  <p className="text-sm text-muted-foreground">or drag and drop</p>
                </>
              )}
            </div>
            <div className="space-y-2">
              <Label>Document Name</Label>
              <Input
                value={ndaName}
                onChange={(e) => setNdaName(e.target.value)}
                placeholder="Non-Disclosure Agreement"
              />
            </div>
            <div className="space-y-2">
              <Label>Version</Label>
              <Input
                value={ndaVersion}
                onChange={(e) => setNdaVersion(e.target.value)}
                placeholder="1.0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploadNdaMutation.isPending}
            >
              {uploadNdaMutation.isPending ? "Uploading..." : "Upload NDA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Detailed Analytics Component
function DetailedAnalytics({ dataRoomId }: { dataRoomId: number }) {
  const [selectedVisitor, setSelectedVisitor] = useState<number | null>(null);

  const { data: report, isLoading } = (trpc.dataRoom as any).detailedAnalytics.getEngagementReport.useQuery({ dataRoomId });
  const { data: visitorDetails } = (trpc.dataRoom as any).detailedAnalytics.getVisitorDetails.useQuery(
    { dataRoomId, visitorId: selectedVisitor! },
    { enabled: !!selectedVisitor }
  );

  const exportCsvMutation = (trpc.dataRoom as any).detailedAnalytics.exportCsv.useMutation({
    onSuccess: (data) => {
      const blob = new Blob([data.csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    },
  });

  const formatDuration = (ms: number) => {
    if (ms < 1000) return "< 1s";
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    return `${Math.round(ms / 3600000)}h ${Math.round((ms % 3600000) / 60000)}m`;
  };

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading analytics...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Visitors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold tracking-[-0.02em]">{report?.summary.totalVisitors || 0}</div>
            <p className="text-xs text-muted-foreground">{report?.summary.activeVisitors || 0} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold tracking-[-0.02em]">{report?.summary.totalSessions || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Page Views</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold tracking-[-0.02em]">{report?.summary.totalPageViews || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Time Spent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold tracking-[-0.02em]">{formatDuration(report?.summary.totalEngagementTimeMs || 0)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Export Buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportCsvMutation.mutate({ dataRoomId, type: 'visitors' })}
        >
          <Download className="h-4 w-4 mr-2" />
          Export Visitors
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportCsvMutation.mutate({ dataRoomId, type: 'documents' })}
        >
          <Download className="h-4 w-4 mr-2" />
          Export Documents
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Visitor Engagement */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Visitor Engagement
            </CardTitle>
            <CardDescription>Ranked by total time spent</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Visitor</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Docs</TableHead>
                    <TableHead>Pages</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report?.visitorEngagement.map((v) => (
                    <TableRow
                      key={v.visitorId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedVisitor(v.visitorId)}
                    >
                      <TableCell>
                        <div>
                          <div className="font-medium">{v.email || 'Unknown'}</div>
                          <div className="text-xs text-muted-foreground">{v.company || '-'}</div>
                        </div>
                      </TableCell>
                      <TableCell>{formatDuration(v.totalTimeMs)}</TableCell>
                      <TableCell>{v.documentsViewed}</TableCell>
                      <TableCell>{v.pagesViewed}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Document Engagement */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Document Engagement
            </CardTitle>
            <CardDescription>Ranked by total views</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead>Views</TableHead>
                    <TableHead>Visitors</TableHead>
                    <TableHead>Avg Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report?.documentEngagement.map((d) => (
                    <TableRow key={d.documentId}>
                      <TableCell>
                        <div className="font-medium truncate max-w-[200px]">{d.documentName}</div>
                        <div className="text-xs text-muted-foreground">{d.pageCount} pages</div>
                      </TableCell>
                      <TableCell>{d.views}</TableCell>
                      <TableCell>{d.uniqueVisitors}</TableCell>
                      <TableCell>{formatDuration(d.avgTimePerPageMs)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Visitor Details Modal */}
      {selectedVisitor && visitorDetails && (
        <Dialog open={!!selectedVisitor} onOpenChange={() => setSelectedVisitor(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Visitor Details</DialogTitle>
              <DialogDescription>
                {visitorDetails.visitor.email} - {visitorDetails.visitor.company || 'No company'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-xl font-semibold tracking-[-0.02em]">{visitorDetails.summary.totalSessions}</div>
                  <div className="text-xs text-muted-foreground">Sessions</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-semibold tracking-[-0.02em]">{visitorDetails.summary.totalDocuments}</div>
                  <div className="text-xs text-muted-foreground">Documents</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-semibold tracking-[-0.02em]">{visitorDetails.summary.totalPageViews}</div>
                  <div className="text-xs text-muted-foreground">Page Views</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-semibold tracking-[-0.02em]">{formatDuration(visitorDetails.summary.totalTimeMs)}</div>
                  <div className="text-xs text-muted-foreground">Total Time</div>
                </div>
              </div>
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Document Engagement</h4>
                <ScrollArea className="h-60">
                  {visitorDetails.documentEngagement.map((doc) => (
                    <div key={doc.documentId} className="p-3 border rounded-lg mb-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">{doc.documentName}</div>
                          <div className="text-sm text-muted-foreground">
                            {doc.pagesViewed}/{doc.pageCount} pages ({doc.percentViewed}%) •
                            {formatDuration(doc.totalDurationMs)} total
                          </div>
                        </div>
                        <Badge>{doc.totalViews} views</Badge>
                      </div>
                    </div>
                  ))}
                </ScrollArea>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// Google Drive Sync Settings Component
function GoogleDriveSyncSettings({ dataRoomId }: { dataRoomId: number }) {
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [selectedFolderName, setSelectedFolderName] = useState<string>('');
  const [currentParentId, setCurrentParentId] = useState<string | undefined>(undefined);
  const [folderPath, setFolderPath] = useState<{ id: string; name: string }[]>([]);

  const { data: syncConfig, refetch: refetchConfig } = (trpc.dataRoom as any).driveSync.getConfig.useQuery({ dataRoomId });
  const { data: syncLogs, refetch: refetchLogs } = (trpc.dataRoom as any).driveSync.getLogs.useQuery({ dataRoomId, limit: 10 });
  const { data: driveFolders, isLoading: foldersLoading } = (trpc.dataRoom as any).driveSync.listDriveFolders.useQuery(
    { parentId: currentParentId },
    { enabled: folderPickerOpen }
  );

  const saveConfigMutation = (trpc.dataRoom as any).driveSync.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("Sync configuration saved");
      refetchConfig();
      setFolderPickerOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const syncNowMutation = (trpc.dataRoom as any).driveSync.syncNow.useMutation({
    onSuccess: (result) => {
      toast.success(`Sync completed: ${result.filesAdded} added, ${result.filesUpdated} updated`);
      refetchConfig();
      refetchLogs();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteConfigMutation = (trpc.dataRoom as any).driveSync.deleteConfig.useMutation({
    onSuccess: () => {
      toast.success("Sync configuration removed");
      refetchConfig();
    },
  });

  const handleSaveConfig = () => {
    if (!selectedFolderId) {
      toast.error("Please select a Google Drive folder");
      return;
    }
    saveConfigMutation.mutate({
      dataRoomId,
      googleDriveFolderId: selectedFolderId,
      googleDriveFolderName: selectedFolderName,
      syncEnabled: true,
      syncSubfolders: true,
    });
  };

  const navigateToFolder = (folderId: string, folderName: string) => {
    setFolderPath([...folderPath, { id: folderId, name: folderName }]);
    setCurrentParentId(folderId);
  };

  const navigateBack = () => {
    if (folderPath.length > 0) {
      const newPath = [...folderPath];
      const parent = newPath.pop();
      setFolderPath(newPath);
      setCurrentParentId(parent?.id === 'root' ? undefined : parent?.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Sync Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Google Drive Sync
          </CardTitle>
          <CardDescription>
            Automatically sync documents from a Google Drive folder
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {syncConfig ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <HardDrive className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <div className="font-medium">{syncConfig.googleDriveFolderName || 'Connected Folder'}</div>
                    <div className="text-sm text-muted-foreground">
                      Last sync: {syncConfig.lastSyncAt ? new Date(syncConfig.lastSyncAt).toLocaleString() : 'Never'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {syncConfig.lastSyncStatus === 'success' && (
                    <Badge className="bg-emerald-500/8 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Synced
                    </Badge>
                  )}
                  {syncConfig.lastSyncStatus === 'failed' && (
                    <Badge variant="destructive">
                      <XCircle className="h-3 w-3 mr-1" />
                      Failed
                    </Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncNowMutation.mutate({ dataRoomId })}
                    disabled={syncNowMutation.isPending}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${syncNowMutation.isPending ? 'animate-spin' : ''}`} />
                    {syncNowMutation.isPending ? 'Syncing...' : 'Sync Now'}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (confirm('Remove sync configuration?')) {
                        deleteConfigMutation.mutate({ dataRoomId });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {syncConfig.lastSyncError && (
                <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  {syncConfig.lastSyncError}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <HardDrive className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-4">No Google Drive folder connected</p>
              <Button onClick={() => setFolderPickerOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Connect Google Drive Folder
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync History */}
      {syncLogs && syncLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sync History</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Files Added</TableHead>
                  <TableHead>Files Updated</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{new Date(log.startedAt).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.syncType}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={log.status === 'completed' ? 'default' : log.status === 'failed' ? 'destructive' : 'secondary'}>
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{log.filesAdded}</TableCell>
                    <TableCell>{log.filesUpdated}</TableCell>
                    <TableCell>{log.durationMs ? `${(log.durationMs / 1000).toFixed(1)}s` : '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Folder Picker Dialog */}
      <Dialog open={folderPickerOpen} onOpenChange={setFolderPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Select Google Drive Folder</DialogTitle>
            <DialogDescription>
              Choose a folder to sync with this data room
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm">
              {folderPath.length > 0 && (
                <Button variant="ghost" size="sm" onClick={navigateBack}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              )}
              <span className="text-muted-foreground">
                {folderPath.map(f => f.name).join(' / ') || 'My Drive'}
              </span>
            </div>

            {/* Folder List */}
            <ScrollArea className="h-64 border rounded-lg">
              {foldersLoading ? (
                <div className="p-4 text-center text-muted-foreground">Loading folders...</div>
              ) : driveFolders?.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">No folders found</div>
              ) : (
                <div className="p-2 space-y-1">
                  {driveFolders?.map((folder) => (
                    <div
                      key={folder.id}
                      className={`flex items-center justify-between p-2 rounded-lg hover:bg-muted cursor-pointer ${selectedFolderId === folder.id ? 'bg-primary/10 border border-primary' : ''}`}
                      onClick={() => {
                        setSelectedFolderId(folder.id);
                        setSelectedFolderName(folder.name);
                      }}
                      onDoubleClick={() => navigateToFolder(folder.id, folder.name)}
                    >
                      <div className="flex items-center gap-2">
                        <Folder className="h-5 w-5 text-blue-500" />
                        <span>{folder.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateToFolder(folder.id, folder.name);
                        }}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {selectedFolderId && (
              <div className="p-2 bg-muted rounded-lg text-sm">
                Selected: <strong>{selectedFolderName}</strong>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderPickerOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveConfig}
              disabled={!selectedFolderId || saveConfigMutation.isPending}
            >
              {saveConfigMutation.isPending ? 'Saving...' : 'Connect Folder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Email Access Rules Manager Component
function EmailAccessRulesManager({ dataRoomId }: { dataRoomId: number }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [newRule, setNewRule] = useState({
    ruleType: 'allow_domain' as 'allow_email' | 'allow_domain' | 'block_email' | 'block_domain',
    emailPattern: '',
    allowDownload: true,
    allowPrint: true,
    requireNdaSignature: true,
    notifyOnAccess: true,
  });

  const { data: rules, refetch } = (trpc.dataRoom as any).emailRules.list.useQuery({ dataRoomId });

  const createMutation = (trpc.dataRoom as any).emailRules.create.useMutation({
    onSuccess: () => {
      toast.success("Rule created");
      setCreateOpen(false);
      setNewRule({
        ruleType: 'allow_domain',
        emailPattern: '',
        allowDownload: true,
        allowPrint: true,
        requireNdaSignature: true,
        notifyOnAccess: true,
      });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = (trpc.dataRoom as any).emailRules.delete.useMutation({
    onSuccess: () => {
      toast.success("Rule deleted");
      refetch();
    },
  });

  const toggleMutation = (trpc.dataRoom as any).emailRules.update.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const getRuleTypeLabel = (type: string) => {
    switch (type) {
      case 'allow_email': return 'Allow Email';
      case 'allow_domain': return 'Allow Domain';
      case 'block_email': return 'Block Email';
      case 'block_domain': return 'Block Domain';
      default: return type;
    }
  };

  const getRuleTypeColor = (type: string) => {
    return type.startsWith('allow') ? 'bg-emerald-500/8 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/8 text-red-600 dark:text-red-400';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Email Access Rules
              </CardTitle>
              <CardDescription>
                Control who can access this data room based on email or domain
              </CardDescription>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Rule
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!rules?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No access rules configured</p>
              <p className="text-sm">All visitors will have default access permissions</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Pattern</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <Badge className={getRuleTypeColor(rule.ruleType)}>
                        {getRuleTypeLabel(rule.ruleType)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">{rule.emailPattern}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {rule.allowDownload && <Badge variant="outline">Download</Badge>}
                        {rule.allowPrint && <Badge variant="outline">Print</Badge>}
                        {rule.requireNdaSignature && <Badge variant="outline">NDA</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleMutation.mutate({ id: rule.id, isActive: !rule.isActive })}
                      >
                        <Badge variant={rule.isActive ? 'default' : 'secondary'}>
                          {rule.isActive ? 'Active' : 'Disabled'}
                        </Badge>
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm('Delete this rule?')) {
                            deleteMutation.mutate({ id: rule.id });
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Rule Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Access Rule</DialogTitle>
            <DialogDescription>
              Define who can access this data room
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Rule Type</Label>
              <select
                className="w-full border rounded-lg px-3 py-2"
                value={newRule.ruleType}
                onChange={(e) => setNewRule({ ...newRule, ruleType: e.target.value as any })}
              >
                <option value="allow_domain">Allow Domain</option>
                <option value="allow_email">Allow Email</option>
                <option value="block_domain">Block Domain</option>
                <option value="block_email">Block Email</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>
                {newRule.ruleType.includes('domain') ? 'Domain' : 'Email Address'}
              </Label>
              <Input
                value={newRule.emailPattern}
                onChange={(e) => setNewRule({ ...newRule, emailPattern: e.target.value })}
                placeholder={newRule.ruleType.includes('domain') ? 'example.com' : 'user@example.com'}
              />
              <p className="text-xs text-muted-foreground">
                {newRule.ruleType.includes('domain')
                  ? 'Enter domain without @ (e.g., "example.com")'
                  : 'Enter full email address'}
              </p>
            </div>
            {newRule.ruleType.startsWith('allow') && (
              <>
                <div className="flex items-center justify-between">
                  <Label>Allow Downloads</Label>
                  <Switch
                    checked={newRule.allowDownload}
                    onCheckedChange={(checked) => setNewRule({ ...newRule, allowDownload: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Allow Print</Label>
                  <Switch
                    checked={newRule.allowPrint}
                    onCheckedChange={(checked) => setNewRule({ ...newRule, allowPrint: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Require NDA Signature</Label>
                  <Switch
                    checked={newRule.requireNdaSignature}
                    onCheckedChange={(checked) => setNewRule({ ...newRule, requireNdaSignature: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Notify on Access</Label>
                  <Switch
                    checked={newRule.notifyOnAccess}
                    onCheckedChange={(checked) => setNewRule({ ...newRule, notifyOnAccess: checked })}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate({ ...newRule, dataRoomId })}
              disabled={!newRule.emailPattern || createMutation.isPending}
            >
              Create Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Due Diligence Checklist Component
function DueDiligenceChecklist({ dataRoomId }: { dataRoomId: number }) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [hasAutoMatched, setHasAutoMatched] = useState(false);

  const { data: summary, refetch: refetchSummary } = (trpc.dataRoom as any).dueDiligence.getSummary.useQuery({ dataRoomId });
  const { data: checklistData, refetch: refetchChecklist } = (trpc.dataRoom as any).dueDiligence.getById.useQuery(
    { id: summary?.checklist?.id || 0 },
    { enabled: !!summary?.checklist?.id }
  );
  const { data: documents } = trpc.dataRoom.documents.list.useQuery({ dataRoomId });

  const createStandardMutation = (trpc.dataRoom as any).dueDiligence.createStandard.useMutation({
    onSuccess: () => {
      toast.success("Checklist created - scanning documents...");
      setCreateOpen(false);
      refetchSummary();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const autoMatchMutation = (trpc.dataRoom as any).dueDiligence.autoMatch.useMutation({
    onSuccess: (result) => {
      if (result.matched > 0) {
        toast.success(`Matched ${result.matched} documents to checklist items`);
      } else {
        toast.info("No new matches found");
      }
      refetchSummary();
      refetchChecklist();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateItemMutation = (trpc.dataRoom as any).dueDiligence.updateItem.useMutation({
    onSuccess: () => {
      refetchSummary();
      refetchChecklist();
    },
  });

  const linkDocumentMutation = (trpc.dataRoom as any).dueDiligence.linkDocument.useMutation({
    onSuccess: () => {
      toast.success("Document linked");
      refetchChecklist();
      refetchSummary();
    },
  });

  // Auto-parse documents on initial load when checklist exists
  useEffect(() => {
    if (summary?.checklist?.id && !hasAutoMatched && documents && documents.length > 0) {
      setHasAutoMatched(true);
      autoMatchMutation.mutate({ checklistId: summary.checklist.id });
    }
  }, [summary?.checklist?.id, documents]);

  // Expand all categories by default when data loads
  useEffect(() => {
    if (checklistData?.categories && expandedCategories.size === 0) {
      setExpandedCategories(new Set(checklistData.categories.map(c => c.name)));
    }
  }, [checklistData]);

  const toggleCategory = (name: string) => {
    const newSet = new Set(expandedCategories);
    if (newSet.has(name)) {
      newSet.delete(name);
    } else {
      newSet.add(name);
    }
    setExpandedCategories(newSet);
  };

  const handleCheckboxToggle = useCallback((item: any) => {
    if (item.status === 'complete') {
      updateItemMutation.mutate({ id: item.id, status: 'missing' });
    } else {
      updateItemMutation.mutate({ id: item.id, status: 'complete' });
    }
  }, [updateItemMutation]);

  // No checklist yet
  if (!summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Due Diligence Checklist
          </CardTitle>
          <CardDescription>
            Track required documents and ensure nothing is missing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <ClipboardList className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">No Checklist Created</h3>
            <p className="text-muted-foreground mb-6">
              Create a due diligence checklist to track required documents
            </p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Checklist
            </Button>
          </div>
        </CardContent>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Due Diligence Checklist</DialogTitle>
              <DialogDescription>
                Choose a checklist type to get started
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <Button
                variant="outline"
                className="h-auto p-4 justify-start"
                onClick={() => createStandardMutation.mutate({ dataRoomId, checklistType: 'full' })}
                disabled={createStandardMutation.isPending}
              >
                <div className="text-left">
                  <div className="font-medium">Standard Due Diligence</div>
                  <div className="text-sm text-muted-foreground">
                    Complete checklist with 40+ items across 7 categories
                  </div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="h-auto p-4 justify-start"
                onClick={() => createStandardMutation.mutate({ dataRoomId, checklistType: 'series_b' })}
                disabled={createStandardMutation.isPending}
              >
                <div className="text-left">
                  <div className="font-medium">Series B Fundraising</div>
                  <div className="text-sm text-muted-foreground">
                    90+ items tailored for growth-stage funding including metrics, compliance & governance
                  </div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="h-auto p-4 justify-start"
                onClick={() => createStandardMutation.mutate({ dataRoomId, checklistType: 'fundraising' })}
                disabled={createStandardMutation.isPending}
              >
                <div className="text-left">
                  <div className="font-medium">General Fundraising</div>
                  <div className="text-sm text-muted-foreground">
                    Optimized for seed and Series A fundraising
                  </div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="h-auto p-4 justify-start"
                onClick={() => createStandardMutation.mutate({ dataRoomId, checklistType: 'ma' })}
                disabled={createStandardMutation.isPending}
              >
                <div className="text-left">
                  <div className="font-medium">M&A Due Diligence</div>
                  <div className="text-sm text-muted-foreground">
                    Comprehensive for acquisitions
                  </div>
                </div>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </Card>
    );
  }

  // Collect all missing items across categories for the missing panel
  const allItems = checklistData?.categories.flatMap(c => c.items) || [];
  const missingItems = allItems.filter((i: any) => i.status === 'missing');
  const completeItems = allItems.filter((i: any) => i.status === 'complete');

  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                {summary.checklist.name}
              </CardTitle>
              <CardDescription className="mt-1">
                {summary.completionPercent}% complete &middot; {completeItems.length} found &middot; {missingItems.length} missing
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={showMissingOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setShowMissingOnly(!showMissingOnly)}
              >
                <AlertCircle className="h-4 w-4 mr-1" />
                {showMissingOnly ? 'Show All' : `${missingItems.length} Missing`}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => autoMatchMutation.mutate({ checklistId: summary.checklist.id })}
                disabled={autoMatchMutation.isPending}
              >
                <Wand2 className={`h-4 w-4 mr-1 ${autoMatchMutation.isPending ? 'animate-spin' : ''}`} />
                {autoMatchMutation.isPending ? 'Scanning...' : 'Re-scan'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Progress bar */}
          <div className="mb-4">
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${summary.completionPercent}%` }} />
            </div>
            <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
              <span>{summary.completedItems} of {summary.totalItems} items</span>
              <span>{summary.completionPercent}%</span>
            </div>
          </div>

          {/* Category progress chips */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.byCategory).map(([name, stats]: [string, any]) => {
              const pct = Math.round((stats.complete / stats.total) * 100);
              return (
                <Badge
                  key={name}
                  variant={pct === 100 ? 'default' : 'outline'}
                  className={`cursor-pointer ${pct === 100 ? 'bg-green-600' : pct > 0 ? 'border-yellow-400 text-yellow-700' : 'border-red-300 text-red-600'}`}
                  onClick={() => {
                    const newSet = new Set(expandedCategories);
                    // Collapse all, expand just this one
                    newSet.clear();
                    newSet.add(name);
                    setExpandedCategories(newSet);
                  }}
                >
                  {name}: {(stats as any).complete}/{(stats as any).total}
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Missing Items Panel */}
      {showMissingOnly && missingItems.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-red-700 flex items-center gap-2 text-base">
              <AlertCircle className="h-5 w-5" />
              {missingItems.length} Documents Still Needed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {missingItems.map((item: any) => (
                <div key={item.id} className="flex items-center gap-3 py-2 px-3 rounded hover:bg-red-50 group">
                  <button
                    className="flex-shrink-0 h-5 w-5 border-2 border-red-300 rounded hover:border-red-500 transition-colors"
                    onClick={() => handleCheckboxToggle(item)}
                    title="Mark as complete"
                  />
                  <span className="text-sm flex-1">{item.itemName}</span>
                  <span className="text-xs text-muted-foreground">{item.categoryName}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 px-2 opacity-0 group-hover:opacity-100">
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Link
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <ScrollArea className="h-48">
                        {documents?.map((doc) => (
                          <DropdownMenuItem
                            key={doc.id}
                            onClick={() => linkDocumentMutation.mutate({ itemId: item.id, documentId: doc.id })}
                          >
                            <File className="h-4 w-4 mr-2 flex-shrink-0" />
                            <span className="truncate">{doc.name}</span>
                          </DropdownMenuItem>
                        ))}
                      </ScrollArea>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Checklist Items by Category */}
      {!showMissingOnly && checklistData?.categories.map((category) => {
        const catComplete = category.items.filter((i: any) => i.status === 'complete').length;
        const catTotal = category.items.length;
        const catPct = Math.round((catComplete / catTotal) * 100);

        return (
          <Card key={category.name}>
            <CardHeader className="cursor-pointer py-3" onClick={() => toggleCategory(category.name)}>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ChevronDown className={`h-4 w-4 transition-transform ${expandedCategories.has(category.name) ? '' : '-rotate-90'}`} />
                  {category.name}
                </CardTitle>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">{catComplete}/{catTotal}</span>
                  <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${catPct === 100 ? 'bg-green-500' : catPct > 0 ? 'bg-yellow-500' : 'bg-red-400'}`}
                      style={{ width: `${catPct}%` }}
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            {expandedCategories.has(category.name) && (
              <CardContent className="pt-0">
                <div className="divide-y">
                  {category.items.map((item: any) => {
                    const isComplete = item.status === 'complete';
                    const isMissing = item.status === 'missing';
                    const isWaived = item.status === 'waived';
                    const isNA = item.status === 'not_applicable';
                    const linkedDocs = item.linkedDocuments || [];

                    return (
                      <div
                        key={item.id}
                        className={`flex items-start gap-3 py-2.5 px-1 group ${
                          isMissing && item.requirement === 'required' ? 'bg-red-50/40' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <button
                          className={`flex-shrink-0 mt-0.5 h-5 w-5 rounded border-2 transition-all ${
                            isComplete
                              ? 'bg-green-500 border-green-500 text-white'
                              : isWaived || isNA
                              ? 'bg-gray-200 border-gray-300'
                              : 'border-gray-300 hover:border-green-500'
                          }`}
                          onClick={() => handleCheckboxToggle(item)}
                          title={isComplete ? 'Mark as missing' : 'Mark as complete'}
                        >
                          {isComplete && <CheckCircle2 className="h-4 w-4 -m-[1px]" />}
                          {(isWaived || isNA) && <span className="text-xs text-gray-500 block leading-4">—</span>}
                        </button>

                        {/* Item name + linked doc link */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-medium ${isComplete ? 'text-green-700 line-through decoration-green-300' : isWaived || isNA ? 'text-gray-400 line-through' : ''}`}>
                              {item.itemName}
                            </span>
                            {item.requirement === 'required' && isMissing && (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">Required</Badge>
                            )}
                          </div>

                          {/* Linked document links - shown inline */}
                          {linkedDocs.length > 0 && (
                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                              {linkedDocs.map((doc: any) => (
                                <a
                                  key={doc.id}
                                  href={doc.fileUrl || doc.storageKey ? `/api/data-room/documents/${doc.id}/view` : '#'}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                  <FileText className="h-3 w-3" />
                                  {doc.name}
                                </a>
                              ))}
                            </div>
                          )}

                          {/* Missing indicator */}
                          {isMissing && linkedDocs.length === 0 && (
                            <span className="text-xs text-red-500 mt-0.5 block">Not found in data room</span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                                <Plus className="h-3.5 w-3.5 mr-1" />
                                Link
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-64">
                              <ScrollArea className="h-48">
                                {documents?.filter(d => !linkedDocs.some((ld: any) => ld.id === d.id)).map((doc) => (
                                  <DropdownMenuItem
                                    key={doc.id}
                                    onClick={() => linkDocumentMutation.mutate({ itemId: item.id, documentId: doc.id })}
                                  >
                                    <File className="h-4 w-4 mr-2 flex-shrink-0" />
                                    <span className="truncate">{doc.name}</span>
                                  </DropdownMenuItem>
                                ))}
                              </ScrollArea>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => updateItemMutation.mutate({ id: item.id, status: 'complete' })}>
                                <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                                Mark Complete
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => updateItemMutation.mutate({ id: item.id, status: 'not_applicable' })}>
                                <Square className="h-4 w-4 mr-2" />
                                Mark N/A
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  const reason = prompt('Enter waiver reason:');
                                  if (reason) {
                                    updateItemMutation.mutate({ id: item.id, status: 'waived', waiverReason: reason });
                                  }
                                }}
                              >
                                <XCircle className="h-4 w-4 mr-2 text-gray-500" />
                                Waive Requirement
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => updateItemMutation.mutate({ id: item.id, status: 'missing' })}>
                                <AlertCircle className="h-4 w-4 mr-2 text-red-500" />
                                Reset to Missing
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
