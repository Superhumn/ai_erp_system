// The material "mark" — a Phosphor icon + two-letter code in a tile tinted by
// the material's state. Icon never carries meaning alone; the code always sits
// beside it (greyscale / colour-blind safe). Sizes match the design's per-view
// specs (46×34 runway, 46×32 journeys, 44×32 plant wall, 44×30 today rail, …).

import { markFor } from "@shared/freight-control-tower/marks";
import { toneHex, type Palette } from "./palette";
import { alpha, FONT_MONO } from "./tokens";

interface MarkProps {
  sku: string;
  palette: Palette;
  /** tile width in px (height derives unless `h` given) */
  w?: number;
  h?: number;
  /** icon side in px */
  icon?: number;
  /** code font-size in px */
  code?: number;
  radius?: number;
  gap?: number;
}

export function Mark({ sku, palette, w = 46, h = 34, icon = 17, code = 13, radius = 8, gap = 5 }: MarkProps) {
  const m = markFor(sku);
  const fg = toneHex(palette, m.tone);
  return (
    <div
      style={{
        width: w,
        height: h,
        flex: "none",
        borderRadius: radius,
        background: alpha(fg, 0.086), // ≈ +'16'
        border: `1px solid ${alpha(fg, 0.302)}`, // ≈ +'4D'
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap,
      }}
    >
      <svg viewBox="0 0 256 256" width={icon} height={icon} fill={fg} style={{ flex: "none" }}>
        <path d={m.iconPath} />
      </svg>
      <span style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: code, color: fg }}>{m.code}</span>
    </div>
  );
}

/** A bare icon glyph (no tile) for board cells / milestones. */
export function Glyph({ iconPath, color, size = 16 }: { iconPath: string; color: string; size?: number }) {
  return (
    <svg viewBox="0 0 256 256" width={size} height={size} fill="currentColor" style={{ flex: "none", color }}>
      <path d={iconPath} />
    </svg>
  );
}
