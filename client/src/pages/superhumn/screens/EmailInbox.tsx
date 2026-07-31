import React from "react";
import { font } from "../tokens";
import { Frame, Sidebar } from "../primitives";

type TagVariant = "blue" | "grey" | "pdf";

const tagStyles: Record<TagVariant, React.CSSProperties> = {
  blue: { color: "oklch(0.40 0.21 255)", background: "oklch(0.47 0.21 255 / 0.12)" },
  grey: { color: "oklch(0.38 0.02 262)", background: "oklch(0.945 0.004 250)" },
  pdf: { color: "oklch(0.48 0.015 260)", background: "oklch(0.93 0.004 250)" },
};

function Tag({ children, variant }: { children: React.ReactNode; variant: TagVariant }) {
  return <span style={{ fontSize: 9.5, fontWeight: 700, borderRadius: 5, padding: "1px 7px", ...tagStyles[variant] }}>{children}</span>;
}

type Email = { sender: string; time: string; subject: string; tags: { label: string; variant: TagVariant }[]; selected?: boolean };

const EMAILS: Email[] = [
  { sender: "GreenLeaf Supply", time: "09:12", subject: "Invoice #GL-8841 — hemp protein partial", tags: [{ label: "INVOICE", variant: "blue" }, { label: "PDF", variant: "pdf" }], selected: true },
  { sender: "Saia LTL", time: "08:47", subject: "Delivery notification — PRO 88213 out for delivery", tags: [{ label: "SHIPPING", variant: "grey" }] },
  { sender: "Erewhon Market", time: "08:15", subject: "PO #EW-1190 — 240 units Lion's Mane, Aug 1 delivery", tags: [{ label: "PURCHASE ORDER", variant: "grey" }] },
  { sender: "PackRight Co", time: "Yesterday", subject: "PO-2041 confirmed — ships Thursday", tags: [{ label: "PO UPDATE", variant: "grey" }] },
  { sender: "Vitala Copack", time: "Yesterday", subject: "Run fee invoice — July production", tags: [{ label: "INVOICE", variant: "blue" }] },
  { sender: "Thrive Market", time: "Jul 16", subject: "Remittance advice — payment sent", tags: [{ label: "RECEIPT", variant: "grey" }] },
  { sender: "Fresh Farms", time: "Jul 16", subject: "PO-2044 acknowledged — picking Thursday", tags: [{ label: "PO UPDATE", variant: "grey" }] },
  { sender: "Bristol Farms", time: "Jul 15", subject: "Re: overdue invoice — check mailed Friday", tags: [{ label: "GENERAL", variant: "grey" }] },
  { sender: "Whole Foods NorCal", time: "Jul 15", subject: "Q3 promo calendar — response requested", tags: [{ label: "GENERAL", variant: "grey" }] },
];

const FILTERS: { label: string; active?: boolean }[] = [
  { label: "All", active: true },
  { label: "Invoices 4" },
  { label: "POs 2" },
  { label: "Shipping 3" },
  { label: "General 3" },
];

const extractFields = ["Vendor · GreenLeaf Supply", "Amount · $3,510.00", "Matches · PO-2038 (600 kg)", "Due · Aug 17 · Net 30"];

function EmailItem({ e, first }: { e: Email; first?: boolean }) {
  return (
    <div
      style={
        e.selected
          ? { padding: "6px 12px", background: "oklch(0.47 0.21 255 / 0.05)", borderLeft: "2.5px solid oklch(0.47 0.21 255)", cursor: "pointer" }
          : { padding: "6px 12px", borderTop: first ? undefined : "1px solid oklch(0.95 0.003 250)", cursor: "pointer" }
      }
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: e.selected ? 700 : 600 }}>{e.sender}</p>
        <span style={{ fontSize: 10.5, color: "oklch(0.58 0.015 260)" }}>{e.time}</span>
      </div>
      <p style={{ margin: "2px 0 0", fontSize: 12, ...(e.selected ? { fontWeight: 500 } : { color: "oklch(0.45 0.015 260)" }) }}>{e.subject}</p>
      <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
        {e.tags.map((t) => (
          <Tag key={t.label} variant={t.variant}>
            {t.label}
          </Tag>
        ))}
      </div>
    </div>
  );
}

export default function EmailInbox() {
  return (
    <Frame label="7d Email Inbox" height={700}>
      <Sidebar active="Home" />

      {/* Inbox list */}
      <div style={{ width: 300, flexShrink: 0, borderRight: "1px solid oklch(0.93 0.004 250 / 0.6)", display: "flex", flexDirection: "column", padding: "12px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px" }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: "-0.03em", fontFamily: font.display }}>Inbox</h2>
          <span style={{ fontSize: 11.5, color: "oklch(0.55 0.015 260)" }}>12 to process</span>
        </div>
        <div style={{ display: "flex", gap: 5, padding: "8px 12px 10px", flexWrap: "wrap" }}>
          {FILTERS.map((f) => (
            <span
              key={f.label}
              style={{
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 9999,
                padding: "4px 11px",
                cursor: "pointer",
                ...(f.active ? { color: "#fff", background: "oklch(0.19 0.035 262)" } : { color: "oklch(0.40 0.02 262)", background: "oklch(0.955 0.004 250)" }),
              }}
            >
              {f.label}
            </span>
          ))}
        </div>
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {EMAILS.map((e, i) => (
            <EmailItem key={e.sender} e={e} first={i === 0} />
          ))}
        </div>
      </div>

      {/* Reading pane */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, padding: "16px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", fontFamily: font.display }}>Invoice #GL-8841 — hemp protein partial</p>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "oklch(0.55 0.015 260)" }}>{"GreenLeaf Supply <ap@greenleaf.co> · today 09:12 · 1 attachment"}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {["Reply", "Archive"].map((b) => (
              <span key={b} style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.40 0.02 262)", border: "1px solid oklch(0.90 0.005 250)", background: "#fff", borderRadius: 9999, padding: "6px 14px", cursor: "pointer" }}>
                {b}
              </span>
            ))}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            background: "#fff",
            border: "1px solid oklch(0.93 0.004 250 / 0.9)",
            borderRadius: 14,
            padding: "18px 20px",
            marginTop: 12,
            fontSize: 13,
            lineHeight: 1.7,
            color: "oklch(0.30 0.02 262)",
            boxShadow: "0 1px 2px rgba(15,25,70,0.05)",
          }}
        >
          <p style={{ margin: 0 }}>Hi Alex,</p>
          <p style={{ margin: "10px 0 0" }}>
            Please find attached invoice #GL-8841 for the partial shipment of Hemp Protein 70% (600 kg of 1,000 kg) delivered against PO-2038 on July 15. The remaining 400 kg ships next week under the same PO.
          </p>
          <p style={{ margin: "10px 0 0" }}>Terms are Net 30 as usual. Let me know if you need anything else.</p>
          <p style={{ margin: "10px 0 0" }}>
            Best,
            <br />
            Dan Osei · GreenLeaf Supply
          </p>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 14, border: "1px solid oklch(0.92 0.005 250)", borderRadius: 10, padding: "8px 12px", background: "oklch(0.975 0.002 250)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="oklch(0.50 0.015 260)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
              <path d="M14 2v4a2 2 0 0 0 2 2h4" />
            </svg>
            <span style={{ fontSize: 12, fontWeight: 600 }}>GL-8841.pdf</span>
            <span style={{ fontSize: 11, color: "oklch(0.58 0.015 260)" }}>184 KB</span>
          </div>
        </div>

        <div style={{ marginTop: 12, background: "oklch(0.47 0.21 255 / 0.06)", border: "1px solid oklch(0.47 0.21 255 / 0.2)", borderRadius: 14, padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="oklch(0.47 0.21 255)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
            </svg>
            <p style={{ margin: 0, flex: 1, fontSize: 12.5, fontWeight: 700, color: "oklch(0.40 0.21 255)" }}>Extracted — ready to import</p>
            <span style={{ fontSize: 11, color: "oklch(0.55 0.015 260)" }}>confidence 96%</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {extractFields.map((f) => (
              <span key={f} style={{ fontSize: 11.5, fontWeight: 600, color: "oklch(0.35 0.02 262)", background: "#fff", border: "1px solid oklch(0.92 0.005 250)", borderRadius: 9999, padding: "3px 10px" }}>
                {f}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: "linear-gradient(135deg, oklch(0.55 0.22 258), oklch(0.44 0.21 255))", borderRadius: 9999, padding: "6px 16px", cursor: "pointer", boxShadow: "0 4px 12px oklch(0.47 0.21 255 / 0.35)" }}>
              Import as bill · 3-way match
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.40 0.02 262)", border: "1px solid oklch(0.90 0.005 250)", background: "#fff", borderRadius: 9999, padding: "6px 16px", cursor: "pointer" }}>
              Edit fields
            </span>
          </div>
        </div>
      </div>
    </Frame>
  );
}
