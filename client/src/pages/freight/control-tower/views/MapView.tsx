import { useEffect, useRef } from "react";
import type { Palette } from "../lib/palette";
import type { Decorated } from "../lib/selectors";

interface Props {
  rows: Decorated[];
  palette: Palette;
  onSelect: (ref: string) => void;
}

function mapRows(rows: Decorated[]) {
  return rows.map((r) => ({
    ref: r.ref, originPort: r.originPort, destPort: r.destPort, prog: r.prog, status: r.status,
    color: r.statusColor, skuName: r.skuName, supplier: r.supplier, qty: r.qty, eta: r.eta, mode: r.mode,
    vessel: r.vessel, flagged: !!r.flag, flagKind: r.flag?.kind ?? "",
    moving: r.status === "In Transit", gpsLon: r.gps?.lon ?? null, gpsLat: r.gps?.lat ?? null,
  }));
}

function themePayload(C: Palette) {
  return {
    accent: { amber: C.amber, green: C.green, red: C.red, blue: C.blue, violet: C.violet, text: C.text, mid: C.mid, dim: C.dim, faint: C.faint },
    svg: {
      bg: C.bg, sphere: C.surface, graticule: C.line, land: C.surface2, landStroke: C.border,
      lane: C.borderStrong, portFill: C.control, portStroke: C.lineMuted, portText: C.dim, dotStroke: C.bg, closedFill: C.bg,
    },
    css: {
      "--m-bg": C.bg, "--m-text": C.text, "--m-mid": C.mid, "--m-dim": C.dim, "--m-faint": C.faint,
      "--m-panel": C.surface, "--m-panel-border": C.border, "--m-legend-bg": C.surface, "--m-legend-border": C.border,
    },
  };
}

export function MapView({ rows, palette: C, onSelect }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const liveRef = useRef(false);

  const push = () => {
    const win = iframeRef.current?.contentWindow;
    if (!liveRef.current || !win) return;
    // Same-origin asset — target our own origin rather than "*".
    win.postMessage({ type: "lane-map-data", rows: mapRows(rows), theme: themePayload(C) }, window.location.origin);
  };

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      // Only trust messages from our own origin, sent by the lane-map iframe.
      if (ev.origin !== window.location.origin || ev.source !== iframeRef.current?.contentWindow) return;
      const d = ev.data || {};
      if (d.type === "lane-map-ready") { liveRef.current = true; push(); }
      if (d.type === "lane-map-select" && d.ref) onSelect(d.ref);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-push on data / theme change.
  useEffect(() => { push(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [rows, C]);

  return (
    <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
      <iframe
        ref={iframeRef}
        src="/freight-control-tower/lane-map.html"
        title="Lane map"
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
      />
    </div>
  );
}
