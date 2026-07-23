import { Frame, Sidebar, Main } from "../primitives";

type Integration = { abbr: string; name: string; desc: string; foot: string };

const CONNECTED: Integration[] = [
  { abbr: "QB", name: "QuickBooks Online", desc: "Two-way sync · customers, invoices, COA", foot: "Last sync 12 min ago · 1,204 records" },
  { abbr: "Sh", name: "Shopify", desc: "Orders, customers, inventory, fulfillment", foot: "Last sync 4 min ago · 38 products" },
  { abbr: "G", name: "Google Workspace", desc: "Gmail, Sheets, Docs, Drive", foot: "Drive folder sync active" },
  { abbr: "SG", name: "SendGrid", desc: "Transactional email & delivery tracking", foot: "99.2% delivery · 30d" },
  { abbr: "IM", name: "IMAP Email", desc: "Inbound scanning & auto-categorization", foot: "12 unread in queue" },
];

const SETTINGS_NAV: { label: string; active?: boolean }[] = [
  { label: "General" },
  { label: "Team & roles" },
  { label: "Integrations", active: true },
  { label: "Notifications" },
  { label: "Automation" },
  { label: "Billing" },
];

export default function Settings() {
  return (
    <Frame label="9b Settings" height={440}>
      <Sidebar active="Home" />

      {/* Settings sub-nav */}
      <div
        style={{
          width: 150,
          flexShrink: 0,
          borderRight: "1px solid oklch(0.93 0.004 250 / 0.6)",
          padding: "16px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <p
          style={{
            margin: "0 0 8px",
            padding: "0 8px",
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            fontFamily: "'DM Sans',sans-serif",
          }}
        >
          Settings
        </p>
        {SETTINGS_NAV.map((n) =>
          n.active ? (
            <div
              key={n.label}
              style={{
                padding: "6px 8px",
                fontSize: 12.5,
                fontWeight: 600,
                color: "oklch(0.40 0.21 255)",
                background: "oklch(0.47 0.21 255 / 0.09)",
                borderRadius: 7,
              }}
            >
              {n.label}
            </div>
          ) : (
            <div
              key={n.label}
              style={{ padding: "6px 8px", fontSize: 12.5, color: "oklch(0.40 0.02 262)", borderRadius: 7 }}
            >
              {n.label}
            </div>
          ),
        )}
      </div>

      <Main style={{ padding: "16px 22px" }}>
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              fontFamily: "'DM Sans',sans-serif",
            }}
          >
            Integrations
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "oklch(0.58 0.015 260)" }}>
            Connect the tools your business already runs on · 5 of 7 connected
          </p>
        </div>

        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginTop: 14,
            alignContent: "start",
          }}
        >
          {CONNECTED.map((it) => (
            <div
              key={it.name}
              style={{
                border: "1px solid oklch(0.92 0.005 250)",
                borderRadius: 13,
                padding: "14px 16px",
                background: "#fff",
                boxShadow: "0 1px 2px rgba(15,25,70,0.04)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    height: 30,
                    width: 30,
                    borderRadius: 8,
                    background: "oklch(0.955 0.004 250)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: 13,
                    color: "oklch(0.30 0.02 262)",
                  }}
                >
                  {it.abbr}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{it.name}</p>
                  <p style={{ margin: "1px 0 0", fontSize: 11, color: "oklch(0.55 0.015 260)" }}>{it.desc}</p>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "oklch(0.40 0.21 255)",
                    background: "oklch(0.47 0.21 255 / 0.12)",
                    borderRadius: 9999,
                    padding: "2px 9px",
                  }}
                >
                  CONNECTED
                </span>
              </div>
              <p style={{ margin: "10px 0 0", fontSize: 11, color: "oklch(0.58 0.015 260)" }}>{it.foot}</p>
            </div>
          ))}

          {/* Not connected */}
          <div
            style={{
              border: "1px dashed oklch(0.88 0.008 250)",
              borderRadius: 13,
              padding: "14px 16px",
              background: "oklch(0.986 0.002 250)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  height: 30,
                  width: 30,
                  borderRadius: 8,
                  background: "oklch(0.955 0.004 250)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 13,
                  color: "oklch(0.55 0.015 260)",
                }}
              >
                Ff
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Fireflies.ai</p>
                <p style={{ margin: "1px 0 0", fontSize: 11, color: "oklch(0.55 0.015 260)" }}>
                  Meeting transcription & action items
                </p>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "oklch(0.40 0.21 255)",
                  background: "#fff",
                  border: "1px solid oklch(0.47 0.21 255 / 0.3)",
                  borderRadius: 9999,
                  padding: "4px 12px",
                  cursor: "pointer",
                }}
              >
                Connect
              </span>
            </div>
          </div>
        </div>
      </Main>
    </Frame>
  );
}
