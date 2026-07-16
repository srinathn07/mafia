export function ChameleonIcon({ size = 44 }) {
  // 4×4 grid with B2 cell highlighted in olive — represents the secret coordinate mechanic
  const highlight = { r: 1, c: 1 };
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" aria-hidden="true">
      {[0, 1, 2, 3].map((r) =>
        [0, 1, 2, 3].map((c) => (
          <rect key={`${r}-${c}`} x={3 + c * 10} y={3 + r * 10} width={8} height={8}
            fill={r === highlight.r && c === highlight.c ? "#8FAF5A" : "rgba(255,255,255,0.2)"} />
        ))
      )}
    </svg>
  );
}

export function MafiaIcon({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" aria-hidden="true">
      {/* Crown */}
      <rect x="11" y="4" width="22" height="24" fill="#FF3333" />
      {/* Band */}
      <rect x="11" y="23" width="22" height="5" fill="#8B1010" />
      {/* Brim */}
      <rect x="3" y="28" width="38" height="7" fill="#FF3333" />
    </svg>
  );
}
