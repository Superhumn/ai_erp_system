import { useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { buildMaterialSupplyView } from "@/lib/materialSupply";

const FONT = "'Plus Jakarta Sans', system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

// Scoped global CSS: web font, freight-dash animation, tabular numerals,
// scrollbar + row hover — mirrors the design spec's <style> block.
const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
@keyframes msr-dashmove{to{stroke-dashoffset:-28}}
.msr-num{font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}
.msr-scope ::-webkit-scrollbar{width:9px;height:9px}
.msr-scope ::-webkit-scrollbar-thumb{background:#D7DCE4;border-radius:8px}
.msr-scope ::-webkit-scrollbar-track{background:transparent}
.msr-row{transition:background .12s}
.msr-row:hover{background:#F5F8FD}
`;

const card = "0 6px 20px rgba(17,24,39,.06),0 1px 2px rgba(17,24,39,.04)";

function Kpi({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        background: "#FFFFFF",
        borderRadius: 16,
        padding: "9px 16px",
        boxShadow: "0 4px 14px rgba(17,24,39,.05),0 1px 2px rgba(17,24,39,.04)",
      }}
    >
      <div className="msr-num" style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.02em", color }}>
        {value}
      </div>
      <div
        style={{
          fontSize: 10.5,
          color: "#8A8F99",
          lineHeight: 1.25,
          letterSpacing: ".04em",
          textTransform: "uppercase",
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
    </div>
  );
}

export default function MaterialSupply() {
  const { data, isLoading, error } = trpc.materialSupply.overview.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (document.getElementById("msr-style")) return;
    const el = document.createElement("style");
    el.id = "msr-style";
    el.textContent = STYLE;
    document.head.appendChild(el);
  }, []);

  const view = useMemo(() => (data ? buildMaterialSupplyView(data) : null), [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (error || !view) {
    return (
      <div className="p-6 text-sm text-destructive">
        Failed to load material supply data{error ? `: ${error.message}` : ""}.
      </div>
    );
  }

  const { kpis, map, materials } = view;

  return (
    <div
      className="msr-scope"
      style={{
        fontFamily: FONT,
        background: "#EDEFF2",
        color: "#111827",
        width: "100%",
        borderRadius: 18,
        padding: "18px 22px 24px",
      }}
    >
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        {/* TOPBAR + KPIs */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 18,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: "#111827",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ width: 11, height: 11, border: "2px solid #fff", borderRadius: "50%" }} />
            </div>
            <div>
              <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.1, display: "flex", alignItems: "center", gap: 8 }}>
                Meridian
                {view.source === "sample" && (
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: ".06em",
                      textTransform: "uppercase",
                      color: "#8A8F99",
                      background: "#fff",
                      border: "1px solid #E1E5EC",
                      borderRadius: 999,
                      padding: "2px 8px",
                    }}
                  >
                    Sample data
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#7C828D", fontWeight: 500 }}>Material supply &amp; reorder</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "stretch", gap: 10, flexWrap: "wrap" }}>
            <Kpi value={kpis.copackers} label="Co-packers" />
            <Kpi value={kpis.toOrder} label="To order" color="#E5484D" />
            <Kpi value={kpis.inbound} label="Inbound" color="#2563EB" />
            <Kpi value={kpis.delayed} label="Delayed" />
          </div>
        </div>

        {/* MAP */}
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: 22,
            overflow: "hidden",
            position: "relative",
            marginBottom: 15,
            boxShadow: card,
          }}
        >
          <div style={{ position: "absolute", top: 15, left: 20, zIndex: 2 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#9AA0AB", whiteSpace: "nowrap" }}>
              Inbound sea freight · all materials
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              top: 14,
              right: 18,
              zIndex: 2,
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
              fontSize: 10.5,
              letterSpacing: ".01em",
              fontWeight: 700,
            }}
          >
            <span style={{ color: "#E5484D" }}>● overdue</span>
            <span style={{ color: "#2563EB" }}>● order soon</span>
            <span style={{ color: "#9AA0AB" }}>● on track</span>
          </div>
          <svg viewBox="0 0 1300 340" style={{ display: "block", width: "100%", height: "auto", background: "#F1F5FC" }}>
            <g stroke="#E4EAF4" strokeWidth={1}>
              <line x1="0" y1="113" x2="1300" y2="113" />
              <line x1="0" y1="226" x2="1300" y2="226" />
              <line x1="325" y1="0" x2="325" y2="340" />
              <line x1="650" y1="0" x2="650" y2="340" />
              <line x1="975" y1="0" x2="975" y2="340" />
            </g>
            <path
              d="M185,150 C185,120 220,110 265,118 C410,106 580,110 780,108 C980,106 1095,112 1180,130 C1200,150 1186,172 1162,184 C1170,214 1132,262 1108,296 C1092,326 1064,328 1049,305 C1025,278 1000,280 988,301 C946,280 866,278 776,284 C676,280 576,276 486,282 C396,286 316,280 266,266 C221,252 198,224 190,180 C185,168 185,159 185,150 Z"
              fill="#FFFFFF"
              stroke="#DDE5F1"
              strokeWidth={1.2}
            />
            {map.routes.map((rt, i) => (
              <g key={`rt${i}`}>
                <path d={rt.d} fill="none" stroke={rt.color} strokeWidth={2} strokeDasharray="2 7" strokeLinecap="round" style={{ animation: rt.anim }} opacity={0.8} />
                <circle cx={rt.lx} cy={rt.ly} r={12} fill="#FFFFFF" stroke={rt.color} strokeWidth={1.6} />
                <text x={rt.lx} y={rt.ly} dy="0.34em" textAnchor="middle" fontFamily={FONT} fontSize={10.5} fontWeight={700} fill={rt.color}>
                  {rt.count}
                </text>
                <text x={rt.lx} y={rt.lyEta} textAnchor="middle" fontFamily={FONT} fontSize={10} fontWeight={600} fill="#828892">
                  {rt.etaLabel}
                </text>
              </g>
            ))}
            {map.origins.map((o, i) => (
              <g key={`o${i}`}>
                <circle cx={o.x} cy={o.y} r={4.5} fill="#3A4150" />
                <text x={o.x} y={o.ty} textAnchor={o.anchor} fontFamily={FONT} fontSize={11} fontWeight={700} letterSpacing="0.01em" fill="#3A4150">
                  {o.label}
                </text>
              </g>
            ))}
            {map.pins.map((pin, i) => (
              <g key={`p${i}`}>
                <circle cx={pin.x} cy={pin.y} r={pin.r} fill="#FFFFFF" stroke={pin.color} strokeWidth={3} />
                <text x={pin.x} y={pin.y} dy="0.34em" textAnchor="middle" fontFamily={FONT} fontSize={15} fontWeight={800} fill={pin.color}>
                  {pin.toOrder}
                </text>
                <text x={pin.x} y={pin.ty} textAnchor="middle" fontFamily={FONT} fontSize={12.5} fontWeight={700} fill="#22252C">
                  {pin.short}
                </text>
                {pin.dots.map((d, j) => (
                  <circle key={`d${j}`} cx={d.cx} cy={d.cy} r={4} fill={d.color}>
                    <title>{d.title}</title>
                  </circle>
                ))}
              </g>
            ))}
          </svg>
        </div>

        {/* BY MATERIAL */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {materials.map((m, mi) => (
            <div key={`m${mi}`} style={{ background: "#FFFFFF", borderRadius: 20, overflow: "hidden", boxShadow: card }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 18px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#2563EB", flex: "none" }} />
                  <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.01em" }}>{m.name}</div>
                  <div style={{ fontSize: 10.5, color: "#9AA0AB", letterSpacing: ".01em", fontWeight: 500 }}>{m.totals}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 999, background: m.orderBg, flex: "none" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.orderColor }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: m.orderColor, whiteSpace: "nowrap", letterSpacing: ".01em" }}>{m.orderSummary}</span>
                </div>
              </div>

              {m.rows.map((r, ri) => (
                <div
                  key={`r${ri}`}
                  className="msr-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "104px 1fr 126px",
                    gap: 12,
                    alignItems: "center",
                    padding: "9px 18px",
                    margin: "0 8px",
                    borderRadius: 14,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "-.005em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.short}</div>
                    <div style={{ fontSize: 10.5, color: r.covColor, fontWeight: 600 }}>{r.covLabel}</div>
                  </div>
                  <div>
                    <div style={{ position: "relative", height: 18, background: "#EDF0F5", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${r.onHandPct}%`, background: "#2563EB", borderRadius: 999 }} />
                      <div style={{ position: "absolute", top: 0, bottom: 0, left: `${r.onHandPct}%`, width: `${r.inboundPct}%`, background: "#BBD1F9" }} />
                      {r.showDeficit && (
                        <div
                          style={{
                            position: "absolute",
                            top: 0,
                            bottom: 0,
                            right: 0,
                            width: `${r.deficitPct}%`,
                            background: "repeating-linear-gradient(45deg,rgba(229,72,77,.15) 0 4px,transparent 4px 9px)",
                          }}
                        />
                      )}
                      <div style={{ position: "absolute", top: -2, bottom: -2, left: `${r.reorderPct}%`, borderLeft: "1.5px dashed #A8AEB8" }} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 13, marginTop: 6, fontSize: 11 }}>
                      <span style={{ color: "#7C828D", fontWeight: 500 }}>
                        On hand <span className="msr-num" style={{ fontWeight: 700, color: "#22252C" }}>{r.onHandLabel}</span>
                      </span>
                      <span style={{ color: "#7C828D", fontWeight: 500 }}>
                        Inbound <span className="msr-num" style={{ fontWeight: 700, color: "#2563EB" }}>{r.inboundLabel}</span>
                      </span>
                      <span style={{ color: "#A7ACB5", fontWeight: 500 }}>{r.inboundDetail}</span>
                    </div>
                  </div>
                  <div style={{ background: r.orderBg, borderRadius: 13, padding: "7px 12px" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".07em", textTransform: "uppercase", color: r.orderColor }}>{r.orderKicker}</div>
                    <div className="msr-num" style={{ fontSize: 14.5, fontWeight: 800, marginTop: 1, color: "#111827", letterSpacing: "-.01em" }}>{r.orderQty}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: r.orderColor }}>{r.orderWhen}</div>
                  </div>
                </div>
              ))}
              <div style={{ height: 8 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
