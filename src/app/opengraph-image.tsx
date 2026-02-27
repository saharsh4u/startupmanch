import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px",
          background:
            "linear-gradient(140deg, #080808 0%, #111111 45%, #171717 100%)",
          color: "#f4f4f5",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            border: "1px solid rgba(255,255,255,0.16)",
            borderRadius: "999px",
            padding: "10px 18px",
            fontSize: 26,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          StartupManch
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: "-0.02em",
              maxWidth: 1020,
            }}
          >
            India&apos;s startup marketplace for founders and investors.
          </div>
          <div
            style={{
              fontSize: 34,
              color: "rgba(244,244,245,0.78)",
              lineHeight: 1.25,
            }}
          >
            Share startup videos. Get discovered. Meet investors.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 28,
            color: "rgba(244,244,245,0.7)",
          }}
        >
          <span>startupmanch.com</span>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: "999px",
              padding: "8px 16px",
            }}
          >
            startup discovery
          </span>
        </div>
      </div>
    ),
    size
  );
}
