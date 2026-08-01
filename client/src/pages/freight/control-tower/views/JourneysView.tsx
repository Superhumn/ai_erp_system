import { Mark } from "../lib/Mark";
import { v, FONT_MONO } from "../lib/tokens";
import type { Palette } from "../lib/palette";
import type { JourneyRibbon } from "../lib/selectors";

interface Props {
  rows: JourneyRibbon[];
  ticks: { label: string }[];
  todayLeft: string;
  palette: Palette;
  onOpen: (ref: string) => void;
}

const GRID = "200px minmax(0, 1fr)";

export function JourneysView({ rows, ticks, todayLeft, palette: C, onOpen }: Props) {
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
      {/* axis */}
      <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 16, paddingBottom: 8, borderBottom: `1px solid ${v("border")}` }}>
        <div />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", fontFamily: FONT_MONO, fontSize: 9.5, color: v("text-faint") }}>
          {ticks.map((t, i) => <div key={i}>{t.label}</div>)}
        </div>
      </div>

      {rows.map((rb) => (
        <div
          key={rb.ref}
          onClick={() => onOpen(rb.ref)}
          style={{ display: "grid", gridTemplateColumns: GRID, gap: 16, alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${v("line")}`, cursor: "pointer" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <Mark sku={rb.sku} palette={C} w={46} h={32} icon={16} code={12} radius={8} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: v("text-3") }}>{rb.ref}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: v("text"), marginTop: 2 }}>→ {rb.plantCode}</div>
            </div>
          </div>
          {/* track */}
          <div style={{ position: "relative", height: 26 }}>
            <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(6, 1fr)" }}>
              {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} style={{ borderLeft: `1px solid ${v("line")}` }} />)}
            </div>
            <div style={{ position: "absolute", top: 5, height: 16, left: rb.left, width: rb.width, display: "flex", borderRadius: 8, overflow: "hidden" }}>
              {rb.segs.map((sg, i) => <div key={i} title={sg.label} style={{ width: sg.w, background: sg.color }} />)}
            </div>
            {rb.flag && (
              <div style={{ position: "absolute", top: 3, left: rb.flagLeft, width: 20, height: 20, borderRadius: "50%", background: v("bg"), border: `1.5px solid ${rb.flagColor}`, color: rb.flagColor, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_MONO, fontSize: 11, zIndex: 3 }}>{rb.flagIcon}</div>
            )}
            {/* today marker MUST be the last child so it paints over ribbons */}
            <div style={{ position: "absolute", top: -2, bottom: -2, left: todayLeft, width: 2, background: v("warning"), boxShadow: `0 0 0 1px ${v("bg")}`, zIndex: 2 }} />
          </div>
        </div>
      ))}

      {/* legend */}
      <div style={{ display: "flex", gap: 18, paddingTop: 14, fontFamily: FONT_MONO, fontSize: 10, color: v("text-dim"), flexWrap: "wrap" }}>
        <span><span style={{ display: "inline-block", width: 14, height: 9, borderRadius: 2, background: v("text-faint") }} /> at supplier</span>
        <span><span style={{ display: "inline-block", width: 14, height: 9, borderRadius: 2, background: v("info") }} /> in transit</span>
        <span><span style={{ display: "inline-block", width: 14, height: 9, borderRadius: 2, background: v("accent") }} /> customs</span>
        <span><span style={{ display: "inline-block", width: 14, height: 9, borderRadius: 2, background: v("success") }} /> received</span>
        <span style={{ color: v("warning") }}>│ today</span>
      </div>
    </div>
  );
}
