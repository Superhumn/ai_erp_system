import { Mark } from "../lib/Mark";
import { v, FONT_MONO, rowActivate } from "../lib/tokens";
import type { Palette } from "../lib/palette";
import type { WallCard } from "../lib/selectors";

interface Props {
  cards: WallCard[];
  palette: Palette;
  onOpen: (ref: string) => void;
}

export function PlantWallView({ cards, palette: C, onOpen }: Props) {
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
      <div style={{ display: "flex", gap: 20, paddingBottom: 14, fontFamily: FONT_MONO, fontSize: 10, color: v("text-dim"), flexWrap: "wrap" }}>
        <span>Number and bar = days of cover on hand</span>
        <span style={{ color: v("danger") }}>● projected gap before the next arrival</span>
        <span style={{ color: v("warning") }}>● under 14 days</span>
        <span style={{ color: v("success") }}>● covered</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(280px, 1fr))", gap: 16 }}>
        {cards.map((p) => (
          <div key={p.code} style={{ border: `1px solid ${p.border}`, borderRadius: 11, background: p.bg, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontFamily: FONT_MONO, fontSize: 15, fontWeight: 600, letterSpacing: "1px", color: v("text") }}>{p.code}</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontFamily: FONT_MONO, fontSize: 30, letterSpacing: "-1.5px", lineHeight: 1, color: p.dot }}>{p.min}</span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: ".6px", color: v("text-faint") }}>DAYS</span>
            </div>
            <div style={{ fontSize: 11.5, color: v("text-dim"), marginBottom: 14 }}>{p.name}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {p.items.map((s) => (
                <div key={s.sku} onClick={() => s.ref && onOpen(s.ref)} {...(s.ref ? rowActivate(() => onOpen(s.ref!)) : {})} style={{ display: "flex", alignItems: "center", gap: 10, cursor: s.rowCursor }}>
                  <Mark sku={s.sku} palette={C} w={44} h={32} icon={16} code={12} radius={7} gap={4} />
                  <div style={{ flex: 1, height: 9, borderRadius: 5, background: v("line"), position: "relative" }}>
                    <div style={{ position: "absolute", inset: "0 auto 0 0", width: s.barW, borderRadius: 5, background: s.color }} />
                  </div>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 16, letterSpacing: "-.5px", color: s.color, minWidth: 28, textAlign: "right" }}>{s.days}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
