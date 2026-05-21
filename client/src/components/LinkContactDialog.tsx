import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: number;
  vendorName: string;
  vendorPhone?: string | null;
  onLinked: (contact: { id: number; fullName?: string | null; whatsappNumber?: string | null; phone?: string | null }) => void;
}

export default function LinkContactDialog({ open, onOpenChange, vendorId, vendorName, vendorPhone, onLinked }: Props) {
  const [mode, setMode] = useState<"search" | "create">("search");
  const [search, setSearch] = useState("");
  const [newContact, setNewContact] = useState({
    firstName: "",
    lastName: "",
    whatsappNumber: vendorPhone || "",
    organization: vendorName,
  });

  const { data: contactsRaw, isLoading } = trpc.crm.contacts.list.useQuery(
    { search: search || undefined, limit: 20 },
    { enabled: open && mode === "search" }
  );
  const contacts = (contactsRaw as any[] | undefined) || [];

  const utils = trpc.useUtils();
  const linkMutation = trpc.vendors.linkContact.useMutation({
    onSuccess: () => {
      utils.vendors.list.invalidate();
    },
  });
  const createMutation = trpc.crm.contacts.create.useMutation();

  async function handlePickExisting(contact: any) {
    try {
      await linkMutation.mutateAsync({ vendorId, contactId: contact.id });
      toast.success(`Linked ${contact.fullName || "contact"} to ${vendorName}`);
      onLinked(contact);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to link contact");
    }
  }

  async function handleCreateAndLink() {
    if (!newContact.firstName.trim()) {
      toast.error("First name is required");
      return;
    }
    if (!newContact.whatsappNumber.trim()) {
      toast.error("WhatsApp number is required");
      return;
    }
    try {
      const result = await createMutation.mutateAsync({
        firstName: newContact.firstName.trim(),
        lastName: newContact.lastName.trim() || undefined,
        whatsappNumber: newContact.whatsappNumber.trim(),
        organization: newContact.organization.trim() || undefined,
        contactType: "vendor",
        source: "manual",
      });
      await linkMutation.mutateAsync({
        vendorId,
        contactId: result.id,
        whatsappNumber: newContact.whatsappNumber.trim(),
      });
      toast.success(`Created and linked contact to ${vendorName}`);
      onLinked({
        id: result.id,
        fullName: `${newContact.firstName} ${newContact.lastName}`.trim(),
        whatsappNumber: newContact.whatsappNumber.trim(),
      });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create contact");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link WhatsApp contact</DialogTitle>
          <DialogDescription>
            No CRM contact matched <span className="font-medium">{vendorName}</span>'s phone. Pick an existing one or create a new contact.
          </DialogDescription>
        </DialogHeader>

        {mode === "search" ? (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts by name, phone, email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>

            <div className="max-h-64 overflow-y-auto border rounded">
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : contacts.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-6">No contacts found.</div>
              ) : (
                contacts.map((c: any) => {
                  const hasWa = c.whatsappNumber || c.phone;
                  return (
                    <button
                      key={c.id}
                      onClick={() => handlePickExisting(c)}
                      disabled={!hasWa || linkMutation.isPending}
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 border-b last:border-b-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="text-sm font-medium">{c.fullName || c.firstName || "Unnamed"}</div>
                      <div className="text-xs text-muted-foreground flex gap-2">
                        {c.organization && <span>{c.organization}</span>}
                        {hasWa ? (
                          <span className="font-mono">{c.whatsappNumber || c.phone}</span>
                        ) : (
                          <span className="text-amber-600">no WhatsApp number</span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setMode("create")}>
                <UserPlus className="h-4 w-4 mr-1.5" />
                Add new contact
              </Button>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="newFirstName" className="text-xs">First name *</Label>
                <Input id="newFirstName" value={newContact.firstName} onChange={(e) => setNewContact({ ...newContact, firstName: e.target.value })} autoFocus />
              </div>
              <div>
                <Label htmlFor="newLastName" className="text-xs">Last name</Label>
                <Input id="newLastName" value={newContact.lastName} onChange={(e) => setNewContact({ ...newContact, lastName: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="newWhatsapp" className="text-xs">WhatsApp number *</Label>
                <Input id="newWhatsapp" placeholder="+86…" value={newContact.whatsappNumber} onChange={(e) => setNewContact({ ...newContact, whatsappNumber: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="newOrg" className="text-xs">Company</Label>
                <Input id="newOrg" value={newContact.organization} onChange={(e) => setNewContact({ ...newContact, organization: e.target.value })} />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setMode("search")}>Back</Button>
              <Button onClick={handleCreateAndLink} disabled={createMutation.isPending || linkMutation.isPending}>
                {(createMutation.isPending || linkMutation.isPending) && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Create and link
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
