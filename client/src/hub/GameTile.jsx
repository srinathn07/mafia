import { useState } from "react";

export default function GameTile({ game, onSelect }) {
  const [pressed, setPressed] = useState(false);
  const { name, subtitle, available, Icon } = game;

  return (
    <div
      onClick={available ? onSelect : undefined}
      onPointerDown={() => available && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "20px",
        padding: "20px 24px",
        background: pressed ? "#262626" : "#1A1A1A",
        border: "1px solid rgba(255,255,255,0.08)",
        cursor: available ? "pointer" : "default",
        opacity: available ? 1 : 0.3,
        transform: pressed ? "scale(0.985)" : "scale(1)",
        transition: "background 0.08s ease, transform 0.08s ease",
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "manipulation",
      }}
    >
      <div style={{ flexShrink: 0, width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {Icon ? <Icon /> : null}
      </div>

      <div style={{ flex: 1 }}>
        <div
          style={{
            color: "#FFFFFF",
            fontSize: "28px",
            fontFamily: "'Bebas Neue', 'Courier New', Courier, monospace",
            fontWeight: 400,
            letterSpacing: "0.12em",
            lineHeight: 1,
          }}
        >
          {name}
        </div>
        {subtitle && (
          <div
            style={{
              color: "rgba(255,255,255,0.28)",
              fontSize: "9px",
              fontFamily: "'Courier New', Courier, monospace",
              fontWeight: 900,
              letterSpacing: "0.2em",
              marginTop: "5px",
            }}
          >
            {subtitle}
          </div>
        )}
      </div>

      {available && (
        <div style={{ color: "rgba(255,255,255,0.2)", fontSize: "14px", flexShrink: 0 }}>›</div>
      )}
    </div>
  );
}
