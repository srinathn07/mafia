import { useState } from "react";

export default function GameTile({ game, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const { name, subtitle, phrase, available, Icon } = game;

  return (
    <div
      onClick={available ? onSelect : undefined}
      onPointerDown={() => available && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => { setPressed(false); setHovered(false); }}
      onPointerCancel={() => { setPressed(false); setHovered(false); }}
      onMouseEnter={() => available && setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "20px",
        padding: "20px 24px",
        background: hovered ? "#1F1F1F" : pressed ? "#262626" : "#1A1A1A",
        border: `1px solid ${hovered ? "rgba(255,51,51,0.25)" : "rgba(255,255,255,0.08)"}`,
        borderLeft: `3px solid ${hovered ? "#FF3333" : "transparent"}`,
        cursor: available ? "pointer" : "default",
        opacity: available ? 1 : 0.3,
        transform: pressed ? "scale(0.985)" : "scale(1)",
        transition: "background 0.15s ease, border-color 0.15s ease, transform 0.08s ease",
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "manipulation",
        overflow: "hidden",
      }}
    >
      {/* Icon */}
      <div
        className={hovered ? "tile-icon-hovered" : ""}
        style={{
          flexShrink: 0,
          width: 48,
          height: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform 0.2s ease",
        }}
      >
        {Icon ? <Icon /> : null}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
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

        {/* Phrase — slides in on hover */}
        <div
          className={hovered && phrase ? "tile-phrase-visible" : "tile-phrase-hidden"}
          style={{
            color: "#FF3333",
            fontSize: "9px",
            fontFamily: "'Courier New', Courier, monospace",
            fontWeight: 900,
            letterSpacing: "0.18em",
            overflow: "hidden",
          }}
        >
          {phrase}
        </div>

        {subtitle && (
          <div
            style={{
              color: hovered ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.28)",
              fontSize: "9px",
              fontFamily: "'Courier New', Courier, monospace",
              fontWeight: 900,
              letterSpacing: "0.2em",
              marginTop: hovered && phrase ? "4px" : "5px",
              transition: "color 0.15s ease",
            }}
          >
            {subtitle}
          </div>
        )}
      </div>

      {available && (
        <div
          style={{
            color: hovered ? "rgba(255,51,51,0.6)" : "rgba(255,255,255,0.2)",
            fontSize: "14px",
            flexShrink: 0,
            transition: "color 0.15s ease",
          }}
        >
          ›
        </div>
      )}
    </div>
  );
}
