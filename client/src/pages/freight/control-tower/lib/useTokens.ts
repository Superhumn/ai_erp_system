import { useEffect, useState } from "react";
import { readTokens } from "./tokens";
import { makePalette, type Palette } from "./palette";

/**
 * The resolved `--erp-*` palette, re-read whenever the host theme flips.
 *
 * Colours consumed by the derivation logic (bar fills, hatch tints) are read
 * once from `getComputedStyle` — but the ERP toggles light/dark by stamping a
 * `.dark` class on <html>, so we observe that class and re-snapshot, which
 * re-runs every downstream `useMemo(..., [palette])`.
 */
export function usePalette(): Palette {
  const [palette, setPalette] = useState<Palette>(() => makePalette(readTokens()));

  useEffect(() => {
    const root = document.documentElement;
    const obs = new MutationObserver(() => setPalette(makePalette(readTokens())));
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    // Re-read once after mount in case fonts/vars settled after first paint.
    setPalette(makePalette(readTokens()));
    return () => obs.disconnect();
  }, []);

  return palette;
}
