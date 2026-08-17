// Resolve the `--erp-*` token snapshot into the `C` palette the derivation
// logic uses (same short keys the prototype used), plus alpha-suffix tinting.

import { readTokens, type Tokens } from "./tokens";

export interface Palette {
  bg: string; surface: string; surface2: string; line: string;
  border: string; borderStrong: string; control: string; lineMuted: string;
  text: string; text2: string; mid: string; dim: string; faint: string;
  green: string; amber: string; amber2: string; amberDark: string;
  red: string; red2: string; blue: string; blue2: string;
  violet: string; cyan: string; magenta: string;
}

/** Build the `C` palette from a resolved `--erp-*` token snapshot. */
export function makePalette(t: Tokens): Palette {
  return {
    bg: t.bg,
    surface: t.surface,
    surface2: t["surface-2"],
    line: t.line,
    border: t.border,
    borderStrong: t["border-strong"],
    control: t.control,
    lineMuted: t["line-muted"],
    text: t.text,
    text2: t["text-2"],
    mid: t["text-3"],
    dim: t["text-dim"],
    faint: t["text-faint"],
    green: t.success,
    amber: t.warning,
    amber2: t["warning-2"],
    amberDark: t["warning-dark"],
    red: t.danger,
    red2: t["danger-2"],
    blue: t.info,
    blue2: t["info-2"],
    violet: t.accent,
    cyan: t.teal,
    magenta: t.magenta,
  };
}

/** Resolve a tone token name (from the shared fixtures) to a palette hex. */
export function toneHex(
  p: Palette,
  tone: "danger" | "warning" | "info" | "success" | "accent" | "teal" | "magenta" | "neutral",
): string {
  switch (tone) {
    case "danger": return p.red;
    case "warning": return p.amber;
    case "info": return p.blue;
    case "success": return p.green;
    case "accent": return p.violet;
    case "teal": return p.cyan;
    case "magenta": return p.magenta;
    default: return p.mid;
  }
}

export function currentPalette(): Palette {
  return makePalette(readTokens());
}
