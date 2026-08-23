import { Mark } from "../lib/Mark";
import { v, FONT_MONO, rowActivate } from "../lib/tokens";
import type { Palette } from "../lib/palette";
import type { RunwayRow } from "../lib/selectors";

interface Props {
  rows: RunwayRow[];
  ticks: { label: string }[];
  note: string;
  palette: Palette;
  onOpen: (ref: string) => void;
}

const GRID = "176px 46px minmax(0, 1fr) 92px";

export function RunwayView({ rows, ticks, note, palette: C, onOpen }: Props) {
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
      {/* header */}
      <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 14, alignItems: "center", fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "1.1px", textTransform: "uppercase", color: v("text-faint"), paddingBottom: 10, borderBottom: `1px solid ${v("border")}` }}>
        <div>Material</div>
        <div>Plant</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)" }}>
          {ticks.map((t, i) => <div key={i}>{t.label}</div>)}
        </div>
        <div style={{ textAlign: "right" }}>Short from</div>
      </div>

      {rows.map((r) => (
        <div
          key={r.sku}
          onClick={() => r.ref && onOpen(r.ref)}
          {...(r.ref ? rowActivate(() => onOpen(r.ref!)) : {})}
          style={{ display: "grid", gridTemplateColumns: GRID, gap: 14, alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${v("line")}`, cursor: r.rowCursor }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <Mark sku={r.sku} palette={C} w={46} h={34} icon={17} code={13} radius={8} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: v("text") }}>{r.sku}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: v("text-faint"), marginTop: 2 }}>{r.onHand}</div>
            </div>
          </div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: v("text-3") }}>{r.plantCode}</div>
          {/* bar */}
          <div style={{ position: "relative", height: 28 }}>
            <div style={{ position: "absolute", inset: "8px 0", background: v("line"), borderRadius: 3 }} />
            <div style={{ position: "absolute", inset: "8px 0", display: "grid", gridTemplateColumns: "repeat(6, 1fr)" }}>
              {[0, 1, 2, 3, 4].map((i) => <div key={i} style={{ borderRight: `1px solid ${v("border")}` }} />)}
              <div />
            </div>
            <div style={{ position: "absolute", top: 8, bottom: 8, left: 0, width: r.coverPct, background: r.barColor, borderRadius: 3 }} />
            <div style={{ position: "absolute", top: 8, bottom: 8, left: r.extLeft, width: r.extW, background: r.extBg, borderRadius: 3 }} />
            <div style={{ position: "absolute", top: 8, bottom: 8, left: r.gapLeft, width: r.gapW, background: `repeating-linear-gradient(135deg, ${C.red}8C 0 4px, ${C.red}1F 4px 8px)`, borderTop: `1px solid ${C.red}99`, borderBottom: `1px solid ${C.red}99` }} />
            <div style={{ position: "absolute", top: 1, bottom: 1, left: r.arrLeft, width: 2, background: v("info") }} />
          </div>
          <div style={{ textAlign: "right", fontFamily: FONT_MONO, fontSize: 11.5, color: r.noteColor }}>{r.note}</div>
        </div>
      ))}

      {/* legend */}
      <div style={{ display: "flex", gap: 20, paddingTop: 14, fontFamily: FONT_MONO, fontSize: 10, color: v("text-dim"), flexWrap: "wrap" }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: v("success"), verticalAlign: -1 }} /> cover on hand today</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: `repeating-linear-gradient(135deg, ${C.red}8C 0 3px, ${C.red}1F 3px 6px)`, verticalAlign: -1 }} /> line down</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: `${C.blue}40`, verticalAlign: -1 }} /> cover after inbound</span>
        <span style={{ color: v("info") }}>│ arrival</span>
        <span style={{ color: v("text-faint") }}>quarantined stock excluded</span>
      </div>
    </div>
  );
}
