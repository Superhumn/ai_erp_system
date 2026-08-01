import { Mark } from "../lib/Mark";
import { v, FONT_MONO } from "../lib/tokens";
import type { Palette } from "../lib/palette";
import type { ClockRow, RunwayRow } from "../lib/selectors";

interface Props {
  clock: ClockRow[];
  runwayTop: RunwayRow[];
  runwayNote: string;
  palette: Palette;
  onOpen: (ref: string) => void;
}

export function TodayView({ clock, runwayTop, runwayNote, palette: C, onOpen }: Props) {
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "22px 24px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", gap: 26, alignItems: "start" }}>
        {/* left — next 72 hours */}
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 13 }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: "1.2px", textTransform: "uppercase", color: v("text-dim") }}>Next 72 hours</span>
            <span style={{ fontSize: 11.5, color: v("text-faint") }}>everything that needs a person</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {clock.map((e) => (
              <div
                key={e.ref + e.label}
                onClick={() => e.ref && onOpen(e.ref)}
                style={{ display: "grid", gridTemplateColumns: "52px 44px minmax(0, 1fr)", gap: 14, alignItems: "center", padding: "13px 15px", border: `1px solid ${e.border}`, borderRadius: 9, background: e.bg, cursor: "pointer" }}
              >
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 21, letterSpacing: "-1px", color: e.color }}>{e.hrs}</span>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: v("text-faint") }}>h</span>
                </div>
                <Mark sku={e.sku} palette={C} w={44} h={36} icon={15} code={12} radius={8} gap={4} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: v("text"), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</div>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: v("text-dim"), marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.ref} · {e.sub}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 18, marginTop: 14, fontFamily: FONT_MONO, fontSize: 11, color: v("text-dim") }}>
            <span style={{ color: v("danger") }}>● act now</span>
            <span style={{ color: v("warning") }}>● today</span>
            <span style={{ color: v("info") }}>● this week</span>
          </div>
        </div>

        {/* right — cover at risk */}
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 13 }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: "1.2px", textTransform: "uppercase", color: v("text-dim") }}>Cover at risk</span>
            <span style={{ fontSize: 11.5, color: v("text-faint") }}>days on hand</span>
          </div>
          <div style={{ border: `1px solid ${v("border")}`, borderRadius: 10, background: v("surface"), padding: "14px 16px" }}>
            {runwayTop.map((r) => (
              <div
                key={r.sku}
                onClick={() => r.ref && onOpen(r.ref)}
                style={{ display: "grid", gridTemplateColumns: "44px minmax(0, 1fr) 42px", gap: 11, alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${v("line")}`, cursor: r.rowCursor }}
              >
                <Mark sku={r.sku} palette={C} w={44} h={30} icon={14} code={11} radius={7} gap={4} />
                <div style={{ position: "relative", height: 22 }}>
                  <div style={{ position: "absolute", inset: "6px 0", background: v("line"), borderRadius: 3 }} />
                  <div style={{ position: "absolute", top: 6, bottom: 6, left: 0, width: r.coverPct, background: r.barColor, borderRadius: 3 }} />
                  <div style={{ position: "absolute", top: 6, bottom: 6, left: r.extLeft, width: r.extW, background: r.extBg, borderRadius: 3 }} />
                  <div style={{ position: "absolute", top: 6, bottom: 6, left: r.gapLeft, width: r.gapW, background: `repeating-linear-gradient(135deg, ${C.red}80 0 4px, ${C.red}1F 4px 8px)` }} />
                </div>
                <div style={{ textAlign: "right", fontFamily: FONT_MONO, fontSize: 15, letterSpacing: "-.5px", color: r.color }}>{r.days}</div>
              </div>
            ))}
            <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: v("text-faint"), paddingTop: 11 }}>{runwayNote}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
