import { useState } from "react";
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
import { toast } from "sonner";
import { 
  Plus, FolderOpen, Link2, Users, BarChart3, Settings, 
  Eye, Download, Clock, Trash2, Copy, ExternalLink,
  FileText, Lock, Globe, Archive
} from "lucide-react";
import { useLocation } from "wouter";

import { AITriggerButton } from "@/components/FloatingAIAssistant";
export default function DataRooms() {
  const [, setLocation] = useLocation();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newRoom, setNewRoom] = useState({
    name: "",
    description: "",
    slug: "",
    isPublic: false,
    password: "",
    requiresNda: false,
    allowDownload: true,
    allowPrint: true,
  });

  const { data: dataRooms, isLoading, refetch } = trpc.dataRoom.list.useQuery();
  const createMutation = trpc.dataRoom.create.useMutation({
    onSuccess: (data) => {
      toast.success("Data room created successfully");
      setCreateDialogOpen(false);
      setNewRoom({
        name: "",
        description: "",
        slug: "",
        isPublic: false,
        password: "",
        requiresNda: false,
        allowDownload: true,
        allowPrint: true,
      });
      refetch();
      // Navigate to the new data room
      setLocation(`/dataroom/${data.id}`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = trpc.dataRoom.delete.useMutation({
    onSuccess: () => {
      toast.success("Data room deleted");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleCreate = () => {
    if (!newRoom.name || !newRoom.slug) {
      toast.error("Name and slug are required");
      return;
    }
    createMutation.mutate({
      ...newRoom,
      password: newRoom.password || undefined,
    });
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  };

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/dataroom/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  };

  return (
    <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Data Rooms</h1>
            <p className="text-muted-foreground mt-1">
              Securely share documents with granular permissions and analytics
            </p>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Data Room
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create New Data Room</DialogTitle>
                <DialogDescription>
                  Set up a secure space to share documents with external parties
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="Series A Due Diligence"
                    value={newRoom.name}
                    onChange={(e) => {
                      setNewRoom({ 
                        ...newRoom, 
                        name: e.target.value,
                        slug: newRoom.slug || generateSlug(e.target.value),
                      });
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">URL Slug</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">/dataroom/</span>
                    <Input
                      id="slug"
                      placeholder="series-a-dd"
                      value={newRoom.slug}
                      onChange={(e) => setNewRoom({ ...newRoom, slug: generateSlug(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Documents for investor due diligence..."
                    value={newRoom.description}
                    onChange={(e) => setNewRoom({ ...newRoom, description: e.target.value })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Password Protection</Label>
                    <p className="text-sm text-muted-foreground">Require password to access</p>
                  </div>
                  <Input
                    type="password"
                    placeholder="Optional password"
                    className="w-40"
                    value={newRoom.password}
                    onChange={(e) => setNewRoom({ ...newRoom, password: e.target.value })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Require NDA</Label>
                    <p className="text-sm text-muted-foreground">Visitors must accept NDA</p>
                  </div>
                  <Switch
                    checked={newRoom.requiresNda}
                    onCheckedChange={(checked) => setNewRoom({ ...newRoom, requiresNda: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Allow Downloads</Label>
                    <p className="text-sm text-muted-foreground">Visitors can download files</p>
                  </div>
                  <Switch
                    checked={newRoom.allowDownload}
                    onCheckedChange={(checked) => setNewRoom({ ...newRoom, allowDownload: checked })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create Data Room"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between w-full">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Rooms</CardTitle>
              <AITriggerButton message="Analyze our data rooms - classify documents, suggest access permissions, and identify security risks" label="AI Data Room Analysis" />
            </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dataRooms?.length || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {dataRooms?.filter(r => r.status === 'active').length || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Password Protected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dataRooms?.filter(r => r.password).length || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">NDA Required</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dataRooms?.filter(r => r.requiresNda).length || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Data Rooms List */}
        <Card>
          <CardHeader>
            <CardTitle>Your Data Rooms</CardTitle>
            <CardDescription>
              Manage and monitor your secure document sharing spaces
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : !dataRooms?.length ? (
              <div className="text-center py-12">
                <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No data rooms yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first data room to start sharing documents securely
                </p>
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Data Room
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Security</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dataRooms.map((room) => (
                    <TableRow key={room.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{room.name}</div>
                          <div className="text-sm text-muted-foreground">/dataroom/{room.slug}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={room.status === 'active' ? 'default' : room.status === 'archived' ? 'secondary' : 'outline'}>
                          {room.status === 'active' && <Globe className="h-3 w-3 mr-1" />}
                          {room.status === 'archived' && <Archive className="h-3 w-3 mr-1" />}
                          {room.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {room.password && (
                            <Badge variant="outline" className="text-xs">
                              <Lock className="h-3 w-3 mr-1" />
                              Password
                            </Badge>
                          )}
                          {room.requiresNda && (
                            <Badge variant="outline" className="text-xs">
                              <FileText className="h-3 w-3 mr-1" />
                              NDA
                            </Badge>
                          )}
                          {!room.allowDownload && (
                            <Badge variant="outline" className="text-xs">
                              <Download className="h-3 w-3 mr-1 line-through" />
                              No DL
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {new Date(room.createdAt).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copyLink(room.slug)}
                            title="Copy link"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(`/dataroom/${room.slug}`, '_blank')}
                            title="Open in new tab"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setLocation(`/dataroom/${room.id}`)}
                            title="Manage"
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this data room?')) {
                                deleteMutation.mutate({ id: room.id });
                              }
                            }}
                            title="Delete"
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
      </div>
  );
}
