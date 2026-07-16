import { useCallback } from "react";
import { FullPage, Btn } from "../App.jsx";

const ROLE_COLOR = {
  MAFIA: "#FF3333",
  DOCTOR: "#FFFFFF",
  DETECTIVE: "#FFFFFF",
  VILLAGER: "#FFFFFF",
};

export default function GameOver({ room, myPlayer, socket, onGoHome }) {
  const isHost = myPlayer?.isHost;
  const winner = room.winner;

  const handleReset = useCallback(() => {
    socket.emit("RESET_ROOM_REQUEST");
  }, [socket]);

  if (winner === "ABANDONED") {
    return (
      <FullPage>
        <div className="w-full max-w-sm flex flex-col gap-6 items-center text-center">
          <div>
            <div className="text-4xl font-black tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>GAME ENDED</div>
            <div className="text-sm font-black tracking-widest mt-3" style={{ color: "rgba(255,255,255,0.4)" }}>
              {room.abandonedBy} LEFT THE GAME
            </div>
          </div>
          {isHost && <Btn onClick={handleReset}>RETURN TO LOBBY</Btn>}
          {!isHost && <div className="text-xs tracking-widest py-2" style={{ color: "rgba(255,255,255,0.2)" }}>WAITING FOR HOST TO RESTART...</div>}
        </div>
      </FullPage>
    );
  }

  const survivors = room.players.filter((p) => p.isAlive);
  const eliminated = room.players.filter((p) => !p.isAlive);

  return (
    <FullPage>
      <div className="w-full max-w-sm flex flex-col gap-6 overflow-y-auto max-h-screen py-8">
        {/* Winner banner */}
        <div className="text-center">
          <div
            className="text-5xl font-black tracking-widest leading-none mb-2"
            style={{ color: winner === "MAFIA" ? "#FF3333" : "#FFFFFF" }}
          >
            GAME OVER
          </div>
          <div
            className="text-3xl font-black tracking-widest"
            style={{ color: winner === "MAFIA" ? "#FF3333" : "#FFFFFF" }}
          >
            // {winner} WINS
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white border-opacity-20" />

        {/* Survivors */}
        {survivors.length > 0 && (
          <div>
            <div className="text-xs tracking-widest opacity-40 mb-3">SURVIVED</div>
            <div className="flex flex-col gap-2">
              {survivors.map((p) => (
                <PlayerRow key={p.id} player={p} alive />
              ))}
            </div>
          </div>
        )}

        {/* Eliminated */}
        {eliminated.length > 0 && (
          <div>
            <div className="text-xs tracking-widest opacity-40 mb-3">ELIMINATED</div>
            <div className="flex flex-col gap-2">
              {eliminated.map((p) => (
                <PlayerRow key={p.id} player={p} alive={false} />
              ))}
            </div>
          </div>
        )}

        {/* Host reset */}
        {isHost && (
          <div className="mt-4">
            <Btn onClick={handleReset}>RETURN TO LOBBY</Btn>
          </div>
        )}

        {!isHost && (
          <div
            className="text-center text-xs tracking-widest py-4"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            WAITING FOR HOST TO RESTART...
          </div>
        )}
      </div>
    </FullPage>
  );
}

function PlayerRow({ player, alive }) {
  const roleColor = ROLE_COLOR[player.role] || "#FFFFFF";

  return (
    <div
      className="px-4 py-3 flex justify-between items-center border"
      style={{
        background: alive ? "#262626" : "#1A1A1A",
        borderColor: alive ? "rgba(255,255,255,0.2)" : "transparent",
      }}
    >
      <span
        className="text-sm font-black tracking-widest"
        style={{ color: alive ? "#FFFFFF" : "rgba(255,255,255,0.4)" }}
      >
        {player.name}
      </span>
      <span
        className="text-xs font-black tracking-widest"
        style={{
          color: alive ? roleColor : "rgba(255,255,255,0.2)",
        }}
      >
        {player.role}
      </span>
    </div>
  );
}
