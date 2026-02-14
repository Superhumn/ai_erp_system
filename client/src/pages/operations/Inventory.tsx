import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AITriggerButton } from "@/components/FloatingAIAssistant";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Warehouse, Search, Loader2, AlertTriangle } from "lucide-react";

export default function Inventory() {
  const [search, setSearch] = useState("");

  const { data: inventory, isLoading } = trpc.inventory.list.useQuery();

  const filteredInventory = inventory?.filter((item) =>
    item.productId?.toString().includes(search.toLowerCase()) ||
    item.warehouseId?.toString().includes(search.toLowerCase())
  );

  const getStockStatus = (quantity: string | null, reorderPoint: string | null) => {
    const qty = parseFloat(quantity || "0");
    const reorder = parseFloat(reorderPoint || "0");
    
    if (qty <= 0) return { label: "Out of Stock", color: "bg-red-500/10 text-red-600" };
    if (qty <= reorder) return { label: "Low Stock", color: "bg-amber-500/10 text-amber-600" };
    return { label: "In Stock", color: "bg-green-500/10 text-green-600" };
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Warehouse className="h-8 w-8" />
            Inventory
          </h1>
          <p className="text-muted-foreground mt-1">
            Track stock levels and manage inventory across locations.
          </p>
        </div>
        <AITriggerButton message="Analyze inventory levels - show low stock items, total value, and reorder recommendations" label="AI Analysis" />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{inventory?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Total SKUs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
              {inventory?.filter(i => parseFloat(i.quantity || "0") > parseFloat(i.reorderLevel || "0")).length || 0}
            </div>
            <p className="text-xs text-muted-foreground">In Stock</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-amber-600">
              {inventory?.filter(i => {
                const qty = parseFloat(i.quantity || "0");
                const reorder = parseFloat(i.reorderLevel || "0");
                return qty > 0 && qty <= reorder;
              }).length || 0}
            </div>
            <p className="text-xs text-muted-foreground">Low Stock</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">
              {inventory?.filter(i => parseFloat(i.quantity || "0") <= 0).length || 0}
            </div>
            <p className="text-xs text-muted-foreground">Out of Stock</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search inventory..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !filteredInventory || filteredInventory.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Warehouse className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No inventory records found</p>
              <p className="text-sm">Inventory will be tracked as products are added.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product ID</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">On Hand</TableHead>
                  <TableHead className="text-right">Reserved</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Reorder Point</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInventory.map((item) => {
                  const status = getStockStatus(item.quantity, item.reorderLevel);
                  const available = parseFloat(item.quantity || "0") - parseFloat(item.reservedQuantity || "0");
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono">#{item.productId}</TableCell>
                      <TableCell>Warehouse #{item.warehouseId || "-"}</TableCell>
                      <TableCell className="text-right font-mono">{item.quantity || "0"}</TableCell>
                      <TableCell className="text-right font-mono">{item.reservedQuantity || "0"}</TableCell>
                      <TableCell className="text-right font-mono">{available.toFixed(0)}</TableCell>
                      <TableCell className="text-right font-mono">{item.reorderLevel || "-"}</TableCell>
                      <TableCell>
                        <Badge className={status.color}>
                          {status.label === "Low Stock" && <AlertTriangle className="h-3 w-3 mr-1" />}
                          {status.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
