import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, FolderLock, FileText, ExternalLink, Search, Folder } from "lucide-react";

function formatSize(bytes?: number | null): string {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// Read-only documents view for contractor users. Reads only the data-room
// folders/documents the server has scoped to this user (role visibility +
// individual grants). Files open at their Google Drive / storage link.
export default function ContractorDocuments() {
  const { data, isLoading } = trpc.dataRoom.contractor.getContent.useQuery();
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const folders = data?.folders ?? [];
  const documents = data?.documents ?? [];

  const activeFolderId = selectedFolderId ?? folders[0]?.id ?? null;

  const countByFolder = useMemo(() => {
    const counts = new Map<number, number>();
    for (const d of documents) {
      if (d.folderId != null) counts.set(d.folderId, (counts.get(d.folderId) ?? 0) + 1);
    }
    return counts;
  }, [documents]);

  const visibleDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter(
      (d) => d.folderId === activeFolderId && (!q || d.name.toLowerCase().includes(q)),
    );
  }, [documents, activeFolderId, search]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (folders.length === 0) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-16 text-center">
            <FolderLock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">No documents have been shared with you yet.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Documents</h1>
        <p className="text-muted-foreground">Files and folders shared with you</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_1fr]">
        {/* Folder list */}
        <Card className="h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Folders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 p-2">
            {folders.map((f) => {
              const active = f.id === activeFolderId;
              return (
                <button
                  key={f.id}
                  onClick={() => setSelectedFolderId(f.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    active ? "bg-muted font-medium" : "hover:bg-muted/60"
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{f.name}</span>
                  </span>
                  <Badge variant="secondary" className="shrink-0">
                    {countByFolder.get(f.id) ?? 0}
                  </Badge>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Documents in the active folder */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents…"
              className="pl-9"
            />
          </div>

          <Card>
            <CardContent className="p-0">
              {visibleDocs.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  {search ? "No documents match your search." : "This folder is empty."}
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {visibleDocs.map((d) => {
                    const href = d.googleDriveWebViewLink || d.storageUrl || "";
                    return (
                      <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{d.name}</div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {d.fileType && <span className="uppercase">{d.fileType}</span>}
                              {d.fileSize ? <span>· {formatSize(d.fileSize)}</span> : null}
                            </div>
                          </div>
                        </div>
                        {href ? (
                          <Button asChild variant="outline" size="sm" className="shrink-0">
                            <a href={href} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                              Open
                            </a>
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" disabled className="shrink-0">
                            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                            Open
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
