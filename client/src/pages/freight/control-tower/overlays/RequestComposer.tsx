import { v, FONT_MONO } from "../lib/tokens";
import type { Contact } from "@shared/freight-control-tower/fixtures";

export interface ComposeState {
  ref: string; docName: string; to: Contact; cc: Contact[];
  subject: string; body: string; attachments: { ext: string; name: string }[]; history: string;
}

interface Props {
  compose: ComposeState;
  onSubject: (v: string) => void;
  onBody: (v: string) => void;
  onSend: () => void;
  onEscalate: () => void;
  onClose: () => void;
}

const initials = (name: string) => name.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();

export function RequestComposer({ compose: c, onSubject, onBody, onSend, onEscalate, onClose }: Props) {
  return (
    <>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(28,25,23,.44)", backdropFilter: "blur(2px)", zIndex: 30 }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 31, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, pointerEvents: "none" }}>
        <div onClick={(e) => e.stopPropagation()} style={{ pointerEvents: "auto", width: 620, maxWidth: "100%", maxHeight: "100%", display: "flex", flexDirection: "column", background: v("surface"), border: `1px solid ${v("border-strong")}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 30px 80px rgba(28,25,23,.4)", animation: "fctFadeUp 200ms ease both" }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${v("border")}` }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "1px", textTransform: "uppercase", color: v("text-dim") }}>Request document</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.docName}</div>
            <div style={{ flex: 1 }} />
            <div onClick={onClose} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${v("border-strong")}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: v("text-3"), fontSize: 13 }}>✕</div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            {/* recipient */}
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: v("border-strong"), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: v("text-3") }}>{initials(c.to.name)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.to.name} <span style={{ fontWeight: 400, color: v("text-dim"), fontSize: 11 }}>· {c.to.role}</span></div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: v("info") }}>{c.to.email}</div>
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {c.cc.map((cc, i) => (
                  <span key={i} style={{ fontFamily: FONT_MONO, fontSize: 9.5, padding: "3px 7px", borderRadius: 5, background: v("surface-2"), border: `1px solid ${v("border")}`, color: v("text-dim") }}>cc {cc.name}</span>
                ))}
              </div>
            </div>

            {/* subject */}
            <div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "1px", textTransform: "uppercase", color: v("text-faint"), marginBottom: 5 }}>Subject</div>
              <input value={c.subject} onChange={(e) => onSubject(e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: `1px solid ${v("border-strong")}`, background: v("surface-2"), color: v("text"), fontFamily: FONT_MONO, fontSize: 11.5, outline: "none" }} />
            </div>

            {/* body */}
            <div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "1px", textTransform: "uppercase", color: v("text-faint"), marginBottom: 5 }}>Message</div>
              <textarea value={c.body} onChange={(e) => onBody(e.target.value)} rows={12} style={{ width: "100%", padding: "10px 12px", borderRadius: 7, border: `1px solid ${v("border-strong")}`, background: v("surface-2"), color: v("text"), fontFamily: FONT_MONO, fontSize: 11.5, lineHeight: 1.6, outline: "none", resize: "vertical" }} />
            </div>

            {/* attachments */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {c.attachments.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 10px", borderRadius: 6, border: `1px solid ${v("border")}`, background: v("surface-2") }}>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 8.5, letterSpacing: ".6px", padding: "1px 5px", borderRadius: 3, background: `${v("info")}22`, color: v("info") }}>{a.ext}</span>
                  <span style={{ fontSize: 11, color: v("text-2") }}>{a.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* footer */}
          <div style={{ borderTop: `1px solid ${v("border")}`, padding: "12px 18px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: v("text-dim") }}>{c.history}</div>
            <div style={{ flex: 1 }} />
            <button onClick={onEscalate} style={{ padding: "8px 14px", borderRadius: 7, border: `1px solid ${v("control")}`, background: v("surface-2"), cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 500, color: v("text-2") }}>Escalate</button>
            <button onClick={onSend} style={{ padding: "8px 16px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, background: v("info"), color: v("bg") }}>Send request</button>
          </div>
        </div>
      </div>
    </>
  );
}
