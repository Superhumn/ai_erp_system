import "./theme.css";
import { color as c, font } from "./tokens";
import { SCREENS } from "./screens/registry";

/**
 * Superhumn ERP — canonical screens gallery.
 *
 * Standalone route (`/superhumn`) rendering the design handoff's canonical
 * frames as pixel-accurate React, one final frame per module in nav order.
 * Each frame is self-contained (includes its own sidebar chrome), so this
 * renders outside the app's DashboardLayout — mirroring the handoff's own
 * gallery canvas.
 */
export default function SuperhumnGallery() {
  return (
    <div className="shumn-canvas" style={{ overflowX: "auto" }}>
      <section style={{ padding: "48px 48px 24px", display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ maxWidth: 1200 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", fontFamily: font.display }}>
            Superhumn ERP — canonical screens
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: c.ink3, lineHeight: 1.6 }}>
            The final frame per module, in nav order. Recreated as React from the design handoff. Frame badges keep
            their original exploration ids.
          </p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 48, alignItems: "flex-start" }}>
          {SCREENS.map(({ badge, title, Component }) => (
            <div key={badge} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: c.blue,
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 700,
                    borderRadius: 8,
                    padding: "4px 10px",
                    fontFamily: font.display,
                  }}
                >
                  {badge}
                </span>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
              </div>
              <Component />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
