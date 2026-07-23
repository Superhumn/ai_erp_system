import { font } from "../tokens";
import { Frame, Sidebar, Main, Header, CTA, StatusChip, type ChipTone } from "../primitives";

function FileIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="oklch(0.55 0.015 260)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="oklch(0.47 0.21 255)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

type DocRow = { name: string; icon: "file" | "folder"; updated: string; views: string; chip: string; tone: ChipTone };

const DOCS: DocRow[] = [
  { name: "Financial model v4.xlsx", icon: "file", updated: "Updated Jul 14", views: "28 views", chip: "HOT", tone: "active" },
  { name: "Pitch deck v4.pdf", icon: "file", updated: "Updated Jul 10", views: "41 views", chip: "HOT", tone: "active" },
  { name: "Cap table.xlsx", icon: "file", updated: "Updated Jul 8", views: "12 views", chip: "—", tone: "neutral" },
  { name: "Product preview (live mockups)", icon: "folder", updated: "Updated today", views: "3 views", chip: "NEW", tone: "active" },
  { name: "Customer contracts (5)", icon: "file", updated: "Updated Jul 3", views: "8 views", chip: "—", tone: "neutral" },
  { name: "Cohort & retention analysis.pdf", icon: "file", updated: "Updated Jun 28", views: "6 views", chip: "—", tone: "neutral" },
];

const VISITORS: { name: string; time: string; detail: string }[] = [
  { name: "Hearthstone Capital", time: "2h ago", detail: "Financial model · 14 min · 3 Q&A" },
  { name: "Bluewater Fund", time: "1d ago", detail: "Downloaded deck v4" },
  { name: "Coastline Ventures", time: "2d ago", detail: "Product preview · 9 min" },
  { name: "Meridian Angels", time: "3d ago", detail: "Cap table · 4 min" },
];

export default function DataRooms() {
  return (
    <Frame label="9c Data Rooms" height={452}>
      <Sidebar active="Data Rooms" />
      <div style={{ flex: 1, display: "flex", minWidth: 0 }}>
        <Main>
          <Header
            title="Seed II Data Room"
            subtitle="6 investors invited · 4 active this week · link expires Sep 30"
            right={
              <>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 16px", borderRadius: 9999, border: "1px solid oklch(0.92 0.005 250)", background: "#fff", fontSize: 12.5, fontWeight: 600, color: "oklch(0.40 0.02 262)", cursor: "pointer" }}>Copy link</span>
                <CTA>+ Upload</CTA>
              </>
            }
          />
          <div style={{ flex: 1, marginTop: 12, overflow: "hidden" }}>
            <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "oklch(0.62 0.015 260)" }}>Documents</p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <tbody>
                {DOCS.map((d, i) => (
                  <tr key={d.name} style={{ borderBottom: i === DOCS.length - 1 ? "none" : "1px solid oklch(0.955 0.003 250)" }}>
                    <td style={{ padding: "7px 8px", fontWeight: 600 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        {d.icon === "folder" ? <FolderIcon /> : <FileIcon />}
                        {d.name}
                      </span>
                    </td>
                    <td style={{ padding: "7px 8px", color: "oklch(0.55 0.015 260)" }}>{d.updated}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "oklch(0.55 0.015 260)" }}>{d.views}</td>
                    <td style={{ padding: "7px 8px", textAlign: "center" }}>
                      <StatusChip tone={d.tone}>{d.chip}</StatusChip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Main>

        {/* Glass visitor-activity panel */}
        <div style={{ width: 290, flexShrink: 0, margin: "14px 14px 14px 0", background: "rgba(255,255,255,0.72)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.9)", borderRadius: 20, padding: 18, boxShadow: "0 16px 48px rgba(15,25,70,0.16)", display: "flex", flexDirection: "column" }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", fontFamily: font.display }}>Visitor activity</p>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 12 }}>
            {VISITORS.map((v, i) => (
              <div key={v.name} style={{ padding: "8px 0", borderBottom: i === VISITORS.length - 1 ? "none" : "1px solid rgba(255,255,255,0.9)" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{v.name}</span>
                  <span style={{ fontSize: 10.5, color: "oklch(0.58 0.015 260)" }}>{v.time}</span>
                </div>
                <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "oklch(0.55 0.015 260)" }}>{v.detail}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "auto", background: "oklch(0.47 0.21 255 / 0.06)", border: "1px solid oklch(0.47 0.21 255 / 0.2)", borderRadius: 12, padding: "11px 13px" }}>
            <p style={{ margin: 0, fontSize: 11.5, color: "oklch(0.35 0.02 262)", lineHeight: 1.5 }}>
              <strong style={{ color: "oklch(0.40 0.21 255)" }}>AI:</strong> Hearthstone's repeat visits to the financial model signal strong intent — the product preview you added today is their likely next stop.
            </p>
          </div>
        </div>
      </div>
    </Frame>
  );
}
