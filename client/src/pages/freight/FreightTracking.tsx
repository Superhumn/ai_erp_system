import { useState, useEffect, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MapPin, Package, Ship, Plane, Truck, Search, Loader2,
  ChevronRight, Clock, Navigation, ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";

// Simple city→coords lookup for demo (real app would use geocoding API)
const CITY_COORDS: Record<string, [number, number]> = {
  "bangkok": [13.7563, 100.5018],
  "shanghai": [31.2304, 121.4737],
  "shenzhen": [22.5431, 114.0579],
  "hong kong": [22.3193, 114.1694],
  "singapore": [1.3521, 103.8198],
  "los angeles": [33.9425, -118.4081],
  "long beach": [33.7701, -118.1937],
  "new york": [40.7128, -74.006],
  "newark": [40.7357, -74.1724],
  "oakland": [37.7749, -122.4194],
  "san francisco": [37.7749, -122.4194],
  "savannah": [32.0809, -81.0912],
  "houston": [29.7604, -95.3698],
  "miami": [25.7617, -80.1918],
  "chicago": [41.8781, -87.6298],
  "seattle": [47.6062, -122.3321],
  "tokyo": [35.6762, 139.6503],
  "busan": [35.1796, 129.0756],
  "rotterdam": [51.9244, 4.4777],
  "hamburg": [53.5511, 9.9937],
  "london": [51.5074, -0.1278],
  "mumbai": [19.076, 72.8777],
  "dubai": [25.2048, 55.2708],
  "ho chi minh": [10.8231, 106.6297],
  "jakarta": [6.2088, 106.8456],
  "manila": [14.5995, 120.9842],
  "sydney": [-33.8688, 151.2093],
  "melbourne": [-37.8136, 144.9631],
  "xiamen": [24.4798, 118.0894],
  "ningbo": [29.8683, 121.544],
  "qingdao": [36.0671, 120.3826],
  "dalian": [38.914, 121.6147],
};

function getCityCoords(city: string | null | undefined): [number, number] | null {
  if (!city) return null;
  const lower = city.toLowerCase().trim();
  for (const [key, coords] of Object.entries(CITY_COORDS)) {
    if (lower.includes(key) || key.includes(lower)) return coords;
  }
  return null;
}

const statusColors: Record<string, string> = {
  pending: "bg-gray-500/10 text-gray-600",
  confirmed: "bg-blue-500/10 text-blue-600",
  in_transit: "bg-amber-500/10 text-amber-600",
  arrived: "bg-green-500/10 text-green-600",
  delivered: "bg-emerald-500/10 text-emerald-600",
  cancelled: "bg-red-500/10 text-red-600",
};

const statusStep: Record<string, number> = {
  pending: 0, confirmed: 1, in_transit: 2, arrived: 3, delivered: 4,
};

export default function FreightTracking() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [liveData, setLiveData] = useState<any>(null);
  const [trackingSearch, setTrackingSearch] = useState("");
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polylineRef = useRef<any>(null);

  const { data: bookings, isLoading } = trpc.freight.bookings.list.useQuery({});
  const { data: rfqs } = trpc.freight.rfqs.list.useQuery({ status: undefined });

  // SeaRates live tracking
  const trackMutation = trpc.freight.trackShipment.useMutation({
    onSuccess: (data) => setLiveData(data),
    onError: (err) => toast.error("Tracking failed: " + err.message),
  });

  const handleLiveTrack = (number: string, type?: "CT" | "BL" | "BK") => {
    if (!number) return;
    trackMutation.mutate({ number, type });
  };
  const { data: carriers } = trpc.freight.carriers.list.useQuery();

  // Merge booking with RFQ data for origin/destination
  const enrichedBookings = useMemo(() => {
    if (!bookings || !rfqs) return [];
    return bookings.map((b: any) => {
      const rfq = rfqs.find((r: any) => r.id === b.rfqId);
      const carrier = carriers?.find((c: any) => c.id === b.carrierId);
      return {
        ...b,
        originCity: rfq?.originCity || "",
        originCountry: rfq?.originCountry || "",
        destCity: rfq?.destinationCity || "",
        destCountry: rfq?.destinationCountry || "",
        cargoDescription: rfq?.cargoDescription || "",
        mode: (rfq as any)?.mode || "ocean",
        carrierName: carrier?.name || `Carrier #${b.carrierId}`,
      };
    });
  }, [bookings, rfqs, carriers]);

  const filtered = enrichedBookings.filter((b: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return b.bookingNumber?.toLowerCase().includes(q) ||
      b.trackingNumber?.toLowerCase().includes(q) ||
      b.originCity?.toLowerCase().includes(q) ||
      b.destCity?.toLowerCase().includes(q) ||
      b.carrierName?.toLowerCase().includes(q);
  });

  const selected = selectedId ? enrichedBookings.find((b: any) => b.id === selectedId) : null;

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;
    const loadMap = async () => {
      try {
        const L = await import("leaflet");
        await import("leaflet/dist/leaflet.css");

        const map = L.default.map(mapRef.current!, {
          center: [20, 0],
          zoom: 2,
          zoomControl: true,
          scrollWheelZoom: true,
        });

        L.default.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 18,
        }).addTo(map);

        leafletMap.current = map;
        // Force resize
        setTimeout(() => map.invalidateSize(), 100);
      } catch (err) {
        console.error("Failed to load map:", err);
      }
    };
    loadMap();

    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
      }
    };
  }, []);

  // Update map markers when bookings change or selection changes
  useEffect(() => {
    if (!leafletMap.current) return;
    const loadLeaflet = async () => {
      const L = await import("leaflet");

      // Clear old markers
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (polylineRef.current) { polylineRef.current.remove(); polylineRef.current = null; }

      const map = leafletMap.current;
      const bounds: [number, number][] = [];

      // If a booking is selected, show its route
      if (selected) {
        const origin = getCityCoords(selected.originCity);
        const dest = getCityCoords(selected.destCity);

        if (origin) {
          const marker = L.default.circleMarker(origin, { radius: 8, color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.8 })
            .addTo(map)
            .bindTooltip(`Origin: ${selected.originCity}`, { permanent: false });
          markersRef.current.push(marker);
          bounds.push(origin);
        }
        if (dest) {
          const marker = L.default.circleMarker(dest, { radius: 8, color: "#22c55e", fillColor: "#22c55e", fillOpacity: 0.8 })
            .addTo(map)
            .bindTooltip(`Destination: ${selected.destCity}`, { permanent: false });
          markersRef.current.push(marker);
          bounds.push(dest);
        }

        // Draw route line
        if (origin && dest) {
          polylineRef.current = L.default.polyline([origin, dest], {
            color: "#6366f1", weight: 3, opacity: 0.7, dashArray: "8 6",
          }).addTo(map);

          // Show in-transit position
          if (selected.status === "in_transit") {
            const step = statusStep[selected.status] || 2;
            const progress = 0.5; // midpoint for in_transit
            const midLat = origin[0] + (dest[0] - origin[0]) * progress;
            const midLng = origin[1] + (dest[1] - origin[1]) * progress;
            const shipIcon = L.default.divIcon({
              html: `<div style="background:#f59e0b;color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)">🚢</div>`,
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            });
            const transitMarker = L.default.marker([midLat, midLng], { icon: shipIcon })
              .addTo(map)
              .bindTooltip(`${selected.bookingNumber} — In Transit`, { permanent: false });
            markersRef.current.push(transitMarker);
            bounds.push([midLat, midLng]);
          }
        }

        if (bounds.length > 0) {
          map.fitBounds(bounds, { padding: [60, 60], maxZoom: 6 });
        }
      } else {
        // Show all active bookings as dots
        for (const b of enrichedBookings) {
          if (b.status === "cancelled" || b.status === "delivered") continue;
          const origin = getCityCoords(b.originCity);
          const dest = getCityCoords(b.destCity);
          if (origin) {
            const m = L.default.circleMarker(origin, { radius: 5, color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.6 })
              .addTo(map)
              .bindTooltip(b.bookingNumber)
              .on("click", () => setSelectedId(b.id));
            markersRef.current.push(m);
            bounds.push(origin);
          }
          if (dest) {
            const m = L.default.circleMarker(dest, { radius: 5, color: "#22c55e", fillColor: "#22c55e", fillOpacity: 0.6 })
              .addTo(map)
              .on("click", () => setSelectedId(b.id));
            markersRef.current.push(m);
            bounds.push(dest);
          }
        }
        if (bounds.length > 0) {
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 4 });
        }
      }
    };
    loadLeaflet();
  }, [enrichedBookings, selected]);

  return (
    <div className="flex h-[calc(100vh-60px)] animate-fade-in">
      {/* Left panel — shipment list */}
      <div className="w-96 border-r flex flex-col bg-card">
        <div className="p-3 border-b space-y-2">
          <h1 className="text-lg font-bold">Shipment Tracking</h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search shipments..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8" />
          </div>
          {/* Direct container/BL tracking */}
          <div className="flex gap-1">
            <Input
              placeholder="Container or B/L #"
              value={trackingSearch}
              onChange={(e) => setTrackingSearch(e.target.value)}
              className="h-7 text-xs"
              onKeyDown={(e) => e.key === "Enter" && handleLiveTrack(trackingSearch)}
            />
            <Button
              size="sm"
              className="h-7 text-xs px-2 shrink-0"
              onClick={() => handleLiveTrack(trackingSearch)}
              disabled={trackMutation.isPending || !trackingSearch}
            >
              {trackMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Navigation className="h-3 w-3" />}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
              No shipments found
            </div>
          ) : (
            filtered.map((b: any) => (
              <button
                key={b.id}
                className={`w-full text-left px-3 py-3 border-b transition-colors hover:bg-muted/50 ${
                  selectedId === b.id ? "bg-primary/5 border-l-2 border-l-primary" : ""
                }`}
                onClick={() => setSelectedId(selectedId === b.id ? null : b.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {b.originCity || "Origin"} → {b.destCity || "Dest"}
                    </div>
                  </div>
                  <Badge className={statusColors[b.status] || statusColors.pending} >
                    {(b.status || "pending").replace(/_/g, " ")}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="font-mono">{b.bookingNumber}</span>
                  {b.trackingNumber && <span>#{b.trackingNumber}</span>}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span>{b.carrierName}</span>
                  {b.departureDate && <span>ETD {format(new Date(b.departureDate), "MMM d")}</span>}
                  {b.arrivalDate && <span>ETA {format(new Date(b.arrivalDate), "MMM d")}</span>}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel — map + detail */}
      <div className="flex-1 flex flex-col">
        {/* Map */}
        <div ref={mapRef} className="flex-1 min-h-[300px]" style={{ background: "#e5e7eb" }} />

        {/* Selected shipment detail bar */}
        {selected && (
          <div className="border-t bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">
                  {selected.originCity}, {selected.originCountry} → {selected.destCity}, {selected.destCountry}
                </div>
                <div className="text-sm text-muted-foreground flex items-center gap-3">
                  <span className="font-mono">{selected.bookingNumber}</span>
                  <span>{selected.carrierName}</span>
                  {selected.vesselName && <span>{selected.vesselName}</span>}
                  {selected.containerNumber && <span>Container: {selected.containerNumber}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(selected.trackingNumber || selected.containerNumber) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleLiveTrack(
                      selected.containerNumber || selected.trackingNumber,
                      selected.containerNumber ? "CT" : "BL"
                    )}
                    disabled={trackMutation.isPending}
                  >
                    {trackMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Navigation className="h-3 w-3 mr-1" />}
                    Track Live
                  </Button>
                )}
                <Badge className={`${statusColors[selected.status]} text-sm px-3 py-1`}>
                  {(selected.status || "pending").replace(/_/g, " ")}
                </Badge>
              </div>
            </div>

            {/* Progress steps */}
            <div className="flex items-center gap-1">
              {["Booked", "Confirmed", "In Transit", "Arrived", "Delivered"].map((step, i) => {
                const current = statusStep[selected.status] ?? 0;
                const active = i <= current;
                return (
                  <div key={step} className="flex-1 flex flex-col items-center">
                    <div className={`h-1.5 w-full rounded-full ${active ? "bg-primary" : "bg-gray-200 dark:bg-gray-700"}`} />
                    <span className={`text-[10px] mt-1 ${active ? "text-primary font-medium" : "text-muted-foreground"}`}>{step}</span>
                  </div>
                );
              })}
            </div>

            {/* Key dates */}
            <div className="flex items-center gap-6 text-xs text-muted-foreground">
              {selected.pickupDate && <span>Pickup: {format(new Date(selected.pickupDate), "MMM d, yyyy")}</span>}
              {selected.departureDate && <span>Departure: {format(new Date(selected.departureDate), "MMM d, yyyy")}</span>}
              {selected.arrivalDate && <span>Arrival: {format(new Date(selected.arrivalDate), "MMM d, yyyy")}</span>}
              {selected.deliveryDate && <span>Delivered: {format(new Date(selected.deliveryDate), "MMM d, yyyy")}</span>}
              {selected.agreedCost && <span className="ml-auto font-medium text-foreground">Cost: {formatCurrency(parseFloat(selected.agreedCost))}</span>}
            </div>
          </div>
        )}

        {/* Live SeaRates tracking result */}
        {liveData?.data && (
          <div className="border-t bg-card p-3">
            <div className="flex items-center gap-2 mb-2">
              <Navigation className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Live Tracking — {liveData.data.metadata?.number}</span>
              <Badge variant="outline" className="text-xs">{liveData.data.metadata?.status?.replace(/_/g, " ")}</Badge>
              <Badge variant="outline" className="text-xs">{liveData.data.metadata?.sealine_name || liveData.data.metadata?.sealine}</Badge>
              <Button size="sm" variant="ghost" className="ml-auto h-6 text-xs" onClick={() => setLiveData(null)}>Close</Button>
            </div>
            {liveData.data.locations?.length > 0 && (
              <div className="flex gap-1 overflow-x-auto pb-1">
                {liveData.data.locations.map((loc: any, i: number) => (
                  <div key={i} className={`shrink-0 text-[10px] px-2 py-1 rounded ${loc.actual ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    <div className="font-medium">{loc.name}</div>
                    <div>{loc.date ? format(new Date(loc.date), "MMM d") : ""} {loc.status && `· ${loc.status}`}</div>
                  </div>
                ))}
              </div>
            )}
            {liveData.data.vessels?.length > 0 && (
              <div className="text-xs text-muted-foreground mt-1">
                Vessel: {liveData.data.vessels.map((v: any) => v.name).join(", ")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
