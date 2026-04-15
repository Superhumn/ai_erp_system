import React, { useState, lazy, Suspense } from "react";
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
import { MapPin } from "lucide-react";

const LogisticsHub = lazy(() => import("../operations/LogisticsHub"));
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";

export default function FreightDashboard() {
  const [tab, setTab] = useState("rfqs");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

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
          <h1 className="text-lg font-semibold">Freight & Logistics</h1>
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
          <Link href="/freight/rfqs">
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
                <TabsTrigger value="shipments" className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  Shipments
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
                      <React.Fragment key={rfq.id}>
                        <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => setExpandedId(expandedId === rfq.id ? null : rfq.id)}>
                          <TableCell className="font-mono text-primary">{rfq.rfqNumber}</TableCell>
                          <TableCell className="font-medium">{rfq.title || "-"}</TableCell>
                          <TableCell>{rfq.originCity || rfq.originPort || "-"}</TableCell>
                          <TableCell>{rfq.destinationCity || rfq.destinationPort || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {rfq.preferredMode?.startsWith("ocean") ? <Ship className="h-3 w-3 mr-1 inline" /> :
                               rfq.preferredMode === "air" ? <Plane className="h-3 w-3 mr-1 inline" /> :
                               <Truck className="h-3 w-3 mr-1 inline" />}
                              {rfq.preferredMode || "—"}
                            </Badge>
                          </TableCell>
                          <TableCell><Badge>{(rfq.status || "draft").replace(/_/g, " ")}</Badge></TableCell>
                        </TableRow>
                        {expandedId === rfq.id && (
                          <TableRow>
                            <TableCell colSpan={6} className="bg-muted/20 p-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div><span className="text-xs text-muted-foreground block">Cargo</span>{rfq.cargoDescription || "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Weight</span>{rfq.totalWeight ? `${rfq.totalWeight} kg` : "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Volume</span>{rfq.totalVolume ? `${rfq.totalVolume} cbm` : "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Packages</span>{rfq.numberOfPackages || "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Cargo Type</span>{rfq.cargoType || "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Incoterms</span>{rfq.incoterms || "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Ready Date</span>{rfq.readyDate ? format(new Date(rfq.readyDate), "MMM d") : "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Target Date</span>{rfq.targetDeliveryDate ? format(new Date(rfq.targetDeliveryDate), "MMM d") : "-"}</div>
                              </div>
                              <div className="flex gap-2 mt-3">
                                <Button size="sm" variant="outline" onClick={() => window.location.href = `/freight/rfqs/${rfq.id}`}>View Full Details</Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      No quote requests yet. <Link href="/freight/rfqs"><span className="text-primary hover:underline">Create one</span></Link>
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
                      <React.Fragment key={b.id}>
                        <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}>
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
                        {expandedId === b.id && (
                          <TableRow>
                            <TableCell colSpan={6} className="bg-muted/20 p-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div><span className="text-xs text-muted-foreground block">Container</span>{b.containerNumber || "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Vessel</span>{b.vesselName || "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Voyage</span>{b.voyageNumber || "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Cost</span>{b.agreedCost ? formatCurrency(parseFloat(b.agreedCost)) : "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Pickup</span>{b.pickupDate ? format(new Date(b.pickupDate), "MMM d, yyyy") : "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Departure</span>{b.departureDate ? format(new Date(b.departureDate), "MMM d, yyyy") : "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Arrival</span>{b.arrivalDate ? format(new Date(b.arrivalDate), "MMM d, yyyy") : "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Delivery</span>{b.deliveryDate ? format(new Date(b.deliveryDate), "MMM d, yyyy") : "-"}</div>
                              </div>
                              <div className="flex gap-2 mt-3">
                                <Button size="sm" variant="outline" onClick={() => window.location.href = "/freight/tracking"}>Track Live</Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
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
                    .filter((c: any) => !q || c.referenceNumber?.toLowerCase().includes(q) || c.clearanceNumber?.toLowerCase().includes(q))
                    .map((c: any) => (
                      <React.Fragment key={c.id}>
                        <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                          <TableCell className="font-mono text-primary">{c.clearanceNumber || c.referenceNumber || c.id}</TableCell>
                          <TableCell>{c.type || "-"}</TableCell>
                          <TableCell>{c.portOfEntry || "-"}</TableCell>
                          <TableCell>{c.customsBroker || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={c.status === "cleared" ? "secondary" : c.status === "pending_documents" ? "destructive" : "outline"}>
                              {(c.status || "pending").replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                        </TableRow>
                        {expandedId === c.id && (
                          <TableRow>
                            <TableCell colSpan={5} className="bg-muted/20 p-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div><span className="text-xs text-muted-foreground block">HS Code</span>{c.hsCode || "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Country of Origin</span>{c.countryOfOrigin || "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Duties</span>{c.dutyAmount ? formatCurrency(parseFloat(c.dutyAmount)) : "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Taxes</span>{c.taxAmount ? formatCurrency(parseFloat(c.taxAmount)) : "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Submitted</span>{c.submissionDate ? format(new Date(c.submissionDate), "MMM d, yyyy") : "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Cleared</span>{c.actualClearanceDate ? format(new Date(c.actualClearanceDate), "MMM d, yyyy") : "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Cert of Origin</span>{c.certificateOfOrigin ? "Yes" : "No"}</div>
                                <div><span className="text-xs text-muted-foreground block">Total</span>{c.totalAmount ? formatCurrency(parseFloat(c.totalAmount)) : "-"}</div>
                              </div>
                              {c.notes && <p className="text-sm text-muted-foreground mt-2">{c.notes.split("---ISF_DATA---")[0].trim()}</p>}
                              <div className="flex gap-2 mt-3">
                                <Button size="sm" variant="outline" onClick={() => window.location.href = `/freight/customs/${c.id}`}>Full Details</Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
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
                      <React.Fragment key={c.id}>
                        <TableRow className="hover:bg-muted/50 cursor-pointer" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell><Badge variant="outline">{c.type || "-"}</Badge></TableCell>
                          <TableCell>{c.contactName || "-"}</TableCell>
                          <TableCell>{c.email || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={c.status === "active" ? "default" : "secondary"}>
                              {c.status || "active"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                        {expandedId === c.id && (
                          <TableRow>
                            <TableCell colSpan={5} className="bg-muted/20 p-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div><span className="text-xs text-muted-foreground block">Phone</span>{c.phone || "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Address</span>{c.address || "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Country</span>{c.country || "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">SCAC Code</span>{c.scacCode || "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Services</span>{c.services || "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Rating</span>{c.rating ? `${c.rating}/5` : "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Transit Time</span>{c.transitTimeDays ? `${c.transitTimeDays} days` : "-"}</div>
                                <div><span className="text-xs text-muted-foreground block">Notes</span>{c.notes || "-"}</div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
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

          {tab === "shipments" && (
            <div className="p-4">
              <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
                <LogisticsHub />
              </Suspense>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
