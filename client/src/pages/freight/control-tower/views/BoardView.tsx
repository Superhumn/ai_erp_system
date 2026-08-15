import { Glyph } from "../lib/Mark";
import { v, FONT_MONO, FONT_SANS, rowActivate } from "../lib/tokens";
import type { Palette } from "../lib/palette";
import { HEADERS, GRID_COLS, type BoardGroup, type Cell, type Pivot } from "../lib/selectors";

interface Props {
  groups: BoardGroup[];
  empty: boolean;
  palette: Palette;
  collapsed: Record<string, boolean>;
  onOpen: (ref: string) => void;
  onPivot: (p: Pivot) => void;
  onDocs: (ref: string) => void;
  onToggle: (key: string) => void;
}

function CellView({ c, C, onPivot, onDocs }: { c: Cell; C: Palette; onPivot: (p: Pivot) => void; onDocs: (ref: string) => void }) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const topClickable = !!c.topPivot || !!c.topDocsRef;
  return (
    <div style={{ minWidth: 0, textAlign: c.align }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: c.align === "right" ? "flex-end" : "flex-start" }}>
        {c.hasIcon && c.iconPath && <Glyph iconPath={c.iconPath} color={c.iconColor || C.mid} size={16} />}
        {c.hasBadge && (
          <span style={{ fontFamily: FONT_MONO, fontSize: 8.5, letterSpacing: ".7px", padding: "1px 5px", borderRadius: 3, flex: "none", background: `${c.badgeColor || C.mid}22`, color: c.badgeColor || C.mid }}>{c.badge}</span>
        )}
        {c.hasPips && (
          <span style={{ display: "flex", gap: 2, flex: "none" }}>
            {c.pips!.map((p, i) => <span key={i} style={{ width: 4, height: 13, borderRadius: 1, background: p.color }} />)}
          </span>
        )}
        <span
          onClick={topClickable ? (e) => { stop(e); if (c.topPivot) onPivot(c.topPivot); else if (c.topDocsRef) onDocs(c.topDocsRef); } : undefined}
          style={{ fontFamily: c.topMono ? FONT_MONO : FONT_SANS, fontSize: c.topSize, fontWeight: c.topWeight, color: c.topColor, cursor: topClickable ? "pointer" : "inherit", borderBottom: topClickable ? `1px dotted ${v("line-muted")}` : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {c.top}
        </span>
      </div>
      {c.hasBottom && (
        <div style={{ display: "flex", justifyContent: c.align === "right" ? "flex-end" : "flex-start" }}>
          <span
            onClick={c.bottomPivot ? (e) => { stop(e); onPivot(c.bottomPivot!); } : undefined}
            style={{ fontFamily: c.bottomMono ? FONT_MONO : FONT_SANS, fontSize: 10, marginTop: 3, color: c.bottomColor, cursor: c.bottomPivot ? "pointer" : "inherit", borderBottom: c.bottomPivot ? `1px dotted ${v("line-muted")}` : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {c.bottom}
          </span>
        </div>
      )}
      {c.hasBar && (
        <div style={{ height: 3, background: v("border-strong"), borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
          <div style={{ height: "100%", width: c.barPct, background: c.barColor }} />
        </div>
      )}
    </div>
  );
}

export function BoardView({ groups, empty, palette: C, onOpen, onPivot, onDocs, onToggle }: Props) {
  return (
    <div style={{ flex: 1, overflow: "auto" }}>
      <div style={{ minWidth: 1260 }}>
        {/* sticky header */}
        <div style={{ position: "sticky", top: 0, zIndex: 5, display: "grid", gridTemplateColumns: GRID_COLS, gap: 12, padding: "10px 20px", background: v("surface"), borderBottom: `1px solid ${v("border-strong")}`, fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: "1px", textTransform: "uppercase", color: v("text-dim") }}>
          {HEADERS.map((h, i) => <div key={i} style={{ textAlign: h.align }}>{h.label}</div>)}
        </div>

        {groups.map((grp) => (
          <div key={grp.key}>
            {grp.isGroup && (
              <div onClick={() => onToggle(grp.key)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 20px", background: v("surface-2"), borderBottom: `1px solid ${v("border-strong")}`, borderTop: `1px solid ${v("border-strong")}`, cursor: "pointer" }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: v("text-dim"), width: 9 }}>{grp.rows.length ? "▾" : "▸"}</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: ".7px", padding: "2px 6px", borderRadius: 3, background: grp.tagBg, color: grp.tagFg }}>{grp.tag}</span>
                <span onClick={(e) => { e.stopPropagation(); if (grp.drill) onPivot(grp.drill); }} style={{ fontSize: 13, fontWeight: 600, cursor: "pointer", borderBottom: `1px dotted ${v("line-muted")}` }}>{grp.title}</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: v("text-dim") }}>{grp.meta}</span>
                <div style={{ flex: 1 }} />
                {grp.stats.map((st, i) => (
                  <div key={i} style={{ textAlign: "right", minWidth: 86 }}>
                    <div style={{ fontFamily: FONT_MONO, fontSize: 8.5, letterSpacing: "1px", textTransform: "uppercase", color: v("text-faint") }}>{st.k}</div>
                    <div style={{ fontFamily: FONT_MONO, fontSize: 12, marginTop: 3, color: st.color }}>{st.v}</div>
                  </div>
                ))}
              </div>
            )}
            {grp.rows.map((r) => (
              <div
                key={r.ref}
                onClick={() => onOpen(r.ref)}
                {...rowActivate(() => onOpen(r.ref))}
                style={{ display: "grid", gridTemplateColumns: GRID_COLS, gap: 12, padding: "11px 20px", borderBottom: `1px solid ${v("line")}`, cursor: "pointer", alignItems: "center", borderLeft: `2px solid ${r.riskBar}` }}
              >
                {r.cells.map((c, i) => <CellView key={i} c={c} C={C} onPivot={onPivot} onDocs={onDocs} />)}
              </div>
            ))}
          </div>
        ))}

        {empty && (
          <div style={{ padding: "60px 20px", textAlign: "center", color: v("text-faint"), fontSize: 13 }}>No movements match this view.</div>
        )}
      </div>
    </div>
  );
}
