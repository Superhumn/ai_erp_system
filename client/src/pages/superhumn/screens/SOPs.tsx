import { color as c, font } from "../tokens";
import { Frame, Sidebar, Main, Header, KpiStrip, Segmented, CTA, StatusChip, AICard } from "../primitives";

const caps: React.CSSProperties = {
  margin: "0 0 6px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: c.faint,
};

const CATEGORIES: { label: string; count: string; active?: boolean }[] = [
  { label: "Production", count: "42", active: true },
  { label: "Quality / QA", count: "28" },
  { label: "Warehouse", count: "24" },
  { label: "Onboarding", count: "15" },
  { label: "Finance", count: "11" },
  { label: "Safety", count: "8" },
];

type Sop = { title: string; meta: string; status: "CURRENT" | "REVIEW"; highlight?: boolean };

const SOPS: Sop[] = [
  { title: "Line 2 changeover procedure", meta: "Tom N. · updated Jul 10 · v4", status: "CURRENT", highlight: true },
  { title: "Batch record completion", meta: "Elena R. · updated Jun 22 · v7", status: "CURRENT" },
  { title: "Raw material receiving", meta: "Leo G. · updated May 2 · v3", status: "REVIEW" },
  { title: "Allergen changeover", meta: "Elena R. · updated Apr 18 · v2", status: "REVIEW" },
  { title: "Equipment sanitation", meta: "Tom N. · updated Jul 1 · v5", status: "CURRENT" },
  { title: "Downtime logging", meta: "Grace L. · updated Mar 9 · v1", status: "REVIEW" },
  { title: "Finished goods pack-out", meta: "Marcus B. · updated Jun 30 · v2", status: "CURRENT" },
];

const STEPS: string[] = [
  "Stop line and lock out power at the main disconnect.",
  "Remove and label current tooling; stage in changeover cart.",
  "Clean contact surfaces per sanitation SOP.",
  "Install new format parts; torque to spec sheet.",
  "Run 5-unit test batch and verify weights.",
];

export default function SOPs() {
  return (
    <Frame label="10h SOPs" height={680}>
      <Sidebar active="SOPs" />
      <Main>
        <Header
          title="SOPs"
          subtitle="Standard operating procedures & knowledge base"
          right={
            <>
              <Segmented options={["Library", "Drafts", "Review"]} value="Library" />
              <CTA>+ New SOP</CTA>
            </>
          }
        />
        <KpiStrip
          items={[
            { label: "Documents", value: "128" },
            { label: "Need review", value: "12", highlight: true },
            { label: "Drafts", value: "4" },
            { label: "Avg age", value: "3 mo" },
          ]}
        />

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "148px 1.25fr 1fr", gap: 18, marginTop: 12, minHeight: 0 }}>
          {/* Categories */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ padding: "0 8px" }}>
              <p style={caps}>Categories</p>
            </div>
            {CATEGORIES.map((cat) =>
              cat.active ? (
                <div
                  key={cat.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "5px 8px",
                    borderRadius: 7,
                    fontSize: 12,
                    background: "#fff",
                    boxShadow: "0 1px 2px rgba(15,25,70,0.06)",
                    color: c.blueText,
                    fontWeight: 600,
                  }}
                >
                  <span>{cat.label}</span>
                  <span style={{ fontSize: 10, color: c.muted }}>{cat.count}</span>
                </div>
              ) : (
                <div
                  key={cat.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "5px 8px",
                    borderRadius: 7,
                    fontSize: 12,
                    color: "oklch(0.45 0.015 260)",
                  }}
                >
                  <span>{cat.label}</span>
                  <span style={{ fontSize: 10, color: c.muted }}>{cat.count}</span>
                </div>
              ),
            )}
          </div>

          {/* Production list */}
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <p style={caps}>Production</p>
            {SOPS.map((s, i) => (
              <div
                key={s.title}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 9px",
                  borderRadius: 9,
                  ...(s.highlight
                    ? { background: "#fff", boxShadow: "0 1px 3px rgba(15,25,70,0.07)", border: "1px solid oklch(0.47 0.21 255 / 0.15)" }
                    : { borderBottom: i === SOPS.length - 1 ? "none" : "1px solid oklch(0.95 0.003 250)" }),
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600 }}>{s.title}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 10.5, color: c.muted3 }}>{s.meta}</p>
                </div>
                <StatusChip tone={s.status === "REVIEW" ? "active" : "neutral"}>{s.status}</StatusChip>
              </div>
            ))}
          </div>

          {/* Detail rail */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 11,
              borderLeft: "1px solid oklch(0.93 0.004 250 / 0.7)",
              paddingLeft: 16,
              overflow: "hidden",
            }}
          >
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, fontFamily: font.display }}>Line 2 changeover</p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: c.muted3 }}>Owner Tom N. · v4 · 7 steps</p>
            </div>

            <div>
              {STEPS.map((step, i) => (
                <div key={i} style={{ display: "flex", gap: 9, padding: "6px 0", borderBottom: "1px solid oklch(0.95 0.003 250)" }}>
                  <span
                    style={{
                      height: 18,
                      width: 18,
                      borderRadius: 9999,
                      background: "oklch(0.945 0.004 250)",
                      color: "oklch(0.38 0.02 262)",
                      fontSize: 10,
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </span>
                  <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.4, color: "oklch(0.30 0.02 262)" }}>{step}</p>
                </div>
              ))}
            </div>

            <AICard
              label="Draft from recording"
              actions={
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    height: 34,
                    padding: "0 14px",
                    borderRadius: 9999,
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: c.ink,
                    background: "#fff",
                    border: `1px solid ${c.border}`,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Upload recording
                </span>
              }
            >
              Upload a screen or floor recording and I'll draft a step-by-step SOP with photos and safety callouts.
            </AICard>
          </div>
        </div>
      </Main>
    </Frame>
  );
}
