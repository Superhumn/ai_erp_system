import { v, FONT_MONO } from "../lib/tokens";
import type { Palette } from "../lib/palette";
import type { Detail } from "../lib/drawer";
import type { Pivot } from "../lib/selectors";

interface Props {
  detail: Detail;
  palette: Palette;
  onClose: () => void;
  onPivot: (p: Pivot) => void;
  onOpenDoc: (index: number) => void;
  onAction: () => void;
}

const label = (t: string) => ({ fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: "1.2px", textTransform: "uppercase" as const, color: v("text-dim"), marginBottom: 12 });

export function MovementDrawer({ detail: d, palette: C, onClose, onPivot, onOpenDoc, onAction }: Props) {
  return (
    <>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(28,25,23,.34)", backdropFilter: "blur(2px)", zIndex: 20 }} />
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 640, maxWidth: "94vw", background: v("surface"), borderLeft: `1px solid ${v("border-strong")}`, zIndex: 21, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "-24px 0 60px rgba(28,25,23,.26)", animation: "fctSlideIn 240ms cubic-bezier(.22,.8,.3,1) both" }}>
        {/* header */}
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${v("border")}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 17, letterSpacing: "-.4px" }}>{d.ref}</div>
            <span style={{ fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: ".6px", padding: "3px 7px", borderRadius: 4, background: d.statusBg, color: d.statusColor }}>{d.status}</span>
            <div style={{ flex: 1 }} />
            <div onClick={onClose} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${v("border-strong")}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: v("text-3"), fontSize: 13 }}>✕</div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{d.origin}</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: v("text-faint") }}>────▸</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{d.dest}</div>
            <div style={{ flex: 1 }} />
            <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: v("text-dim") }}>{d.mode} · {d.incoterm}</div>
          </div>
          <div style={{ fontSize: 12.5, color: v("text-3"), marginTop: 8 }}>{d.skuName} · {d.qty}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 12, flexWrap: "wrap" }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "1px", textTransform: "uppercase", color: v("text-faint") }}>Pivot to</span>
            {d.links.map((l, i) => (
              <div key={i} onClick={() => onPivot(l)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 9px", borderRadius: 5, border: `1px solid ${v("control")}`, background: v("surface-2"), cursor: "pointer" }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 8.5, letterSpacing: ".8px", textTransform: "uppercase", color: v("text-dim") }}>{l.kind}</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: v("text") }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
          {d.hasFlag && (
            <div style={{ border: `1px solid ${d.flagBorder}`, borderRadius: 8, background: d.flagBg, padding: "13px 15px" }}>
              <div style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: "1.1px", textTransform: "uppercase", color: d.flagColor }}>{d.flagKind}</div>
              <div style={{ fontSize: 12.5, marginTop: 7, lineHeight: 1.5, color: v("text") }}>{d.flagText}</div>
            </div>
          )}

          {d.hasGps && (
            <div style={{ border: `1px solid ${v("border-strong")}`, borderRadius: 9, background: v("surface-2"), padding: "15px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: v("success"), animation: "fctPulse 2.2s ease-in-out infinite" }} />
                <div style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: "1.1px", textTransform: "uppercase", color: v("text-dim") }}>Live position</div>
                <div style={{ flex: 1 }} />
                <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: v("text-faint") }}>{d.gpsAge}</div>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 11 }}>{d.vessel}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginTop: 13 }}>
                {d.gpsFacts.map((g, i) => (
                  <div key={i}>
                    <div style={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "1px", textTransform: "uppercase", color: v("text-dim") }}>{g.k}</div>
                    <div style={{ fontFamily: FONT_MONO, fontSize: 12, marginTop: 5 }}>{g.v}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 15, position: "relative", height: 26 }}>
                <div style={{ position: "absolute", top: 11, left: 0, right: 0, height: 3, borderRadius: 2, background: v("border-strong") }} />
                <div style={{ position: "absolute", top: 11, left: 0, height: 3, borderRadius: 2, width: d.pct, background: d.statusColor }} />
                <div style={{ position: "absolute", top: 4, left: d.pct, width: 17, height: 17, marginLeft: -8, borderRadius: "50%", background: d.statusColor, border: `3px solid ${v("surface-2")}` }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT_MONO, fontSize: 10, color: v("text-dim"), marginTop: 2 }}>
                <span>{d.originPort}</span><span>{d.destPort}</span>
              </div>
            </div>
          )}

          {/* milestones */}
          <div>
            <div style={label("")}>Milestones</div>
            {d.milestones.map((m, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr) 112px", gap: 12, alignItems: "start" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ width: 9, height: 9, borderRadius: "50%", marginTop: 4, background: m.dotBg, border: `2px solid ${m.dotBorder}`, animation: m.anim }} />
                  <div style={{ width: 1, flex: 1, minHeight: 24, background: m.lineColor }} />
                </div>
                <div style={{ paddingBottom: 13 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: m.textColor }}>{m.label}</div>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: v("text-dim"), marginTop: 3 }}>{m.place}</div>
                </div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, textAlign: "right", color: m.timeColor }}>{m.time}</div>
              </div>
            ))}
          </div>

          {/* three-way match & customs */}
          <div>
            <div style={label("")}>Three-way match &amp; customs</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1, background: v("border"), border: `1px solid ${v("border-strong")}`, borderRadius: 8, overflow: "hidden" }}>
              {d.facts.map((f, i) => (
                <div key={i} style={{ background: v("surface-2"), padding: "12px 14px" }}>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "1px", textTransform: "uppercase", color: v("text-dim") }}>{f.k}</div>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 12, marginTop: 6, color: f.color }}>{f.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* document envelope */}
          <div>
            <div style={label("")}>Document envelope</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
              {d.docs.map((doc) => (
                <div key={doc.index} onClick={() => onOpenDoc(doc.index)} style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${doc.border}`, borderRadius: 7, background: v("surface-2"), padding: "10px 12px", cursor: "pointer" }}>
                  <div style={{ width: 5, height: 24, borderRadius: 2, flex: "none", background: doc.color }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</div>
                    <div style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: v("text-dim"), marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.meta}</div>
                  </div>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: ".6px", flex: "none", color: doc.color }}>{doc.short}</span>
                </div>
              ))}
            </div>
          </div>

          {/* supplier scorecard */}
          {d.vendor.length > 0 && (
            <div>
              <div style={label("")}>Supplier · {d.supplier}</div>
              <div style={{ border: `1px solid ${v("border-strong")}`, borderRadius: 8, background: v("surface-2"), padding: "14px 16px", display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14 }}>
                {d.vendor.map((vd, i) => (
                  <div key={i}>
                    <div style={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "1px", textTransform: "uppercase", color: v("text-dim") }}>{vd.k}</div>
                    <div style={{ fontFamily: FONT_MONO, fontSize: 14, marginTop: 5, color: vd.color }}>{vd.v}</div>
                    <div style={{ height: 4, background: v("border"), borderRadius: 2, marginTop: 7, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: vd.pct, background: vd.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* footer action */}
        <div style={{ borderTop: `1px solid ${v("border")}`, padding: "12px 22px", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onAction} style={{ padding: "9px 16px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, background: d.statusColor, color: v("bg") }}>{d.actLabel}</button>
        </div>
      </div>
    </>
  );
}
