import React, { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Ship, AlertTriangle, Clock, Anchor, ArrowLeft, Info } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import {
  estimateOceanFreight,
  lanesForOrigin,
  ASSUMPTIONS,
  ORIGIN_COUNTRIES,
  RATES_AS_OF,
  RATE_SCENARIOS,
  SHIPPING_MODES,
  SURCHARGES,
  type ShippingMode,
} from "@shared/oceanFreightRates";

/** Empty string stays empty so the field can be cleared; anything unparseable is ignored. */
function num(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Local calendar date as YYYY-MM-DD. toISOString() would give the UTC day. */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export default function RateEstimator() {
  const [originCountry, setOriginCountry] = useState("India");
  const [destination, setDestination] = useState("US West Coast");
  const [mode, setMode] = useState<ShippingMode>("fcl40");
  const [containers, setContainers] = useState("1");
  const [weightKg, setWeightKg] = useState("");
  const [volumeCbm, setVolumeCbm] = useState("");
  const [cargoValueUsd, setCargoValueUsd] = useState("");
  const [scenario, setScenario] = useState("1");
  const [shipDate, setShipDate] = useState(today);
  const [includeDrayage, setIncludeDrayage] = useState(true);
  const [includeInsurance, setIncludeInsurance] = useState(true);

  // Destinations reachable from the selected origin. Switching origin can strand
  // the current destination (China has no Australia lane), so fall back to the first.
  const originLanes = useMemo(() => lanesForOrigin(originCountry), [originCountry]);
  const activeDestination = originLanes.some((l) => l.destination === destination)
    ? destination
    : originLanes[0]?.destination ?? "";

  const estimate = useMemo(
    () =>
      estimateOceanFreight({
        originCountry,
        destination: activeDestination,
        mode,
        containers: num(containers) ?? 1,
        weightKg: num(weightKg),
        volumeCbm: num(volumeCbm),
        cargoValueUsd: num(cargoValueUsd),
        rateScenario: Number(scenario) || 1,
        shipDate: shipDate || undefined,
        includeDrayage,
        includeInsurance,
      }),
    [
      originCountry, activeDestination, mode, containers, weightKg, volumeCbm,
      cargoValueUsd, scenario, shipDate, includeDrayage, includeInsurance,
    ],
  );

  const isLcl = mode === "lcl";

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Ocean Rate Estimator</h1>
          <p className="text-muted-foreground text-sm">
            Indicative port-to-port pricing from the Superhumn freight matrix · rates as of{" "}
            {RATES_AS_OF} · USD
          </p>
        </div>
        <Link href="/freight">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Freight
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* ---------- Shipment inputs ---------- */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Shipment details</CardTitle>
            <CardDescription>The estimate updates as you type.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="origin">Origin country</Label>
              <Select value={originCountry} onValueChange={setOriginCountry}>
                <SelectTrigger id="origin" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORIGIN_COUNTRIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="destination">Destination</Label>
              <Select value={activeDestination} onValueChange={setDestination}>
                <SelectTrigger id="destination" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {originLanes.map((l) => (
                    <SelectItem key={l.destination} value={l.destination}>
                      {l.destination} · {l.dischargePort}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mode">Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as ShippingMode)}>
                <SelectTrigger id="mode" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHIPPING_MODES.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {SHIPPING_MODES.find((m) => m.id === mode)?.description}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {!isLcl && (
                <div className="space-y-2">
                  <Label htmlFor="containers">Containers</Label>
                  <Input
                    id="containers" type="number" min={1} value={containers}
                    onChange={(e) => setContainers(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="weight">Gross weight (kg)</Label>
                <Input
                  id="weight" type="number" min={0} placeholder={isLcl ? "0" : String(ASSUMPTIONS.defaultPayloadKg)}
                  value={weightKg} onChange={(e) => setWeightKg(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="volume">Volume (cbm){isLcl && " *"}</Label>
                <Input
                  id="volume" type="number" min={0} placeholder="0"
                  value={volumeCbm} onChange={(e) => setVolumeCbm(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cargoValue">Cargo value (USD)</Label>
                <Input
                  id="cargoValue" type="number" min={0} placeholder="0"
                  value={cargoValueUsd} onChange={(e) => setCargoValueUsd(e.target.value)}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="scenario">Rate scenario</Label>
              <Select value={scenario} onValueChange={setScenario}>
                <SelectTrigger id="scenario" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RATE_SCENARIOS.map((s) => (
                    <SelectItem key={s.id} value={String(s.multiplier)}>
                      {s.label} ({s.multiplier}x)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {RATE_SCENARIOS.find((s) => String(s.multiplier) === scenario)?.note}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sailDate">Sail date</Label>
              <Input id="sailDate" type="date" value={shipDate} onChange={(e) => setShipDate(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Drives the ETA and the Aug–Oct peak-season uplift.
              </p>
            </div>

            {!isLcl && (
              <div className="flex items-center justify-between">
                <Label htmlFor="drayage" className="font-normal">Include destination drayage</Label>
                <Switch id="drayage" checked={includeDrayage} onCheckedChange={setIncludeDrayage} />
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label htmlFor="insurance" className="font-normal">Include marine insurance</Label>
              <Switch id="insurance" checked={includeInsurance} onCheckedChange={setIncludeInsurance} />
            </div>
          </CardContent>
        </Card>

        {/* ---------- Estimate ---------- */}
        <div className="space-y-4">
          {!estimate ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                No lane in the matrix for {originCountry} → {destination}. Send a forwarder RFQ instead.
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Ship className="h-4 w-4" />
                        {estimate.lane.loadPort} → {estimate.lane.dischargePort}
                      </CardTitle>
                      <CardDescription>
                        {estimate.lane.originCountry} to {estimate.lane.destination} ·{" "}
                        {SHIPPING_MODES.find((m) => m.id === estimate.mode)?.label} ·{" "}
                        {estimate.chargeableUnits} {estimate.chargeableUnitLabel}
                      </CardDescription>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="secondary" className="gap-1">
                        <Clock className="h-3 w-3" />
                        {estimate.transitDays} days transit
                      </Badge>
                      {estimate.etaDate && (
                        <span className="text-xs text-muted-foreground">ETA {estimate.etaDate}</span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">Low</div>
                      <div className="text-lg font-semibold tabular-nums">
                        {formatCurrency(estimate.total.low, { whole: true })}
                      </div>
                    </div>
                    <div className="rounded-md border-2 border-primary p-3">
                      <div className="text-xs text-muted-foreground">Likely</div>
                      <div className="text-2xl font-semibold tabular-nums">
                        {formatCurrency(estimate.total.mid, { whole: true })}
                      </div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">High</div>
                      <div className="text-lg font-semibold tabular-nums">
                        {formatCurrency(estimate.total.high, { whole: true })}
                      </div>
                    </div>
                  </div>

                  {estimate.perLb && (
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                      <span className="text-muted-foreground">
                        Base freight{" "}
                        <span className="font-medium text-foreground tabular-nums">
                          ${estimate.perLb.base.toFixed(3)}/lb
                        </span>
                      </span>
                      <span className="text-muted-foreground">
                        All-in{" "}
                        <span className="font-medium text-foreground tabular-nums">
                          ${estimate.perLb.allIn.toFixed(3)}/lb
                        </span>
                      </span>
                      <span className="text-muted-foreground">
                        over {estimate.perLb.payloadLb.toLocaleString()} lb
                        {!weightKg && " (assumed retort payload)"}
                      </span>
                    </div>
                  )}

                  {estimate.warnings.length > 0 && (
                    <div className="space-y-1.5">
                      {estimate.warnings.map((w) => (
                        <div key={w} className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-500">
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Cost breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Line</TableHead>
                        <TableHead>Basis</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Base ocean freight</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          Port to port, {formatCurrency(estimate.baseFreight.low, { whole: true })}–
                          {formatCurrency(estimate.baseFreight.high, { whole: true })} band
                          {estimate.rateScenario !== 1 && ` · ${estimate.rateScenario}x scenario`}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(estimate.baseFreight.mid, { whole: true })}
                        </TableCell>
                      </TableRow>
                      {estimate.peakSeasonApplied && (
                        <TableRow>
                          <TableCell className="font-medium">Peak season surcharge</TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {SURCHARGES.peakSeasonUplift * 100}% uplift on base freight, Aug–Oct sailing
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(estimate.peakSurcharge, { whole: true })}
                          </TableCell>
                        </TableRow>
                      )}
                      {estimate.surcharges.map((s) => (
                        <TableRow key={s.label}>
                          <TableCell className="font-medium">{s.label}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{s.note}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(s.amount, { whole: true })}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="border-t-2">
                        <TableCell className="font-semibold">All-in estimate</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          Likely case. Range {formatCurrency(estimate.total.low, { whole: true })}–
                          {formatCurrency(estimate.total.high, { whole: true })}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatCurrency(estimate.total.mid, { whole: true })}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Anchor className="h-4 w-4" />
                    Other destinations from {originCountry}
                  </CardTitle>
                  <CardDescription>
                    Same mode, same scenario, same cargo — all-in likely case.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Destination</TableHead>
                        <TableHead>Discharge port</TableHead>
                        <TableHead className="text-right">Transit</TableHead>
                        <TableHead className="text-right">All-in</TableHead>
                        <TableHead className="text-right">$/lb</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {originLanes.map((lane) => {
                        const alt = estimateOceanFreight({
                          originCountry,
                          destination: lane.destination,
                          loadPort: lane.loadPort,
                          mode,
                          containers: num(containers) ?? 1,
                          weightKg: num(weightKg),
                          volumeCbm: num(volumeCbm),
                          cargoValueUsd: num(cargoValueUsd),
                          rateScenario: Number(scenario) || 1,
                          shipDate: shipDate || undefined,
                          includeDrayage,
                          includeInsurance,
                        });
                        if (!alt) return null;
                        const isActive = lane.destination === activeDestination;
                        return (
                          <TableRow
                            key={`${lane.destination}-${lane.loadPort}`}
                            className={isActive ? "bg-muted/50" : "cursor-pointer"}
                            onClick={() => setDestination(lane.destination)}
                          >
                            <TableCell className="font-medium">
                              <button
                                type="button"
                                className="hover:underline focus-visible:ring-ring/50 rounded-sm outline-none focus-visible:ring-[3px]"
                                aria-current={isActive ? "true" : undefined}
                                onClick={() => setDestination(lane.destination)}
                              >
                                {lane.destination}
                              </button>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{lane.dischargePort}</TableCell>
                            <TableCell className="text-right tabular-nums">{lane.transitDays}d</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(alt.total.mid, { whole: true })}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {alt.perLb ? `$${alt.perLb.allIn.toFixed(3)}` : "-"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}

          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Market indications, not quotes. Spot rates move 20–40% within a quarter and contract
              rates price 10–25% below the figures shown. Excludes customs duty and clearance.
              Verify with a forwarder RFQ before committing.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
