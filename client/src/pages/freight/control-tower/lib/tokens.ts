/**
 * Theme token access for the Freight Control Tower.
 *
 * The board is themed entirely through the `--erp-*` CSS custom properties
 * declared in `client/src/index.css` (light on `:root`, dark on `.dark`).
 *
 * Two ways the tokens are consumed:
 *
 *  1. **In markup** — reference `var(--erp-xxx)` directly in inline styles.
 *     Tints derive live via `color-mix(in srgb, var(--erp-xxx) N%, transparent)`.
 *
 *  2. **In logic** — a handful of derivations (mark tints, urgency colours)
 *     need the resolved hex value as a string so they can append an alpha
 *     suffix (`+ '16'`). Those read from a snapshot taken once at mount via
 *     `getComputedStyle`. In a themed app the snapshot must be re-taken when
 *     the theme flips, so `readTokens()` is exposed and the root component
 *     re-reads it on an observed `.dark` class change.
 */

export const ERP_TOKEN_NAMES = [
  "bg",
  "surface",
  "surface-2",
  "line",
  "border",
  "border-strong",
  "control",
  "line-muted",
  "text",
  "text-2",
  "text-3",
  "text-dim",
  "text-faint",
  "success",
  "warning",
  "warning-2",
  "warning-dark",
  "danger",
  "danger-2",
  "info",
  "info-2",
  "accent",
  "teal",
  "magenta",
] as const;

export type ErpTokenName = (typeof ERP_TOKEN_NAMES)[number];

/** Resolved hex string per token, e.g. `{ teal: "#0F766E", ... }`. */
export type Tokens = Record<ErpTokenName, string>;

/** Neutral light-mode fallbacks, used before mount / in non-DOM contexts. */
const FALLBACK: Tokens = {
  bg: "#FFFFFF",
  surface: "#FAFAFA",
  "surface-2": "#F4F4F5",
  line: "#EDEDED",
  border: "#E0E0E0",
  "border-strong": "#D2D2D2",
  control: "#C0C0C0",
  "line-muted": "#A6A6A6",
  text: "#18181B",
  "text-2": "#3F3F46",
  "text-3": "#52525B",
  "text-dim": "#71717A",
  "text-faint": "#A1A1AA",
  success: "#15803D",
  warning: "#B45309",
  "warning-2": "#C2740D",
  "warning-dark": "#92400E",
  danger: "#B91C1C",
  "danger-2": "#DC2626",
  info: "#1D4ED8",
  "info-2": "#3B82F6",
  accent: "#6D28D9",
  teal: "#0F766E",
  magenta: "#9D174D",
};

/** Read every `--erp-*` token off the document root into a hex snapshot. */
export function readTokens(): Tokens {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { ...FALLBACK };
  }
  const cs = getComputedStyle(document.documentElement);
  const out = {} as Tokens;
  for (const name of ERP_TOKEN_NAMES) {
    const raw = cs.getPropertyValue(`--erp-${name}`).trim();
    out[name] = raw || FALLBACK[name];
  }
  return out;
}

/** `var(--erp-name)` for use directly in inline styles. */
export function v(name: ErpTokenName): string {
  return `var(--erp-${name})`;
}

/**
 * Append a 2-digit hex alpha to a resolved hex colour — the prototype's
 * `stateColor + '16'` idiom. `alpha` is 0..1. Tokens are guaranteed
 * 6-digit hex, so this yields a valid 8-digit hex string.
 */
export function alpha(hex: string, a: number): string {
  const clamped = Math.max(0, Math.min(1, a));
  const suffix = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${suffix}`;
}

/** `color-mix` tint of a token against transparent, for live-in-markup tints. */
export function tint(name: ErpTokenName, pct: number): string {
  return `color-mix(in srgb, var(--erp-${name}) ${pct}%, transparent)`;
}

export const FONT_SANS =
  "'Space Grotesk', system-ui, -apple-system, sans-serif";
export const FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace";

/**
 * Props that make a clickable row keyboard-activatable — focusable and openable
 * with Enter/Space — without changing its layout. Spread alongside `onClick`.
 */
export function rowActivate(fn: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onKeyDown: (e: import("react").KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fn();
      }
    },
  };
}
