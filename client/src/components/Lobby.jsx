import { useEffect, useState, useCallback } from "react";
import { FullPage, Label, Btn, BtnSecondary, ErrorText } from "../App.jsx";

function getRoleDistribution(count) {
  let mafia = 1;
  if (count >= 9) mafia = 3;
  else if (count >= 7) mafia = 2;
  const villagers = count - mafia - 2;
  return { mafia, doctor: 1, detective: 1, villagers };
}

export default function Lobby({ room, myPlayer, socket, joinError }) {
  const isHost = myPlayer?.isHost;
  const joined = !!myPlayer;
  const playerCount = room.playerCount || 5;
  const dist = getRoleDistribution(playerCount);
  const connectedCount = room.players.length;
  const canStart = connectedCount === playerCount;

  const handleCountChange = useCallback(
    (delta) => {
      const next = Math.max(5, Math.min(16, playerCount + delta));
      socket.emit("SET_PLAYER_COUNT", { count: next });
    },
    [playerCount, socket]
  );

  const handleStart = useCallback(() => {
    if (!canStart) return;
    socket.emit("GAME_START_REQUEST");
  }, [canStart, socket]);

  if (!joined) {
    // Guest waiting state — shown after join request sent but before room update places them
    return (
      <FullPage>
        <div className="text-xs font-bold tracking-widest opacity-40">CONNECTING...</div>
        {joinError && <ErrorText>{joinError}</ErrorText>}
      </FullPage>
    );
  }

  if (!isHost) {
    return (
      <FullPage>
        <div className="w-full max-w-sm flex flex-col gap-6">
          <div className="text-center">
            <div className="text-xs tracking-widest opacity-40 mb-1">ROOM CODE</div>
            <div className="text-4xl font-black tracking-widest">{room.roomCode}</div>
          </div>

          <div className="border border-white border-opacity-20 p-4">
            <div className="text-xs tracking-widest opacity-40 mb-3">
              PLAYERS — {connectedCount} / {playerCount}
            </div>
            {room.players.map((p) => (
              <div
                key={p.id}
                className="py-2 border-b border-white border-opacity-10 text-sm font-bold tracking-widest flex justify-between"
              >
                <span>{p.name}</span>
                {p.isHost && <span className="opacity-30 text-xs">HOST</span>}
                {p.id === myPlayer?.id && <span className="opacity-30 text-xs">YOU</span>}
              </div>
            ))}
          </div>

          <div className="text-center py-8">
            <div className="text-xs font-bold tracking-widest opacity-30 animate-pulse">
              WAITING FOR HOST TO START...
            </div>
          </div>
        </div>
      </FullPage>
    );
  }

  // Host view
  return (
    <FullPage>
      <div className="w-full max-w-sm flex flex-col gap-5 overflow-y-auto max-h-screen py-8">
        {/* Room code */}
        <div className="text-center">
          <div className="text-xs tracking-widest opacity-40 mb-1">ROOM CODE</div>
          <div className="text-5xl font-black tracking-widest">{room.roomCode}</div>
        </div>

        {/* Player count config */}
        <div className="border border-white p-4">
          <Label>PLAYER COUNT</Label>
          <div className="flex items-center justify-between mt-3">
            <button
              onClick={() => handleCountChange(-1)}
              className="w-12 h-12 border border-white text-xl font-black transition-all duration-100 ease-linear"
              style={{ background: "#262626" }}
            >
              -
            </button>
            <div className="text-4xl font-black tracking-widest">{playerCount}</div>
            <button
              onClick={() => handleCountChange(1)}
              className="w-12 h-12 border border-white text-xl font-black transition-all duration-100 ease-linear"
              style={{ background: "#262626" }}
            >
              +
            </button>
          </div>
        </div>

        {/* Role distribution table */}
        <div className="border border-white border-opacity-20">
          <div className="px-4 py-2 border-b border-white border-opacity-20">
            <div className="text-xs tracking-widest opacity-40">ROLE DISTRIBUTION</div>
          </div>
          <RoleRow label="MAFIA" count={dist.mafia} danger />
          <RoleRow label="DOCTOR" count={dist.doctor} />
          <RoleRow label="DETECTIVE" count={dist.detective} />
          <RoleRow label="VILLAGER" count={dist.villagers} />
        </div>

        {/* Player roster */}
        <div className="border border-white border-opacity-20">
          <div className="px-4 py-2 border-b border-white border-opacity-20">
            <div className="text-xs tracking-widest opacity-40">
              CONNECTED — {connectedCount} / {playerCount}
            </div>
          </div>
          {room.players.map((p) => (
            <div
              key={p.id}
              className="px-4 py-3 border-b border-white border-opacity-10 text-sm font-bold tracking-widest flex justify-between"
            >
              <span>{p.name}</span>
              <span className="opacity-30 text-xs">{p.isHost ? "HOST" : "GUEST"}</span>
            </div>
          ))}
          {connectedCount < playerCount && (
            <div className="px-4 py-3 text-xs tracking-widest opacity-20">
              WAITING FOR {playerCount - connectedCount} MORE PLAYER{playerCount - connectedCount > 1 ? "S" : ""}...
            </div>
          )}
        </div>

        {/* Settings */}
        <div className="border border-white border-opacity-20 flex items-center justify-between px-4 py-3">
          <div className="text-xs font-black tracking-widest">DEAD PLAYERS SEE ROLES</div>
          <button
            onClick={() => socket.emit("SET_ROOM_OPTION", { revealRolesOnElimination: !room.revealRolesOnElimination })}
            className="text-xs font-black tracking-widest px-3 py-1 border transition-all duration-100 ease-linear"
            style={{
              background: room.revealRolesOnElimination ? "#FFFFFF" : "transparent",
              color: room.revealRolesOnElimination ? "#121212" : "rgba(255,255,255,0.4)",
              borderColor: room.revealRolesOnElimination ? "#FFFFFF" : "rgba(255,255,255,0.2)",
            }}
          >
            {room.revealRolesOnElimination ? "ON" : "OFF"}
          </button>
        </div>

        <Btn onClick={handleStart} disabled={!canStart}>
          {canStart ? "START GAME" : `NEED ${playerCount - connectedCount} MORE PLAYER${playerCount - connectedCount !== 1 ? "S" : ""}`}
        </Btn>
      </div>
    </FullPage>
  );
}

function RoleRow({ label, count, danger = false }) {
  return (
    <div className="px-4 py-3 border-b border-white border-opacity-10 flex justify-between items-center">
      <span
        className="text-xs font-black tracking-widest"
        style={{ color: danger ? "#FF3333" : "#FFFFFF" }}
      >
        {label}
      </span>
      <span
        className="text-sm font-black"
        style={{ color: danger ? "#FF3333" : "#FFFFFF" }}
      >
        {count}x
      </span>
    </div>
  );
}
