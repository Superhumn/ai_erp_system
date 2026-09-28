import { describe, it, expect } from "vitest";
import { SHIPPING_MODES } from "./Carriers";

// Mirrors `shippingMode: z.enum([...])` on freight.discoverCarriers (server/routers/freight.ts).
const DISCOVER_SHIPPING_MODES = ["ocean", "air", "ground", "rail", "multimodal"];

describe("Carriers discover shipping modes", () => {
  it("only offers modes freight.discoverCarriers accepts", () => {
    for (const m of SHIPPING_MODES) {
      expect(DISCOVER_SHIPPING_MODES, `"${m.value}" is not accepted by discoverCarriers`).toContain(m.value);
    }
  });
});
