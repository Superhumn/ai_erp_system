const SSO = ["Google", "Microsoft", "Apple"];

export default function Login() {
  return (
    <div
      data-screen-label="9d Login"
      style={{
        width: 1360,
        height: 600,
        border: "1px solid oklch(0.90 0.005 250)",
        borderRadius: 16,
        overflow: "hidden",
        display: "flex",
        boxShadow: "0 32px 64px -32px rgba(15,25,70,0.25)",
        fontFamily: "'Inter Tight',sans-serif",
        color: "oklch(0.16 0.025 262)",
      }}
    >
      {/* Left — form */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #fff, oklch(0.984 0.003 252))",
        }}
      >
        <div style={{ width: 320 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                height: 34,
                width: 34,
                borderRadius: 10,
                background: "linear-gradient(135deg, oklch(0.55 0.22 258), oklch(0.42 0.21 255))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 800,
                fontSize: 17,
                fontFamily: "'DM Sans',sans-serif",
                boxShadow: "0 4px 12px oklch(0.47 0.21 255 / 0.35)",
              }}
            >
              S
            </div>
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", fontFamily: "'DM Sans',sans-serif" }}>
              superhumn
            </span>
          </div>

          <h2
            style={{
              margin: "26px 0 0",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "-0.035em",
              fontFamily: "'DM Sans',sans-serif",
            }}
          >
            Welcome back
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "oklch(0.55 0.015 260)" }}>
            Sign in to your Superhumn workspace
          </p>

          <div style={{ marginTop: 22 }}>
            <p
              style={{
                margin: "0 0 5px",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "oklch(0.62 0.015 260)",
              }}
            >
              Email
            </p>
            <div
              style={{
                height: 40,
                border: "1px solid oklch(0.90 0.005 250)",
                borderRadius: 10,
                background: "#fff",
                display: "flex",
                alignItems: "center",
                padding: "0 14px",
                fontSize: 13.5,
                color: "oklch(0.30 0.02 262)",
              }}
            >
              alex@superhumn.co
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <p
              style={{
                margin: "0 0 5px",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "oklch(0.62 0.015 260)",
              }}
            >
              Password
            </p>
            <div
              style={{
                height: 40,
                border: "1.5px solid oklch(0.47 0.21 255 / 0.5)",
                borderRadius: 10,
                background: "#fff",
                display: "flex",
                alignItems: "center",
                padding: "0 14px",
                fontSize: 13.5,
                color: "oklch(0.30 0.02 262)",
                boxShadow: "0 0 0 3px oklch(0.47 0.21 255 / 0.1)",
              }}
            >
              ••••••••••
            </div>
          </div>

          <div
            style={{
              height: 42,
              marginTop: 20,
              borderRadius: 10,
              background: "linear-gradient(135deg, oklch(0.55 0.22 258), oklch(0.44 0.21 255))",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 6px 16px oklch(0.47 0.21 255 / 0.35)",
            }}
          >
            Sign in
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0" }}>
            <span style={{ flex: 1, height: 1, background: "oklch(0.92 0.005 250)" }} />
            <span style={{ fontSize: 11, color: "oklch(0.60 0.015 260)" }}>or</span>
            <span style={{ flex: 1, height: 1, background: "oklch(0.92 0.005 250)" }} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {SSO.map((s) => (
              <div
                key={s}
                style={{
                  flex: 1,
                  height: 38,
                  border: "1px solid oklch(0.90 0.005 250)",
                  borderRadius: 10,
                  background: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "oklch(0.35 0.02 262)",
                  cursor: "pointer",
                }}
              >
                {s}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — dark marketing panel */}
      <div
        style={{
          flex: 1,
          position: "relative",
          background: "oklch(0.19 0.035 262)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: 44,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -80,
            right: -60,
            width: 400,
            height: 400,
            background: "radial-gradient(ellipse, oklch(0.55 0.22 258 / 0.35), transparent 65%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 44,
            left: 44,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(255,255,255,0.1)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 9999,
            padding: "6px 14px",
          }}
        >
          <span
            style={{
              height: 6,
              width: 6,
              borderRadius: 9999,
              background: "oklch(0.72 0.15 258)",
              boxShadow: "0 0 8px oklch(0.72 0.15 258)",
            }}
          />
          <span style={{ fontSize: 11.5, fontWeight: 600, color: "oklch(0.88 0.02 255)" }}>
            3 agents working while you were away
          </span>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: 1.25,
            color: "#fff",
            fontFamily: "'DM Sans',sans-serif",
            maxWidth: 400,
          }}
        >
          The AI ERP that runs the busywork, so your team runs the business.
        </p>
        <p
          style={{
            margin: "14px 0 0",
            fontSize: 13,
            color: "oklch(0.75 0.03 258)",
            maxWidth: 380,
            lineHeight: 1.6,
          }}
        >
          Orders, inventory, finance, and supply chain — with agents that draft the POs, chase the invoices, and flag
          what needs you.
        </p>
      </div>
    </div>
  );
}
