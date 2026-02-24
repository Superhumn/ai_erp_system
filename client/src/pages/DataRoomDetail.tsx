import { useState, useRef } from "react";
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
  Plus, FolderOpen, Link2, Users, BarChart3, Settings, 
  Eye, Download, Clock, Trash2, Copy, ExternalLink,
  FileText, Lock, Globe, Archive, Upload, File, Folder,
  ChevronRight, ArrowLeft, MoreVertical, Mail, Send
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
export default function DataRoomDetail() {
  const params = useParams<{ id: string }>();
  const roomId = parseInt(params.id || "0");
  const [, setLocation] = useLocation();
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [createLinkOpen, setCreateLinkOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newLink, setNewLink] = useState({
    name: "",
    password: "",
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
    onSuccess: () => {
      toast.success("Document deleted");
      refetchDocuments();
    },
  });

  const deleteFolderMutation = trpc.dataRoom.folders.delete.useMutation({
    onSuccess: () => {
      toast.success("Folder deleted");
      refetchFolders();
    },
  });

  const utils = trpc.useUtils();

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
            <h1 className="text-2xl font-bold">{room.name}</h1>
            <p className="text-muted-foreground">/dataroom/{room.slug}</p>
          </div>
          <Button variant="outline" onClick={() => copyLinkUrl(room.slug)}>
            <Copy className="h-4 w-4 mr-2" />
            Copy Link
          </Button>
          <Button variant="outline" onClick={() => window.open(`/share/${room.slug}`, '_blank')}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Preview
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between w-full">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                Visitors
              </CardTitle>
              <AITriggerButton message="Analyze this data room - organize documents and extract key information" label="AI Analysis" />
            </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics?.totalVisitors || 0}</div>
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
              <div className="text-2xl font-bold">{analytics?.totalDocumentViews || 0}</div>
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
              <div className="text-2xl font-bold">{links?.length || 0}</div>
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
              <div className="text-2xl font-bold">
                {Math.round((analytics?.totalTimeSpent || 0) / 60)}m
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="documents">
          <TabsList>
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
            <TabsTrigger value="nda">
              <FileText className="h-4 w-4 mr-2" />
              NDA
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Documents Tab */}
          <TabsContent value="documents" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Files & Folders</CardTitle>
                    <CardDescription>
                      {currentFolderId ? (
                        <Button 
                          variant="link" 
                          className="p-0 h-auto" 
                          onClick={() => setCurrentFolderId(null)}
                        >
                          ← Back to root
                        </Button>
                      ) : (
                        "Organize your documents into folders"
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline">
                          <Folder className="h-4 w-4 mr-2" />
                          New Folder
                        </Button>
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
                    <Button onClick={() => fileInputRef.current?.click()}>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload File
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {/* Folders */}
                  {folders?.map((folder) => (
                    <div
                      key={`folder-${folder.id}`}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent cursor-pointer"
                      onClick={() => setCurrentFolderId(folder.id)}
                    >
                      <div className="flex items-center gap-3">
                        <Folder className="h-5 w-5 text-blue-500" />
                        <span className="font-medium">{folder.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteFolderMutation.mutate({ id: folder.id });
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}

                  {/* Documents */}
                  {documents?.map((doc) => (
                    <div
                      key={`doc-${doc.id}`}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent"
                    >
                      <div className="flex items-center gap-3">
                        {getFileIcon(doc.fileType)}
                        <div>
                          <div className="font-medium">{doc.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(1)} KB` : "Unknown size"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {doc.storageUrl && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(doc.storageUrl!, '_blank')}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {doc.storageUrl && (
                              <DropdownMenuItem onClick={() => window.open(doc.storageUrl!, '_blank')}>
                                <Download className="h-4 w-4 mr-2" />
                                Download
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => deleteDocMutation.mutate({ id: doc.id })}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}

                  {!folders?.length && !documents?.length && (
                    <div className="text-center py-12 text-muted-foreground">
                      <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No files or folders yet</p>
                      <p className="text-sm">Upload files or create folders to get started</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
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
                      {links.map((link) => (
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

          {/* NDA Tab */}
          <TabsContent value="nda" className="mt-4">
            <NdaManagement dataRoomId={roomId} requiresNda={room?.requiresNda || false} />
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
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
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
      if (file.type !== 'application/pdf') {
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

    // Convert file to base64 and upload to S3
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      const key = `nda/${dataRoomId}/${Date.now()}-${selectedFile.name}`;
      
      // Upload to S3 via storage API
      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key,
            data: base64,
            contentType: 'application/pdf',
          }),
        });
        
        if (!response.ok) throw new Error('Upload failed');
        const { url } = await response.json();

        uploadNdaMutation.mutate({
          dataRoomId,
          name: ndaName || selectedFile.name,
          version: ndaVersion,
          storageKey: key,
          storageUrl: url,
          mimeType: 'application/pdf',
          fileSize: selectedFile.size,
        });
      } catch (error) {
        toast.error("Failed to upload file");
      }
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
