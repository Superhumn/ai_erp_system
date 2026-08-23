import { v, FONT_MONO, FONT_SANS } from "../lib/tokens";
import type { Paper } from "../lib/paper";

export interface PaperViewModel {
  paper: Paper;
  docName: string;
  statusLabel: string;
  badgeColor: string;
  counter: string;
  present: boolean;
  missingNote: string;
  actLabel: string;
  actBg: string;
}

interface Props {
  model: PaperViewModel;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onAction: () => void;
}

export function DocumentViewer({ model: m, onPrev, onNext, onClose, onAction }: Props) {
  const p = m.paper;
  return (
    <>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(28,25,23,.44)", backdropFilter: "blur(2px)", zIndex: 30 }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 31, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, pointerEvents: "none" }}>
        <div onClick={(e) => e.stopPropagation()} style={{ pointerEvents: "auto", width: 760, maxWidth: "100%", maxHeight: "100%", display: "flex", flexDirection: "column", background: v("surface"), border: `1px solid ${v("border-strong")}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 30px 80px rgba(28,25,23,.4)", animation: "fctFadeUp 200ms ease both" }}>
          {/* toolbar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${v("border")}`, background: v("surface-2") }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: ".6px", padding: "3px 7px", borderRadius: 4, background: `${m.badgeColor}22`, color: m.badgeColor }}>{m.statusLabel}</span>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{m.docName}</div>
            <div style={{ flex: 1 }} />
            <div onClick={onPrev} style={{ cursor: "pointer", fontFamily: FONT_MONO, fontSize: 13, color: v("text-3"), padding: "2px 6px" }}>‹</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: v("text-dim") }}>{m.counter}</div>
            <div onClick={onNext} style={{ cursor: "pointer", fontFamily: FONT_MONO, fontSize: 13, color: v("text-3"), padding: "2px 6px" }}>›</div>
            <div onClick={onClose} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${v("border-strong")}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: v("text-3"), fontSize: 13, marginLeft: 6 }}>✕</div>
          </div>

          {/* body */}
          <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
            {m.present ? (
              <div style={{ position: "relative", background: v("bg"), border: `1px solid ${v("border")}`, borderRadius: 8, padding: "26px 28px", color: v("text") }}>
                {p.stamp && (
                  <div style={{ position: "absolute", top: 24, right: 24, transform: "rotate(-9deg)", border: `2px solid ${p.stamp.color}`, color: p.stamp.color, fontFamily: FONT_MONO, fontSize: 15, fontWeight: 600, letterSpacing: "2px", padding: "5px 12px", borderRadius: 6, opacity: 0.85 }}>{p.stamp.text}</div>
                )}
                {/* issuer / title / ref */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                  <div>
                    <div style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: "1px", textTransform: "uppercase", color: v("text-dim") }}>{p.issuer}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, letterSpacing: "-.4px" }}>{p.title}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "1px", textTransform: "uppercase", color: v("text-faint") }}>{p.refLabel}</div>
                    <div style={{ fontFamily: FONT_MONO, fontSize: 13, marginTop: 4 }}>{p.refValue}</div>
                  </div>
                </div>

                {/* parties */}
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${p.partyCols}, minmax(0,1fr))`, gap: 18, marginTop: 22 }}>
                  {p.parties.map((pt, i) => (
                    <div key={i}>
                      <div style={{ fontFamily: FONT_MONO, fontSize: 8.5, letterSpacing: "1px", textTransform: "uppercase", color: v("text-faint") }}>{pt.role}</div>
                      {pt.name && <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 5 }}>{pt.name}</div>}
                      <div style={{ fontSize: 11, color: v("text-2"), marginTop: 3, whiteSpace: "pre-line", lineHeight: 1.5 }}>{pt.lines}</div>
                    </div>
                  ))}
                </div>

                {/* fields */}
                {p.fields.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "10px 22px", marginTop: 22, paddingTop: 18, borderTop: `1px solid ${v("line")}` }}>
                    {p.fields.map((f, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ fontSize: 11.5, color: v("text-dim") }}>{f.k}</span>
                        <span style={{ fontFamily: FONT_MONO, fontSize: 11.5, textAlign: "right" }}>{f.v}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* line items */}
                {p.lineRows.length > 0 && (
                  <div style={{ marginTop: 22 }}>
                    <div style={{ display: "grid", gridTemplateColumns: p.lineCols, gap: 10, padding: "8px 0", borderBottom: `1px solid ${v("border-strong")}`, fontFamily: FONT_MONO, fontSize: 8.5, letterSpacing: ".8px", textTransform: "uppercase", color: v("text-dim") }}>
                      {p.lineHead.map((h, i) => <div key={i} style={{ textAlign: h.align }}>{h.label}</div>)}
                    </div>
                    {p.lineRows.map((row, ri) => (
                      <div key={ri} style={{ display: "grid", gridTemplateColumns: p.lineCols, gap: 10, padding: "8px 0", borderBottom: `1px solid ${v("line")}` }}>
                        {row.cells.map((cl, ci) => (
                          <div key={ci} style={{ fontFamily: cl.mono ? FONT_MONO : FONT_SANS, fontSize: 11.5, textAlign: cl.align }}>{cl.v}</div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {/* totals */}
                {p.totals.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 14, alignItems: "flex-end" }}>
                    {p.totals.map((t, i) => (
                      <div key={i} style={{ display: "flex", gap: 24, minWidth: 240, justifyContent: "space-between" }}>
                        <span style={{ fontSize: 11.5, color: v("text-dim") }}>{t.k}</span>
                        <span style={{ fontFamily: FONT_MONO, fontSize: 12 }}>{t.v}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* notes */}
                {p.notes.length > 0 && (
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${v("line")}` }}>
                    {p.notes.map((n, i) => <div key={i} style={{ fontSize: 11, color: v("text-2"), lineHeight: 1.6 }}>{n}</div>)}
                  </div>
                )}

                {/* signatures + footer */}
                <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginTop: 34 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ borderTop: `1px solid ${v("border-strong")}`, paddingTop: 6, fontSize: 10.5, color: v("text-dim") }}>{p.sigLeft}</div>
                  </div>
                  <div style={{ width: 160 }}>
                    <div style={{ borderTop: `1px solid ${v("border-strong")}`, paddingTop: 6, fontSize: 10.5, color: v("text-dim") }}>{p.sigRight}</div>
                  </div>
                </div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: v("text-faint"), marginTop: 20 }}>{p.footer}</div>
              </div>
            ) : (
              <div style={{ padding: "30px 20px", textAlign: "center" }}>
                <div style={{ fontFamily: FONT_MONO, fontSize: 12, letterSpacing: ".8px", textTransform: "uppercase", color: m.badgeColor }}>{m.statusLabel}</div>
                <div style={{ fontSize: 13, color: v("text-2"), marginTop: 12, lineHeight: 1.6, maxWidth: 520, marginInline: "auto" }}>{m.missingNote}</div>
              </div>
            )}
          </div>

          {/* action */}
          <div style={{ borderTop: `1px solid ${v("border")}`, padding: "12px 16px", display: "flex", justifyContent: "flex-end", background: v("surface-2") }}>
            <button onClick={onAction} style={{ padding: "9px 16px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, background: m.actBg, color: v("bg") }}>{m.actLabel}</button>
          </div>
        </div>
      </div>
    </>
  );
}
