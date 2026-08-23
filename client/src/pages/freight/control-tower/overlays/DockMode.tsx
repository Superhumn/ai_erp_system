import { Mark } from "../lib/Mark";
import { v, FONT_MONO } from "../lib/tokens";
import type { Palette } from "../lib/palette";
import type { DockModel } from "../lib/drawer";

interface Props {
  model: DockModel;
  palette: Palette;
  onInc: () => void;
  onDec: () => void;
  onPickCond: (label: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export function DockMode({ model: d, palette: C, onInc, onDec, onPickCond, onSubmit, onClose }: Props) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 40, background: v("bg"), display: "flex", flexDirection: "column" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 22px", borderBottom: `1px solid ${v("border")}` }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: "1.5px", textTransform: "uppercase", color: v("text-dim") }}>Dock · receiving</div>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{ padding: "8px 14px", borderRadius: 7, border: `1px solid ${v("control")}`, background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: v("text-2") }}>Exit dock</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", justifyContent: "center", padding: 28 }}>
        <div style={{ width: 620, maxWidth: "100%" }}>
          {/* movement */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Mark sku="PK-POU-500" palette={C} w={92} h={78} icon={34} code={24} radius={12} gap={8} />
            <div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 15, color: v("text") }}>{d.ref}</div>
              <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{d.item}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: v("text-dim"), marginTop: 4 }}>{d.sku}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: v("text-faint"), marginTop: 6 }}>{d.lane}</div>
            </div>
          </div>

          {/* expected + counter */}
          <div style={{ marginTop: 28, padding: 22, borderRadius: 12, border: `1px solid ${v("border")}`, background: v("surface") }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: "1px", textTransform: "uppercase", color: v("text-dim") }}>Expected</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 14, color: v("text-2") }}>{d.expected}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, marginTop: 18 }}>
              <button onClick={onDec} style={{ width: 56, height: 56, borderRadius: 12, border: `1px solid ${v("control")}`, background: v("surface-2"), cursor: "pointer", fontSize: 26, color: v("text"), lineHeight: 1 }}>−</button>
              <div style={{ textAlign: "center", minWidth: 200 }}>
                <div style={{ fontFamily: FONT_MONO, fontSize: 46, letterSpacing: "-2px", color: d.countColor, lineHeight: 1 }}>{d.count}</div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: v("text-dim"), marginTop: 4 }}>counted · ±1000 per tap</div>
              </div>
              <button onClick={onInc} style={{ width: 56, height: 56, borderRadius: 12, border: `1px solid ${v("control")}`, background: v("surface-2"), cursor: "pointer", fontSize: 26, color: v("text"), lineHeight: 1 }}>+</button>
            </div>
            <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 8, background: d.varBg, fontFamily: FONT_MONO, fontSize: 12, textAlign: "center", color: d.countColor }}>{d.varText}</div>
          </div>

          {/* condition */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: "1px", textTransform: "uppercase", color: v("text-dim"), marginBottom: 8 }}>Condition</div>
            <div style={{ display: "flex", gap: 10 }}>
              {d.conditions.map((cnd) => (
                <button key={cnd.label} onClick={() => onPickCond(cnd.label)} style={{ flex: 1, minHeight: 48, borderRadius: 10, border: `1px solid ${cnd.border}`, background: cnd.bg, color: cnd.fg, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 500 }}>{cnd.label}</button>
              ))}
            </div>
          </div>

          {/* submit */}
          <button onClick={onSubmit} style={{ width: "100%", marginTop: 22, minHeight: 52, borderRadius: 12, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 15, fontWeight: 600, background: d.btnBg, color: d.btnFg }}>{d.btnLabel}</button>
        </div>
      </div>
    </div>
  );
}
