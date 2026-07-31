import { Frame, Main } from "../primitives";

const capStyle: React.CSSProperties = {
  margin: "0 0 5px",
  padding: "0 12px",
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "oklch(0.66 0.012 260)",
};

const itemStyle: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 13.5,
  color: "oklch(0.40 0.02 262)",
};

const chipStyle: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: "oklch(0.35 0.02 262)",
  background: "oklch(0.955 0.004 250)",
  borderRadius: 9999,
  padding: "4px 11px",
};

const agentTag: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  color: "oklch(0.35 0.02 262)",
  background: "oklch(0.945 0.004 250)",
  borderRadius: 9999,
  padding: "2px 8px",
};

export default function AIEverywhere() {
  return (
    <Frame label="5d AI Everywhere" height={880}>
      {/* Sidebar (bespoke — larger scale than the shared nav) */}
      <div
        style={{
          width: 110,
          boxSizing: "border-box",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid oklch(0.93 0.004 250 / 0.6)",
          background: "oklch(0.986 0.002 250)",
          padding: "12px 6px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 10px" }}>
          <div
            style={{
              height: 28,
              width: 28,
              borderRadius: 8,
              background: "linear-gradient(135deg, oklch(0.55 0.22 258), oklch(0.42 0.21 255))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 800,
              fontSize: 14,
              fontFamily: "'DM Sans',sans-serif",
            }}
          >
            S
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", fontFamily: "'DM Sans',sans-serif" }}>
            superhumn
          </span>
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            gap: 12,
            marginTop: 10,
          }}
        >
          <div>
            <p style={capStyle}>Overview</p>
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                padding: "7px 12px",
                borderRadius: 8,
                background: "#fff",
                color: "oklch(0.40 0.21 255)",
                fontSize: 13.5,
                fontWeight: 600,
                boxShadow: "0 1px 2px rgba(15,25,70,0.06), 0 4px 12px rgba(15,25,70,0.04)",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  top: 7,
                  bottom: 7,
                  width: 3,
                  borderRadius: 2,
                  background: "oklch(0.47 0.21 255)",
                }}
              />
              Home
            </div>
            <div style={itemStyle}>Projects</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: 13.5, color: "oklch(0.40 0.02 262)" }}>
              <span>Inbox</span>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: "#fff",
                  background: "oklch(0.47 0.21 255)",
                  borderRadius: 9999,
                  padding: "1px 7px",
                }}
              >
                12
              </span>
            </div>
          </div>

          <div>
            <p style={capStyle}>Sales</p>
            <div style={itemStyle}>Orders</div>
            <div style={itemStyle}>CRM</div>
          </div>

          <div>
            <p style={capStyle}>Finance</p>
            <div style={itemStyle}>Finance</div>
            <div style={itemStyle}>Fundraising</div>
          </div>

          <div>
            <p style={capStyle}>Operations</p>
            <div style={itemStyle}>Inventory</div>
            <div style={itemStyle}>Procurement</div>
            <div style={itemStyle}>Logistics</div>
          </div>

          <div>
            <p style={capStyle}>People</p>
            <div style={itemStyle}>HR</div>
            <div style={itemStyle}>Legal</div>
          </div>
        </div>

        <div
          style={{
            borderTop: "1px solid oklch(0.93 0.004 250 / 0.6)",
            paddingTop: 12,
            display: "flex",
            alignItems: "center",
            gap: 10,
            paddingLeft: 6,
          }}
        >
          <div
            style={{
              height: 28,
              width: 28,
              borderRadius: 9999,
              background: "oklch(0.47 0.21 255 / 0.12)",
              color: "oklch(0.42 0.21 255)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11.5,
              fontWeight: 700,
            }}
          >
            A
          </div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Alex Chen</p>
        </div>
      </div>

      {/* Host area: ghosted dashboard + ⌘K side bar */}
      <div style={{ flex: 1, display: "flex", minWidth: 0 }}>
        <Main>
          {/* Ghosted dashboard behind the palette */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ height: 10, width: 90, borderRadius: 5, background: "oklch(0.93 0.004 250)" }} />
              <div style={{ height: 18, width: 200, borderRadius: 6, background: "oklch(0.90 0.005 250)", marginTop: 8 }} />
            </div>
            <div style={{ height: 36, width: 380, borderRadius: 9999, background: "oklch(0.92 0.005 250)" }} />
          </div>

          <div style={{ display: "flex", gap: 28, marginTop: 26 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ flex: 1 }}>
                <div style={{ height: 8, width: 70, borderRadius: 4, background: "oklch(0.94 0.004 250)" }} />
                <div style={{ height: 22, width: 110, borderRadius: 6, background: "oklch(0.91 0.005 250)", marginTop: 8 }} />
              </div>
            ))}
          </div>

          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: 32, marginTop: 26 }}>
            <div style={{ background: "oklch(0.965 0.003 250)", borderRadius: 18 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ flex: 1, background: "oklch(0.955 0.004 250)", borderRadius: 14 }} />
              <div style={{ flex: 1, background: "oklch(0.955 0.004 250)", borderRadius: 14 }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ flex: 1, background: "oklch(0.955 0.004 250)", borderRadius: 14 }} />
              <div style={{ flex: 1, background: "oklch(0.955 0.004 250)", borderRadius: 14 }} />
            </div>
          </div>
        </Main>

        {/* ⌘K bar pushes content over — nothing is covered */}
        <div
          style={{
            width: 350,
            flexShrink: 0,
            margin: "12px 12px 12px 0",
            display: "flex",
            flexDirection: "column",
            background: "rgba(255,255,255,0.78)",
            backdropFilter: "blur(28px)",
            WebkitBackdropFilter: "blur(28px)",
            border: "1px solid rgba(255,255,255,0.95)",
            borderRadius: 20,
            boxShadow: "-24px 0 64px rgba(10,20,60,0.15)",
            overflow: "hidden",
          }}
        >
          {/* Query row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "16px 20px",
              borderBottom: "1px solid oklch(0.93 0.004 250 / 0.8)",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="oklch(0.47 0.21 255)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
            </svg>
            <span style={{ flex: 1, fontSize: 14.5, color: "oklch(0.20 0.02 262)" }}>
              order 500kg lion's mane from fresh farms by friday
            </span>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                color: "oklch(0.55 0.015 260)",
                border: "1px solid oklch(0.90 0.005 250)",
                borderRadius: 6,
                padding: "2px 8px",
                background: "#fff",
              }}
            >
              esc
            </span>
          </div>

          {/* Parsed action */}
          <div style={{ padding: "14px 20px", borderBottom: "1px solid oklch(0.93 0.004 250 / 0.8)" }}>
            <p
              style={{
                margin: "0 0 10px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "oklch(0.55 0.015 260)",
              }}
            >
              Parsed action
            </p>
            <div
              style={{
                background: "#fff",
                border: "1px solid oklch(0.47 0.21 255 / 0.3)",
                borderRadius: 13,
                padding: "14px 16px",
                boxShadow: "0 4px 16px rgba(15,25,70,0.06)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>
                  Create purchase order
                </p>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "oklch(0.16 0.025 262)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  est. $16,000
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                <span style={chipStyle}>Material · Lion's Mane Extract</span>
                <span style={chipStyle}>Qty · 500 kg</span>
                <span style={chipStyle}>Vendor · Fresh Farms</span>
                <span style={chipStyle}>Needed · Fri Jul 24</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#fff",
                    background: "linear-gradient(135deg, oklch(0.55 0.22 258), oklch(0.44 0.21 255))",
                    borderRadius: 9999,
                    padding: "6px 16px",
                    cursor: "pointer",
                    boxShadow: "0 4px 12px oklch(0.47 0.21 255 / 0.35)",
                  }}
                >
                  Create draft ↵
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "oklch(0.40 0.02 262)",
                    border: "1px solid oklch(0.90 0.005 250)",
                    background: "#fff",
                    borderRadius: 9999,
                    padding: "6px 16px",
                    cursor: "pointer",
                  }}
                >
                  Edit details
                </span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: "oklch(0.35 0.02 262)" }}>
                  &gt; $5,000 — routes to approval
                </span>
              </div>
            </div>
          </div>

          {/* Or ask */}
          <div style={{ padding: "10px 20px 6px" }}>
            <p
              style={{
                margin: "0 0 4px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "oklch(0.55 0.015 260)",
              }}
            >
              Or ask
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", fontSize: 13, color: "oklch(0.35 0.02 262)" }}>
              <span style={{ color: "oklch(0.55 0.015 260)" }}>→</span>Which invoices are overdue?
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", fontSize: 13, color: "oklch(0.35 0.02 262)" }}>
              <span style={{ color: "oklch(0.55 0.015 260)" }}>→</span>Forecast August demand for Lion's Mane
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {/* Agents */}
          <div style={{ padding: "14px 20px", borderTop: "1px solid oklch(0.93 0.004 250 / 0.8)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>Agents</p>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: "oklch(0.38 0.02 262)",
                }}
              >
                <span
                  style={{
                    height: 6,
                    width: 6,
                    borderRadius: 9999,
                    background: "oklch(0.47 0.21 255)",
                    boxShadow: "0 0 8px oklch(0.47 0.21 255 / 0.5)",
                  }}
                />
                3 active
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 0",
                borderBottom: "1px solid oklch(0.94 0.004 250)",
                fontSize: 12,
              }}
            >
              <span style={{ fontWeight: 600 }}>Auto-reorder · PO-2045</span>
              <span style={agentTag}>AWAITING</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", fontSize: 12 }}>
              <span style={{ fontWeight: 600 }}>Collections · 3 reminders</span>
              <span style={agentTag}>AWAITING</span>
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 11, fontWeight: 600, color: "oklch(0.47 0.21 255)", cursor: "pointer" }}>
              Open approval queue →
            </p>
          </div>

          {/* Footer hint bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "10px 20px",
              borderTop: "1px solid oklch(0.93 0.004 250 / 0.8)",
              background: "rgba(255,255,255,0.6)",
              fontSize: 11,
              color: "oklch(0.58 0.015 260)",
            }}
          >
            <span>↑↓ navigate</span>
            <span>↵ run</span>
            <span>esc close</span>
          </div>
        </div>
      </div>
    </Frame>
  );
}
