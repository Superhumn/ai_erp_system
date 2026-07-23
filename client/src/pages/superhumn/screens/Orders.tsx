import { color as c, font } from "../tokens";
import { Frame, Sidebar, Main, Header, KpiStrip, Segmented, CTA, StatusChip, type ChipTone } from "../primitives";

type OrderRow = {
  id: string;
  idColor: string;
  customer: string;
  channel: string;
  placed: string;
  items: string;
  total: string;
  status: string;
  tone: ChipTone;
  highlight?: boolean;
};

const ROWS: OrderRow[] = [
  { id: "SO-4112", idColor: "oklch(0.42 0.21 255)", customer: "Erewhon Market", channel: "Wholesale", placed: "Jul 18", items: "6", total: "$12,840", status: "CONFIRM", tone: "active", highlight: true },
  { id: "SO-4111", idColor: "oklch(0.45 0.015 260)", customer: "D. Whitfield", channel: "Shopify", placed: "Jul 18", items: "2", total: "$86", status: "PICK", tone: "active" },
  { id: "SO-4110", idColor: "oklch(0.45 0.015 260)", customer: "Thrive Market", channel: "Wholesale", placed: "Jul 17", items: "12", total: "$18,220", status: "PROCESSING", tone: "neutral" },
  { id: "SO-4109", idColor: "oklch(0.45 0.015 260)", customer: "K. Ramos", channel: "Shopify", placed: "Jul 17", items: "1", total: "$34", status: "SHIPPED", tone: "neutral" },
  { id: "SO-4108", idColor: "oklch(0.45 0.015 260)", customer: "Lassens", channel: "Wholesale", placed: "Jul 16", items: "8", total: "$6,480", status: "SHIPPED", tone: "neutral" },
  { id: "SO-4107", idColor: "oklch(0.45 0.015 260)", customer: "M. Osei", channel: "Shopify", placed: "Jul 16", items: "3", total: "$127", status: "RETURN", tone: "dark" },
  { id: "SO-4106", idColor: "oklch(0.45 0.015 260)", customer: "Bristol Farms", channel: "Wholesale", placed: "Jul 15", items: "5", total: "$4,120", status: "DELIVERED", tone: "neutral" },
  { id: "SO-4105", idColor: "oklch(0.45 0.015 260)", customer: "R. Tanaka", channel: "Shopify", placed: "Jul 15", items: "4", total: "$156", status: "DELIVERED", tone: "neutral" },
  { id: "SO-4104", idColor: "oklch(0.45 0.015 260)", customer: "GoPuff Wellness", channel: "Wholesale", placed: "Jul 14", items: "3", total: "$2,310", status: "DELIVERED", tone: "neutral" },
  { id: "SO-4103", idColor: "oklch(0.45 0.015 260)", customer: "S. Alvarez", channel: "Shopify", placed: "Jul 14", items: "1", total: "$62", status: "DELIVERED", tone: "neutral" },
  { id: "SO-4102", idColor: "oklch(0.45 0.015 260)", customer: "Erewhon Market", channel: "Wholesale", placed: "Jul 13", items: "7", total: "$9,340", status: "DELIVERED", tone: "neutral" },
  { id: "SO-4101", idColor: "oklch(0.45 0.015 260)", customer: "Thrive Market", channel: "Wholesale", placed: "Jul 12", items: "10", total: "$14,780", status: "DELIVERED", tone: "neutral" },
];

const headCell = (align: "left" | "right" | "center"): React.CSSProperties => ({
  textAlign: align,
  padding: "5px 8px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "oklch(0.62 0.015 260)",
  borderBottom: "1px solid oklch(0.92 0.005 250)",
});

const PANEL_ITEMS: { name: string; qty: string; total: string }[] = [
  { name: "Lion's Mane 500g", qty: "240 × $28", total: "$6,720" },
  { name: "Focus Blend", qty: "120 × $34", total: "$4,080" },
  { name: "Reishi 90ct", qty: "80 × $25.50", total: "$2,040" },
];

export default function Orders() {
  return (
    <Frame label="6a Orders" height={680}>
      <Sidebar active="Orders" />
      <Main>
        <Header
          title="Orders"
          subtitle="Shopify + wholesale · synced 4 min ago"
          right={
            <>
              <Segmented options={["All", "Unfulfilled", "Shipped", "Returns"]} value="All" />
              <CTA>+ New order</CTA>
            </>
          }
        />
        <KpiStrip
          items={[
            { label: "Open orders", value: "23" },
            { label: "Needs fulfillment", value: "9", highlight: true },
            { label: "Revenue MTD", value: "$128,340" },
            { label: "Returns", value: "2" },
          ]}
        />

        <div style={{ flex: 1, marginTop: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={headCell("left")}>Order</th>
                <th style={headCell("left")}>Customer</th>
                <th style={headCell("left")}>Channel</th>
                <th style={headCell("left")}>Placed</th>
                <th style={headCell("right")}>Items</th>
                <th style={headCell("right")}>Total</th>
                <th style={headCell("center")}>Status</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, i) => (
                <tr
                  key={r.id}
                  style={{
                    background: r.highlight ? "oklch(0.47 0.21 255 / 0.05)" : undefined,
                    borderBottom: i === ROWS.length - 1 ? undefined : "1px solid oklch(0.95 0.003 250)",
                  }}
                >
                  <td style={{ padding: "6px 8px", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5, color: r.idColor }}>{r.id}</td>
                  <td style={{ padding: "6px 8px", fontWeight: 600 }}>{r.customer}</td>
                  <td style={{ padding: "6px 8px", color: "oklch(0.50 0.015 260)" }}>{r.channel}</td>
                  <td style={{ padding: "6px 8px", color: "oklch(0.50 0.015 260)" }}>{r.placed}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.items}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{r.total}</td>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>
                    <StatusChip tone={r.tone}>{r.status}</StatusChip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Main>

      {/* Glass detail panel */}
      <div
        style={{
          width: 300,
          flexShrink: 0,
          margin: "14px 14px 14px 0",
          background: "rgba(255,255,255,0.72)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.9)",
          borderRadius: 20,
          padding: 18,
          boxShadow: "0 16px 48px rgba(15,25,70,0.16)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", fontFamily: font.display }}>SO-4112</p>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "oklch(0.55 0.015 260)" }}>Erewhon Market · Net 30</p>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color: "oklch(0.40 0.21 255)", background: "oklch(0.47 0.21 255 / 0.12)", borderRadius: 9999, padding: "3px 10px" }}>CONFIRM</span>
        </div>

        <div style={{ marginTop: 14 }}>
          <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "oklch(0.62 0.015 260)" }}>Items</p>
          {PANEL_ITEMS.map((it, i) => (
            <div
              key={it.name}
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
                padding: "6px 0",
                borderBottom: i === PANEL_ITEMS.length - 1 ? undefined : "1px solid rgba(255,255,255,0.9)",
              }}
            >
              <span style={{ fontWeight: 600 }}>{it.name}</span>
              <span style={{ color: "oklch(0.55 0.015 260)" }}>{it.qty}</span>
              <span style={{ fontWeight: 600 }}>{it.total}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, background: "rgba(255,255,255,0.85)", borderRadius: 11, padding: "10px 12px" }}>
          <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "oklch(0.62 0.015 260)" }}>Stock check</p>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: "oklch(0.35 0.02 262)" }}>
            All lines coverable from Main Warehouse. Reserving stock will drop Reishi below reorder point — PO-2041 arrives Jul 19.
          </p>
        </div>

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          <span
            style={{
              textAlign: "center",
              fontSize: 12.5,
              fontWeight: 600,
              color: "#fff",
              background: "linear-gradient(135deg, oklch(0.55 0.22 258), oklch(0.44 0.21 255))",
              borderRadius: 9999,
              padding: "9px 0",
              cursor: "pointer",
              boxShadow: "0 4px 12px oklch(0.47 0.21 255 / 0.35)",
            }}
          >
            Confirm &amp; reserve stock
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 600, color: c.ink2, border: `1px solid ${c.border}`, background: "#fff", borderRadius: 9999, padding: "8px 0", cursor: "pointer" }}>Invoice</span>
            <span style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 600, color: c.ink2, border: `1px solid ${c.border}`, background: "#fff", borderRadius: 9999, padding: "8px 0", cursor: "pointer" }}>Ship</span>
          </div>
        </div>
      </div>
    </Frame>
  );
}
