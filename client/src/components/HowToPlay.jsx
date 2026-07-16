import { useState, useEffect } from "react";

/**
 * Reusable bottom-drawer "How to Play" panel.
 *
 * Props:
 *   sections   – Array of { heading: string, items: string[] }
 *   accent     – Accent color string (e.g. "#FF3333" for Mafia, "#8FAF5A" for Chameleon)
 *   onClose    – Called when the user dismisses the panel
 */
export default function HowToPlay({ sections, accent = "#FFFFFF", onClose }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // One-frame delay so the slide-in transition fires
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.72)",
          zIndex: 8000,
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 8001,
          background: "#1C1C1C",
          borderTop: `2px solid ${accent}`,
          maxHeight: "78vh",
          overflowY: "auto",
          padding: "20px 24px 48px",
          transform: mounted ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.22s cubic-bezier(0.32,0,0.67,0)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ color: accent, fontSize: "9px", fontWeight: 900, letterSpacing: "0.3em" }}>
            HOW TO PLAY
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.35)",
              fontSize: "14px",
              fontWeight: 900,
              fontFamily: "inherit",
              cursor: "pointer",
              padding: "4px 6px",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Sections */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {sections.map((section, i) => (
            <div key={i}>
              <div
                style={{
                  color: accent,
                  fontSize: "8px",
                  fontWeight: 900,
                  letterSpacing: "0.3em",
                  marginBottom: 8,
                  paddingBottom: 6,
                  borderBottom: `1px solid rgba(255,255,255,0.07)`,
                }}
              >
                {section.heading}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {section.items.map((item, j) => (
                  <div
                    key={j}
                    style={{
                      color: "rgba(255,255,255,0.58)",
                      fontSize: "11px",
                      fontFamily: "'Courier New', Courier, monospace",
                      letterSpacing: "0.04em",
                      lineHeight: 1.65,
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
