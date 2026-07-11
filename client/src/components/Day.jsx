import { useState, useCallback } from "react";
import { FullPage, Btn } from "../App.jsx";

export default function Day({ room, myPlayer, socket }) {
  const [myVote, setMyVote] = useState(null);
  const [voteLocked, setVoteLocked] = useState(false);

  const isAlive = myPlayer?.isAlive;
  const eliminated = room.lastNightEliminated;

  const announcement =
    eliminated && eliminated !== "NONE"
      ? `MORNING HAS BROKEN. ${eliminated} WAS ELIMINATED FROM THE TOWN.`
      : "MORNING HAS BROKEN. THE NIGHT PASSED WITHOUT ELIMINATIONS.";

  const livingPlayers = room.players.filter((p) => p.isAlive);
  const timerExpired = room.timerRemaining <= 0;

  // Count votes per player
  const voteCounts = {};
  // We don't have raw votes from server — just show who the current player voted
  // Server manages tally; client shows their own vote highlight

  const handleVote = useCallback(
    (suspectId) => {
      if (!isAlive || voteLocked || timerExpired) return;
      if (suspectId === myPlayer?.id) return;
      setMyVote(suspectId);
      socket.emit("CAST_VOTE", { suspectId });
    },
    [isAlive, voteLocked, timerExpired, myPlayer, socket]
  );

  // Lock votes when timer hits 0
  if (timerExpired && !voteLocked) {
    setVoteLocked(true);
  }

  const minutes = Math.floor(room.timerRemaining / 60);
  const seconds = room.timerRemaining % 60;
  const timerDisplay = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <FullPage>
      <div className="w-full max-w-sm flex flex-col gap-5 overflow-y-auto max-h-screen py-8">
        {/* Announcement banner */}
        <div
          className="w-full px-4 py-5 border text-center"
          style={{ borderColor: "#FFFFFF", background: "#1A1A1A" }}
        >
          <div className="text-xs font-black tracking-widest leading-relaxed">{announcement}</div>
        </div>

        {/* Dead / Spectator */}
        {!isAlive ? (
          <div
            className="w-full px-4 py-6 border text-center"
            style={{ borderColor: "rgba(255,255,255,0.1)", background: "#1A1A1A" }}
          >
            <div
              className="text-xs font-bold tracking-widest"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              STATUS: ELIMINATED / SPECTATING STATE ACTIVE
            </div>
          </div>
        ) : (
          <>
            {/* Timer */}
            <div className="text-center">
              <div className="text-xs tracking-widest opacity-40 mb-1">DELIBERATION ENDS IN</div>
              <div
                className="text-5xl font-black tracking-widest tabular-nums"
                style={{ color: room.timerRemaining <= 10 ? "#FF3333" : "#FFFFFF" }}
              >
                {timerDisplay}
              </div>
            </div>

            {/* Voting roster */}
            <div className="text-xs tracking-widest opacity-40 mb-1">VOTE TO EXECUTE</div>
            <div className="flex flex-col gap-2">
              {livingPlayers.map((p) => {
                const isMe = p.id === myPlayer?.id;
                const isVoted = myVote === p.id;

                return (
                  <button
                    key={p.id}
                    onClick={() => !isMe && handleVote(p.id)}
                    disabled={isMe || voteLocked}
                    className="w-full px-4 py-4 text-left text-sm font-black tracking-widest transition-all duration-100 ease-linear flex justify-between items-center"
                    style={{
                      background: isVoted ? "#FF3333" : isMe ? "#1A1A1A" : "#262626",
                      color: isMe ? "rgba(255,255,255,0.3)" : "#FFFFFF",
                      border: isVoted
                        ? "2px solid #FF3333"
                        : "1px solid rgba(255,255,255,0.2)",
                      cursor: isMe || voteLocked ? "default" : "pointer",
                    }}
                  >
                    <span>{p.name}</span>
                    {isMe && <span className="text-xs opacity-30">YOU</span>}
                    {isVoted && <span className="text-xs">VOTED</span>}
                  </button>
                );
              })}
            </div>

            {voteLocked && (
              <div className="text-center py-2">
                <div className="text-xs tracking-widest" style={{ color: "#FF3333" }}>
                  VOTES LOCKED — TALLYING...
                </div>
              </div>
            )}
          </>
        )}

        {/* Spectator player list */}
        {!isAlive && (
          <div className="flex flex-col gap-2">
            <div className="text-xs tracking-widest opacity-30 mb-1">LIVING PLAYERS</div>
            {livingPlayers.map((p) => (
              <div
                key={p.id}
                className="px-4 py-3 text-sm font-bold tracking-widest"
                style={{ background: "#1A1A1A", color: "rgba(255,255,255,0.4)" }}
              >
                {p.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </FullPage>
  );
}
