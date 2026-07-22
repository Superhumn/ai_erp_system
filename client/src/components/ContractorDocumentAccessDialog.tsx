import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";

const CONTRACTOR_ROLE = "contractor";

type FolderRow = {
  id: number;
  name: string;
  dataRoomId: number;
  dataRoomName: string | null;
  visibleToRoles: unknown;
};

type Props = {
  userId: number | null;
  userName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function isRoleVisible(roles: unknown): boolean {
  return Array.isArray(roles) && roles.includes(CONTRACTOR_ROLE);
}

// Admin dialog to assign data-room folder access to a single contractor user.
// Combines the two "both" controls: per-user Allow/Restrict grants, and a
// per-folder "All contractors" role-wide visibility toggle.
export function ContractorDocumentAccessDialog({ userId, userName, open, onOpenChange }: Props) {
  const utils = trpc.useUtils();
  const enabled = open && userId != null;

  const { data: folders, isLoading: loadingFolders } =
    trpc.dataRoom.contractor.listAllFolders.useQuery(undefined, { enabled });
  const { data: grants, isLoading: loadingGrants } =
    trpc.dataRoom.contractor.listGrants.useQuery({ userId: userId ?? 0 }, { enabled });

  const invalidateGrants = () =>
    utils.dataRoom.contractor.listGrants.invalidate({ userId: userId ?? 0 });

  const setGrant = trpc.dataRoom.contractor.setGrant.useMutation({
    onSuccess: invalidateGrants,
    onError: (e) => toast.error(e.message),
  });
  const removeGrant = trpc.dataRoom.contractor.removeGrant.useMutation({
    onSuccess: invalidateGrants,
    onError: (e) => toast.error(e.message),
  });
  const setVisibility = trpc.dataRoom.contractor.setFolderVisibility.useMutation({
    onSuccess: () => utils.dataRoom.contractor.listAllFolders.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const grantByFolder = useMemo(() => {
    const m = new Map<number, "allow" | "restrict">();
    for (const g of grants ?? []) m.set(g.folderId, g.mode as "allow" | "restrict");
    return m;
  }, [grants]);

  const grouped = useMemo(() => {
    const map = new Map<string, FolderRow[]>();
    for (const f of (folders ?? []) as FolderRow[]) {
      const key = f.dataRoomName ?? "Unassigned";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return Array.from(map.entries());
  }, [folders]);

  const perUserValue = (folderId: number): "default" | "allow" | "restrict" =>
    grantByFolder.get(folderId) ?? "default";

  const onPerUserChange = (folderId: number, value: string) => {
    if (userId == null) return;
    if (value === "default") removeGrant.mutate({ userId, folderId });
    else setGrant.mutate({ userId, folderId, mode: value as "allow" | "restrict" });
  };

  const toggleRoleVisible = (folderId: number, currentRoles: unknown) => {
    const arr = Array.isArray(currentRoles)
      ? currentRoles.filter((r): r is string => typeof r === "string")
      : [];
    const next = arr.includes(CONTRACTOR_ROLE)
      ? arr.filter((r) => r !== CONTRACTOR_ROLE)
      : [...arr, CONTRACTOR_ROLE];
    setVisibility.mutate({ folderId, visibleToRoles: next });
  };

  const loading = loadingFolders || loadingGrants;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Document access — {userName}</DialogTitle>
          <DialogDescription>
            Choose which data-room folders this contractor can see. “All contractors” makes a folder
            visible to every contractor; the per-user setting overrides it (Restrict always wins).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : ((folders ?? []) as FolderRow[]).length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">No data-room folders exist yet.</p>
        ) : (
          <div className="space-y-5">
            {grouped.map(([roomName, roomFolders]) => (
              <div key={roomName}>
                <h4 className="mb-2 text-sm font-semibold text-muted-foreground">{roomName}</h4>
                <div className="space-y-2">
                  {roomFolders.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{f.name}</div>
                        {isRoleVisible(f.visibleToRoles) && (
                          <Badge variant="secondary" className="mt-0.5 text-xs">
                            All contractors
                          </Badge>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          type="button"
                          variant={isRoleVisible(f.visibleToRoles) ? "secondary" : "outline"}
                          size="sm"
                          onClick={() => toggleRoleVisible(f.id, f.visibleToRoles)}
                        >
                          <Users className="mr-1.5 h-3.5 w-3.5" />
                          All
                        </Button>
                        <Select
                          value={perUserValue(f.id)}
                          onValueChange={(v) => onPerUserChange(f.id, v)}
                        >
                          <SelectTrigger className="w-[130px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default">Default</SelectItem>
                            <SelectItem value="allow">Allow</SelectItem>
                            <SelectItem value="restrict">Restrict</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
