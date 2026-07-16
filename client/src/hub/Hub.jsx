import { useNavigate } from "react-router-dom";
import GameTile from "./GameTile.jsx";
import { MafiaIcon } from "./icons.jsx";

const GAMES = [
  {
    id: "mafia",
    name: "MAFIA",
    subtitle: "SOCIAL DEDUCTION",
    phrase: "SOMEONE IN THIS ROOM IS LYING.",
    route: "/",
    available: true,
    Icon: MafiaIcon,
  },
  {
    id: "coming-soon",
    name: "MORE SOON",
    subtitle: null,
    route: null,
    available: false,
    Icon: null,
  },
];

export default function Hub() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        background: "#121212",
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: "420px" }}>
        <div style={{ marginBottom: "24px" }}>
          <div
            style={{
              color: "#FFFFFF",
              fontSize: "42px",
              fontFamily: "'Bebas Neue', 'Courier New', Courier, monospace",
              fontWeight: 400,
              letterSpacing: "0.1em",
              lineHeight: 1,
            }}
          >
            GAMENITE
          </div>
          <div
            style={{
              color: "rgba(255,255,255,0.18)",
              fontSize: "9px",
              fontFamily: "'Courier New', Courier, monospace",
              fontWeight: 900,
              letterSpacing: "0.25em",
              marginTop: "6px",
            }}
          >
            BY SNATH07
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
          {GAMES.map((game) => (
            <GameTile
              key={game.id}
              game={game}
              onSelect={() => navigate(game.route)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
