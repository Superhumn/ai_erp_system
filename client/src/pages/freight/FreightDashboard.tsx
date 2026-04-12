import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Truck, FileText, Package, ClipboardList, Building2,
  AlertCircle, Plus, Loader2, Search, Ship, Plane,
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";

export default function FreightDashboard() {
  const [tab, setTab] = useState("rfqs");
  const [search, setSearch] = useState("");

  const { data: stats, isLoading } = trpc.freight.dashboardStats.useQuery();
  const { data: rfqs } = trpc.freight.rfqs.list.useQuery({ status: undefined });
  const { data: bookings } = trpc.freight.bookings.list.useQuery({});
  const { data: clearances } = trpc.customs.clearances.list.useQuery({});
  const { data: carriers } = trpc.freight.carriers.list.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const q = search.toLowerCase();

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header + KPIs inline */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[1.875rem] font-bold tracking-[-0.03em]">Freight & Logistics</h1>
          <p className="text-muted-foreground text-sm">Shipments, quotes, carriers, and customs</p>
        </div>
        <div className="flex gap-2">
          <Link href="/freight/tracking">
            <Button variant="outline">
              <Package className="h-4 w-4 mr-2" />
              Track
            </Button>
          </Link>
          <Link href="/freight/fda">
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-2" />
              FDA Notice
            </Button>
          </Link>
          <Link href="/freight/rfqs/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New RFQ
            </Button>
          </Link>
        </div>
      </div>

      {/* Compact KPI bar */}
      <div className="flex items-center gap-5 flex-wrap text-sm border rounded-xl px-4 py-3 bg-card">
        <div>
          <span className="text-xs text-muted-foreground">Active RFQs</span>
          <div className="font-bold text-base">{stats?.activeRfqs || 0}</div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <span className="text-xs text-muted-foreground">Pending Quotes</span>
          <div className="font-bold text-base">{stats?.pendingQuotes || 0}</div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <span className="text-xs text-muted-foreground">In Transit</span>
          <div className="font-bold text-base">{stats?.activeBookings || 0}</div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <span className="text-xs text-muted-foreground">Clearances</span>
          <div className="font-bold text-base">{stats?.pendingClearances || 0}</div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div>
          <span className="text-xs text-muted-foreground">Carriers</span>
          <div className="font-bold text-base">{stats?.totalCarriers || 0}</div>
        </div>
      </div>

      {/* Single tabbed view */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="rfqs" className="flex items-center gap-1.5">
                  <ClipboardList className="h-3.5 w-3.5" />
                  RFQs
                </TabsTrigger>
                <TabsTrigger value="bookings" className="flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" />
                  Bookings
                </TabsTrigger>
                <TabsTrigger value="clearances" className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Customs
                </TabsTrigger>
                <TabsTrigger value="carriers" className="flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5" />
                  Carriers
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* RFQs Tab */}
          {tab === "rfqs" && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>RFQ #</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Origin</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rfqs && rfqs.length > 0 ? (
                  rfqs
                    .filter((r: any) => !q || r.rfqNumber?.toLowerCase().includes(q) || r.title?.toLowerCase().includes(q))
                    .map((rfq: any) => (
                      <TableRow key={rfq.id} className="cursor-pointer hover:bg-muted/50" onClick={() => window.location.href = `/freight/rfqs/${rfq.id}`}>
                        <TableCell className="font-mono text-primary">{rfq.rfqNumber}</TableCell>
                        <TableCell className="font-medium">{rfq.title || "-"}</TableCell>
                        <TableCell>{rfq.originPort || rfq.origin || "-"}</TableCell>
                        <TableCell>{rfq.destinationPort || rfq.destination || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {rfq.mode === "ocean" ? <Ship className="h-3 w-3 mr-1 inline" /> :
                             rfq.mode === "air" ? <Plane className="h-3 w-3 mr-1 inline" /> :
                             <Truck className="h-3 w-3 mr-1 inline" />}
                            {rfq.mode || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell><Badge>{(rfq.status || "draft").replace(/_/g, " ")}</Badge></TableCell>
                      </TableRow>
                    ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      No quote requests yet. <Link href="/freight/rfqs/new"><span className="text-primary hover:underline">Create one</span></Link>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          {/* Bookings Tab */}
          {tab === "bookings" && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Booking #</TableHead>
                  <TableHead>Tracking</TableHead>
                  <TableHead>Carrier</TableHead>
                  <TableHead>ETD</TableHead>
                  <TableHead>ETA</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings && bookings.length > 0 ? (
                  bookings
                    .filter((b: any) => !q || b.bookingNumber?.toLowerCase().includes(q) || b.trackingNumber?.toLowerCase().includes(q))
                    .map((b: any) => (
                      <TableRow key={b.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell className="font-mono text-primary">{b.bookingNumber}</TableCell>
                        <TableCell>{b.trackingNumber || "-"}</TableCell>
                        <TableCell>{b.carrierName || "-"}</TableCell>
                        <TableCell>{b.etd ? format(new Date(b.etd), "MMM d") : "-"}</TableCell>
                        <TableCell>{b.eta ? format(new Date(b.eta), "MMM d") : "-"}</TableCell>
                        <TableCell>
                          <Badge variant={b.status === "in_transit" ? "default" : b.status === "delivered" ? "secondary" : "outline"}>
                            {(b.status || "pending").replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      No bookings yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          {/* Customs Tab */}
          {tab === "clearances" && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Port</TableHead>
                  <TableHead>Broker</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clearances && clearances.length > 0 ? (
                  clearances
                    .filter((c: any) => !q || c.referenceNumber?.toLowerCase().includes(q))
                    .map((c: any) => (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => window.location.href = `/freight/customs/${c.id}`}>
                        <TableCell className="font-mono text-primary">{c.referenceNumber || c.id}</TableCell>
                        <TableCell>{c.clearanceType || "-"}</TableCell>
                        <TableCell>{c.portOfEntry || "-"}</TableCell>
                        <TableCell>{c.customsBroker || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={c.status === "cleared" ? "secondary" : c.status === "pending_documents" ? "destructive" : "outline"}>
                            {(c.status || "pending").replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      No customs clearances
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          {/* Carriers Tab */}
          {tab === "carriers" && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carriers && carriers.length > 0 ? (
                  carriers
                    .filter((c: any) => !q || c.name?.toLowerCase().includes(q))
                    .map((c: any) => (
                      <TableRow key={c.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell><Badge variant="outline">{c.carrierType || c.mode || "-"}</Badge></TableCell>
                        <TableCell>{c.contactName || "-"}</TableCell>
                        <TableCell>{c.email || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={c.status === "active" ? "default" : "secondary"}>
                            {c.status || "active"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      No carriers in network
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
