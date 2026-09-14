/**
 * Superhumn ERP — design tokens (scoped).
 *
 * These mirror the values in the design handoff README verbatim so the
 * canonical screens can be recreated pixel-accurately without touching the
 * app's global "Clarity" theme. Everything here is opt-in: only the
 * `client/src/pages/superhumn/*` module consumes it.
 *
 * Colors are oklch; electric blue is the ONLY accent (actions / live /
 * selected / needs-you). Severity is expressed with dark-ink or weight,
 * never red/amber/green.
 */

export const color = {
  // Ink
  ink: "oklch(0.16 0.025 262)",
  ink2: "oklch(0.40 0.02 262)",
  ink3: "oklch(0.45 0.015 260)",
  muted: "oklch(0.50 0.015 260)",
  muted2: "oklch(0.55 0.015 260)",
  muted3: "oklch(0.58 0.015 260)",
  faint: "oklch(0.64 0.012 260)",
  faint2: "oklch(0.66 0.012 260)",
  faint3: "oklch(0.62 0.015 260)",
  inkSoft: "oklch(0.34 0.02 262)", // prose / secondary ink
  inkMid: "oklch(0.30 0.02 262)",
  done: "oklch(0.60 0.015 260)", // completed-task text (struck through)

  // Electric blue — the single accent
  blue: "oklch(0.47 0.21 255)",
  blueText: "oklch(0.40 0.21 255)",
  blueGrad: "linear-gradient(135deg, oklch(0.55 0.22 258), oklch(0.44 0.21 255))",
  blueGradBar: "linear-gradient(90deg, oklch(0.55 0.22 258), oklch(0.45 0.21 255))",
  blueTint: "oklch(0.47 0.21 255 / 0.12)",
  blueBright: "oklch(0.55 0.22 258)", // gradient start
  blueDeep: "oklch(0.44 0.21 255)", // gradient end
  blueGradV: "linear-gradient(180deg, oklch(0.55 0.22 258), oklch(0.44 0.21 255))",
  blueBorder: "oklch(0.47 0.21 255 / 0.2)",
  aiCard: "linear-gradient(180deg, oklch(0.985 0.01 258), #fff)",

  // Surfaces
  frame: "linear-gradient(180deg, #fff, oklch(0.984 0.003 252))",
  sidebar: "oklch(0.986 0.002 250)",
  groupHeader: "oklch(0.972 0.003 250)",
  chip: "oklch(0.945 0.004 250)",
  track: "oklch(0.945 0.004 250)",
  seg: "oklch(0.955 0.004 250)",
  sunken: "oklch(0.955 0.004 250)",
  sunken2: "oklch(0.955 0.003 250)",
  tintBase: "oklch(0.984 0.003 252)",

  // Borders
  border: "oklch(0.90 0.005 250)",
  divider: "oklch(0.93 0.004 250 / 0.6)",
  rowSep: "oklch(0.95 0.003 250)",
  borderLight: "oklch(0.93 0.004 250)",
  borderInput: "oklch(0.85 0.008 250)",
  rowSepSoft: "oklch(0.955 0.003 250)",

  // Positive / paid
  success: "oklch(0.45 0.16 162)",

  // Dark meter fill (near / over capacity) — never red/amber/green
  darkFill: "oklch(0.30 0.03 262)",
  darkChip: "oklch(0.30 0.02 262)",

  // Canvas the frames sit on (matches the handoff gallery)
  canvas: "oklch(0.955 0.003 250)",
} as const;

export const shadow = {
  frame: "0 32px 64px -32px rgba(15,25,70,0.25)",
  cta: "0 4px 12px oklch(0.47 0.21 255 / 0.35)",
  card: "0 1px 2px rgba(15,25,70,0.06)",
  row: "0 1px 2px rgba(15,25,70,0.05)",
  pill: "0 1px 3px rgba(15,25,70,0.08)",
  raised: "0 4px 12px rgba(15,25,70,0.10)",
  popover: "0 12px 32px rgba(15,25,70,0.18)",
  modal: "0 16px 48px rgba(15,25,70,0.16)",
} as const;

/** Electric-blue tint at an explicit alpha (0.04 … 0.14 in the tracker). */
export const blueTint = (alpha: number) => `oklch(0.47 0.21 255 / ${alpha})`;

/**
 * Production type scale for the dense project-tracker screens. The handoff
 * prototypes are drawn at ~0.72×; these are the ×1.4 values rounded to the
 * repo's existing scale (README "Design Tokens → Typography").
 */
export const type = {
  micro: 11, // eyebrow / column header (uppercase, tracked, 700)
  body: 13, // table / row body
  num: 14, // numerals / dates
  cardTitle: 15,
  section: 16,
  title: 18, // screen title
  stat: 28, // big stat
} as const;

export const font = {
  display: "'DM Sans', sans-serif", // headings + numbers, tabular-nums
  body: "'Inter Tight', sans-serif", // body / UI
} as const;

export const radius = {
  frame: 16,
  panel: 14,
  card: 12,
  group: 10,
  cardSm: 8,
  navActive: 8,
  row: 6,
  miniChip: 6,
  check: 4,
  micro: 3,
  pill: 9999,
} as const;

/** Micro-caps label style (9–10px / 700 / tracked / uppercase / faint ink). */
export const microCaps = (size = 10, tone: string = color.faint): React.CSSProperties => ({
  margin: 0,
  fontSize: size,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: tone,
});

export const tabular: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };
