import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { SpreadsheetTable, Column } from "@/components/SpreadsheetTable";
import { DetailSheet } from "@/components/DetailSheet";
import { Truck, Plus, Loader2, Paperclip, FileText, Trash2, Upload, Download, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

/** Convert an ArrayBuffer to a base64 string using chunked encoding to avoid
 *  call-stack overflows with large files. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}

const documentTypeOptions = [
  { value: "packing_list", label: "Packing List" },
  { value: "bol", label: "Bill of Lading" },
  { value: "invoice", label: "Invoice" },
  { value: "receipt", label: "Receipt" },
  { value: "freight", label: "Freight Doc" },
  { value: "customs", label: "Customs Doc" },
  { value: "certificate", label: "Certificate" },
  { value: "other", label: "Other" },
] as const;

function formatBytes(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const statusOptions = [
  { value: "pending", label: "Pending", color: "bg-gray-500/8 text-gray-600 dark:text-gray-400" },
  { value: "in_transit", label: "In Transit", color: "bg-amber-500/8 text-amber-600 dark:text-amber-400" },
  { value: "delivered", label: "Delivered", color: "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400" },
  { value: "returned", label: "Returned", color: "bg-violet-500/8 text-violet-600 dark:text-violet-400" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-500/8 text-red-600 dark:text-red-400" },
];

const typeOptions = [
  { value: "inbound", label: "Inbound", color: "bg-blue-500/10 text-blue-600" },
  { value: "outbound", label: "Outbound", color: "bg-green-500/10 text-green-600" },
];

function ShipmentSummaryBody({ s, materialLabel }: { s: any; materialLabel?: string | null }) {
  return (
    <div className="space-y-4">
      {s.type === "inbound" && s.rawMaterialId && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Raw Material (links to inventory)</div>
          <div className="font-medium flex items-center justify-between gap-2">
            <span>{materialLabel || `Material #${s.rawMaterialId}`}</span>
            {s.quantity && (
              <Badge variant="secondary">{Number(s.quantity)} units</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {s.status === "delivered"
              ? "Quantity received into inventory."
              : s.status === "cancelled" || s.status === "returned"
              ? "Reservation released."
              : "Reserved as in-transit until marked delivered."}
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Carrier</div>
          <div className="font-medium">{s.carrier || "—"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Tracking</div>
          <div className="font-mono text-sm">{s.trackingNumber || "—"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Ship Date</div>
          <div className="font-medium">
            {s.shipDate ? format(new Date(s.shipDate), "MMM d, yyyy") : "—"}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Delivery Date</div>
          <div className="font-medium">
            {s.deliveryDate ? format(new Date(s.deliveryDate), "MMM d, yyyy") : "—"}
          </div>
        </div>
      </div>
      {s.notes && (
        <div>
          <h4 className="text-sm font-medium mb-1">Notes</h4>
          <p className="text-sm text-muted-foreground bg-muted/30 rounded p-2 whitespace-pre-wrap">
            {s.notes}
          </p>
        </div>
      )}
    </div>
  );
}

/** Editable status control. Marking an inbound material shipment "delivered"
 *  receives its quantity into inventory (handled server-side). */
function ShipmentStatusControl({ s, onUpdated }: { s: any; onUpdated: (patch: any) => void }) {
  const update = trpc.shipments.update.useMutation({
    onSuccess: (_data, variables) => {
      toast.success("Shipment status updated");
      onUpdated(variables);
    },
    onError: (err: any) => toast.error(err.message),
  });
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Status</h4>
      <Select
        value={s.status}
        onValueChange={(value) =>
          update.mutate({
            id: s.id,
            status: value as any,
            ...(value === "delivered" ? { deliveryDate: new Date() } : {}),
          })
        }
        disabled={update.isPending}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {statusOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {s.type === "inbound" && s.rawMaterialId && s.status !== "delivered" && (
        <p className="text-xs text-muted-foreground">
          Marking this delivered will receive {s.quantity ? Number(s.quantity) : ""} units into inventory.
        </p>
      )}
    </div>
  );
}

/** "Message supplier on WhatsApp" — opens WhatsApp (app or web) pre-filled with
 *  shipment context. Works with a plain phone app today; when the WhatsApp
 *  Business API is configured the same supplier is reachable in-app too. */
function ShipmentSupplierWhatsApp({
  shipment,
  material,
  vendor,
}: {
  shipment: any;
  material: any;
  vendor: any;
}) {
  const waNumber: string = vendor?.whatsappNumber || vendor?.phone || "";
  const digits = waNumber.replace(/[^\d]/g, "");
  if (!vendor || !digits) {
    return (
      <div className="space-y-2">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          Supplier
        </h4>
        <p className="text-sm text-muted-foreground bg-muted/30 rounded p-3">
          {!material?.rawMaterialId && !shipment.rawMaterialId
            ? "Link a raw material to this shipment to reach its supplier."
            : !vendor
            ? "No preferred vendor set on this material — add one on the Raw Materials page."
            : "This vendor has no WhatsApp number or phone on file."}
        </p>
      </div>
    );
  }

  const qty = shipment.quantity ? `${Number(shipment.quantity)} ${material?.unit || ""}`.trim() : "";
  const text = [
    `Hi${vendor.contactName ? ` ${vendor.contactName}` : ""}, re shipment ${shipment.shipmentNumber}`,
    material?.name ? `Material: ${material.name}${qty ? ` (${qty})` : ""}` : "",
    shipment.trackingNumber ? `Tracking: ${shipment.trackingNumber}` : "",
    `Current status: ${shipment.status}.`,
  ]
    .filter(Boolean)
    .join("\n");
  const href = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium flex items-center gap-2">
        <MessageCircle className="h-4 w-4" />
        Supplier
      </h4>
      <div className="rounded-lg border p-3 text-sm flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate">{vendor.name}</div>
          <div className="text-xs text-muted-foreground truncate">{waNumber}</div>
        </div>
        <a href={href} target="_blank" rel="noreferrer">
          <Button size="sm" className="bg-[#25D366] hover:bg-[#1da851] text-white">
            <MessageCircle className="h-4 w-4 mr-2" />
            WhatsApp
          </Button>
        </a>
      </div>
      <p className="text-xs text-muted-foreground">
        Opens WhatsApp with shipment details pre-filled.
      </p>
    </div>
  );
}

/** Documents attached to a shipment — packing lists, BOLs, invoices, etc. */
function ShipmentDocuments({ shipmentId }: { shipmentId: number }) {
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<string>("packing_list");

  const { data: documents, isLoading } = trpc.documents.list.useQuery({
    referenceType: "shipment",
    referenceId: shipmentId,
  });

  const invalidate = () =>
    utils.documents.list.invalidate({ referenceType: "shipment", referenceId: shipmentId });

  const upload = trpc.documents.upload.useMutation({
    onSuccess: () => {
      toast.success("Document attached");
      invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteDoc = trpc.documents.delete.useMutation({
    onSuccess: () => {
      toast.success("Document removed");
      invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      toast.error("File too large (max 15MB)");
      e.target.value = "";
      return;
    }
    try {
      const fileData = arrayBufferToBase64(await file.arrayBuffer());
      await upload.mutateAsync({
        name: file.name,
        type: docType as any,
        referenceType: "shipment",
        referenceId: shipmentId,
        fileData,
        mimeType: file.type || "application/octet-stream",
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const docs = (documents || []) as any[];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Paperclip className="h-4 w-4" />
          Documents
          {docs.length > 0 && <span className="text-muted-foreground">({docs.length})</span>}
        </h4>
      </div>

      <div className="flex items-center gap-2">
        <Select value={docType} onValueChange={setDocType}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {documentTypeOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFile} />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={upload.isPending}
        >
          {upload.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          Attach
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground bg-muted/30 rounded p-3">
          No documents attached yet. Attach a packing list, BOL, or invoice.
        </p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => {
            const typeLabel =
              documentTypeOptions.find((o) => o.value === d.type)?.label || d.type;
            return (
              <li
                key={d.id}
                className="flex items-center gap-2 rounded-lg border p-2 text-sm"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{d.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {typeLabel}
                    {d.fileSize ? ` · ${formatBytes(d.fileSize)}` : ""}
                    {d.createdAt ? ` · ${format(new Date(d.createdAt), "MMM d, yyyy")}` : ""}
                  </div>
                </div>
                {d.fileUrl && (
                  <a href={d.fileUrl} target="_blank" rel="noreferrer" download={d.name}>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Download className="h-4 w-4" />
                    </Button>
                  </a>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => deleteDoc.mutate({ id: d.id })}
                  disabled={deleteDoc.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function Shipments() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    type: "outbound" as "inbound" | "outbound",
    rawMaterialId: "",
    quantity: "",
    carrier: "",
    trackingNumber: "",
    shipDate: "",
    deliveryDate: "",
    notes: "",
  });

  const utils = trpc.useUtils();
  const { data: shipments, isLoading } = trpc.shipments.list.useQuery();
  const { data: rawMaterials } = trpc.rawMaterials.list.useQuery();
  const { data: vendors } = trpc.vendors.list.useQuery();
  const materialsById = useMemo(() => {
    const map = new Map<number, any>();
    ((rawMaterials || []) as any[]).forEach((m) => map.set(m.id, m));
    return map;
  }, [rawMaterials]);
  const vendorsById = useMemo(() => {
    const map = new Map<number, any>();
    ((vendors || []) as any[]).forEach((v) => map.set(v.id, v));
    return map;
  }, [vendors]);
  const materialLabel = (m: any) =>
    m ? `${m.name}${m.unit ? ` (${m.unit})` : ""}` : null;

  const createShipment = trpc.shipments.create.useMutation({
    onSuccess: () => {
      toast.success("Shipment created successfully");
      setIsOpen(false);
      setFormData({
        type: "outbound", rawMaterialId: "", quantity: "", carrier: "", trackingNumber: "",
        shipDate: "", deliveryDate: "", notes: "",
      });
      utils.shipments.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteShipment = trpc.shipments.delete.useMutation({
    onSuccess: () => {
      toast.success("Shipment deleted");
      utils.shipments.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const counts = useMemo(() => {
    const list = (shipments || []) as any[];
    return {
      total: list.length,
      pending: list.filter((s) => s.status === "pending").length,
      inTransit: list.filter((s) => s.status === "in_transit").length,
      delivered: list.filter((s) => s.status === "delivered").length,
    };
  }, [shipments]);

  const columns: Column<any>[] = [
    { key: "shipmentNumber", header: "Shipment #", type: "text", sortable: true },
    { key: "type", header: "Type", type: "badge", options: typeOptions, filterable: true },
    {
      key: "rawMaterialId",
      header: "Material",
      type: "text",
      render: (row) => {
        if (!row.rawMaterialId) return "—";
        const m = materialsById.get(row.rawMaterialId);
        const name = m?.name || `#${row.rawMaterialId}`;
        return row.quantity ? `${name} · ${Number(row.quantity)}` : name;
      },
    },
    { key: "carrier", header: "Carrier", type: "text", sortable: true },
    { key: "trackingNumber", header: "Tracking", type: "text" },
    { key: "shipDate", header: "Ship Date", type: "date", sortable: true },
    { key: "deliveryDate", header: "Delivery", type: "date", sortable: true },
    { key: "status", header: "Status", type: "status", options: statusOptions, filterable: true },
    {
      key: "notes",
      header: "Notes",
      type: "text",
      render: (_row, val) => {
        const s = typeof val === "string" ? val : "";
        return s.length > 40 ? s.slice(0, 40) + "…" : s || "—";
      },
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isInbound = formData.type === "inbound";
    createShipment.mutate({
      type: formData.type,
      rawMaterialId: isInbound && formData.rawMaterialId ? Number(formData.rawMaterialId) : undefined,
      quantity: isInbound && formData.rawMaterialId && formData.quantity ? formData.quantity : undefined,
      carrier: formData.carrier || undefined,
      trackingNumber: formData.trackingNumber || undefined,
      shipDate: formData.shipDate ? new Date(formData.shipDate) : undefined,
      notes: formData.notes || undefined,
    });
  };

  const selectedStatus = selectedShipment
    ? statusOptions.find((s) => s.value === selectedShipment.status)
    : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Truck className="h-8 w-8" />
            Shipments
          </h1>
          <p className="text-muted-foreground mt-1">
            Track shipments and logistics — click any row for details.
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Shipment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>New Shipment</DialogTitle>
                <DialogDescription>Create a new shipment record.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
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
                        <SelectItem value="inbound">Inbound</SelectItem>
                        <SelectItem value="outbound">Outbound</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="carrier">Carrier</Label>
                    <Input
                      id="carrier"
                      value={formData.carrier}
                      onChange={(e) => setFormData({ ...formData, carrier: e.target.value })}
                      placeholder="UPS, FedEx, etc."
                    />
                  </div>
                </div>
                {formData.type === "inbound" && (
                  <div className="grid grid-cols-2 gap-4 rounded-lg border border-dashed p-3">
                    <div className="space-y-2">
                      <Label htmlFor="rawMaterial">Raw Material</Label>
                      <Select
                        value={formData.rawMaterialId}
                        onValueChange={(value) => setFormData({ ...formData, rawMaterialId: value })}
                      >
                        <SelectTrigger id="rawMaterial">
                          <SelectValue placeholder="None (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {((rawMaterials || []) as any[]).map((m) => (
                            <SelectItem key={m.id} value={String(m.id)}>
                              {m.name}
                              {m.unit ? ` (${m.unit})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="quantity">Quantity</Label>
                      <Input
                        id="quantity"
                        type="number"
                        min="0"
                        step="any"
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                        placeholder="e.g. 5"
                        disabled={!formData.rawMaterialId}
                      />
                    </div>
                    <p className="col-span-2 text-xs text-muted-foreground">
                      Linking a material reserves the quantity as in-transit; marking the shipment
                      delivered receives it into inventory.
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="trackingNumber">Tracking Number</Label>
                  <Input
                    id="trackingNumber"
                    value={formData.trackingNumber}
                    onChange={(e) => setFormData({ ...formData, trackingNumber: e.target.value })}
                    placeholder="Tracking number"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="shipDate">Ship Date</Label>
                    <Input
                      id="shipDate"
                      type="date"
                      value={formData.shipDate}
                      onChange={(e) => setFormData({ ...formData, shipDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deliveryDate">Delivery Date</Label>
                    <Input
                      id="deliveryDate"
                      type="date"
                      value={formData.deliveryDate}
                      onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional notes..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createShipment.isPending}>
                  {createShipment.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Shipment
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xl font-semibold tracking-[-0.02em]">{counts.total}</div>
            <p className="text-xs text-muted-foreground">Total Shipments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xl font-semibold tracking-[-0.02em] text-gray-600">{counts.pending}</div>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xl font-semibold tracking-[-0.02em] text-amber-600">{counts.inTransit}</div>
            <p className="text-xs text-muted-foreground">In Transit</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xl font-semibold tracking-[-0.02em] text-green-600">{counts.delivered}</div>
            <p className="text-xs text-muted-foreground">Delivered</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <SpreadsheetTable
            data={(shipments || []) as any[]}
            columns={columns}
            isLoading={isLoading}
            emptyMessage="No shipments yet — create your first shipment to get started."
            showSearch
            showFilters
            showExport
            onRowClick={(row) => setSelectedShipment(row)}
            expandedRowId={selectedShipment?.id ?? null}
            compact
            bulkActions={[{ key: "delete", label: "Delete", variant: "destructive" }]}
            onBulkAction={(action, ids) => {
              if (action === "delete") {
                Array.from(ids).forEach((id) => deleteShipment.mutate({ id: Number(id) }));
              }
            }}
          />
        </CardContent>
      </Card>

      <DetailSheet
        open={!!selectedShipment}
        onOpenChange={(o) => !o && setSelectedShipment(null)}
        width="md"
        title={
          selectedShipment && (
            <span className="flex items-center gap-2 font-mono">
              {selectedShipment.shipmentNumber}
              {selectedStatus && (
                <Badge className={selectedStatus.color}>{selectedStatus.label}</Badge>
              )}
            </span>
          )
        }
        subtitle={selectedShipment?.type && (selectedShipment.type === "inbound" ? "Inbound" : "Outbound")}
      >
        {selectedShipment && (
          <div className="space-y-6">
            <ShipmentSummaryBody
              s={selectedShipment}
              materialLabel={
                selectedShipment.rawMaterialId
                  ? materialLabel(materialsById.get(selectedShipment.rawMaterialId))
                  : null
              }
            />
            <ShipmentStatusControl
              s={selectedShipment}
              onUpdated={(patch) => {
                utils.shipments.list.invalidate();
                utils.rawMaterials.list.invalidate();
                setSelectedShipment((prev: any) => (prev ? { ...prev, ...patch } : prev));
              }}
            />
            {selectedShipment.type === "inbound" && (
              <ShipmentSupplierWhatsApp
                shipment={selectedShipment}
                material={
                  selectedShipment.rawMaterialId
                    ? materialsById.get(selectedShipment.rawMaterialId)
                    : null
                }
                vendor={(() => {
                  const m = selectedShipment.rawMaterialId
                    ? materialsById.get(selectedShipment.rawMaterialId)
                    : null;
                  return m?.preferredVendorId ? vendorsById.get(m.preferredVendorId) : null;
                })()}
              />
            )}
            <ShipmentDocuments shipmentId={selectedShipment.id} />
          </div>
        )}
      </DetailSheet>
    </div>
  );
}
