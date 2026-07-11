import { useState, useCallback, useEffect, useRef } from "react";
import { FullPage, Btn } from "../App.jsx";

export default function Day({ room, myPlayer, socket }) {
  const [myVote, setMyVote] = useState(null);
  const [endSent, setEndSent] = useState(false);
  const voteLocked = room.timerRemaining <= 0;
  const isAlive = myPlayer?.isAlive;
  const isHost = myPlayer?.isHost;

  const eliminated = room.lastNightEliminated;
  const announcement =
    eliminated && eliminated !== "NONE"
      ? `MORNING HAS BROKEN. ${eliminated} WAS ELIMINATED DURING THE NIGHT.`
      : "MORNING HAS BROKEN. THE NIGHT PASSED WITHOUT ELIMINATIONS.";

  const livingPlayers = room.players.filter((p) => p.isAlive);

  // Tally display: count votes per player from server-side we don't have raw
  // votes, so just show whose row the current player voted for
  const handleEndDeliberation = useCallback(() => {
    if (endSent || voteLocked) return;
    setEndSent(true);
    socket.emit("END_DELIBERATION_REQUEST");
  }, [endSent, voteLocked, socket]);

  const handleVote = useCallback(
    (suspectId) => {
      if (!isAlive || voteLocked) return;
      if (suspectId === myPlayer?.id) return;
      setMyVote(suspectId);
      socket.emit("CAST_VOTE", { suspectId });
    },
    [isAlive, voteLocked, myPlayer, socket]
  );

  // Reset own vote marker when day resets (new round)
  const prevTimer = useRef(room.timerRemaining);
  useEffect(() => {
    if (room.timerRemaining > prevTimer.current) {
      setMyVote(null);
    }
    prevTimer.current = room.timerRemaining;
  }, [room.timerRemaining]);

  const minutes = Math.floor(room.timerRemaining / 60);
  const seconds = room.timerRemaining % 60;
  const timerDisplay = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <FullPage>
      <div className="w-full max-w-sm flex flex-col gap-5 overflow-y-auto max-h-screen py-8">

        {/* Night elimination announcement */}
        <div
          className="w-full px-4 py-5 border text-center"
          style={{ borderColor: "#FFFFFF", background: "#1A1A1A" }}
        >
          <div className="text-xs font-black tracking-widest leading-relaxed">{announcement}</div>
        </div>

        {/* Dead / Spectator */}
        {!isAlive ? (
          <>
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

            <div className="text-center">
              <div
                className="text-4xl font-black tracking-widest tabular-nums"
                style={{ color: "rgba(255,255,255,0.2)" }}
              >
                {timerDisplay}
              </div>
            </div>

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
          </>
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

            {/* Host early-end button */}
            {isHost && !voteLocked && (
              <button
                onClick={handleEndDeliberation}
                disabled={endSent}
                className="w-full py-3 text-xs font-black tracking-widest border transition-all duration-100 ease-linear"
                style={{
                  background: "transparent",
                  borderColor: endSent ? "rgba(255,51,51,0.3)" : "#FF3333",
                  color: endSent ? "rgba(255,51,51,0.4)" : "#FF3333",
                  cursor: endSent ? "not-allowed" : "pointer",
                }}
              >
                {endSent ? "ENDING..." : "END DELIBERATION"}
              </button>
            )}

            {/* Voting roster or tally result */}
            {!voteLocked ? (
              <>
                <div className="text-xs tracking-widest opacity-40 mb-1">VOTE TO EXECUTE</div>
                <div className="flex flex-col gap-2">
                  {livingPlayers.map((p) => {
                    const isMe = p.id === myPlayer?.id;
                    const isVoted = myVote === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => !isMe && handleVote(p.id)}
                        disabled={isMe}
                        className="w-full px-4 py-4 text-left text-sm font-black tracking-widest transition-all duration-100 ease-linear flex justify-between items-center"
                        style={{
                          background: isVoted ? "#FF3333" : isMe ? "#1A1A1A" : "#262626",
                          color: isMe ? "rgba(255,255,255,0.3)" : "#FFFFFF",
                          border: isVoted
                            ? "2px solid #FF3333"
                            : "1px solid rgba(255,255,255,0.2)",
                          cursor: isMe ? "default" : "pointer",
                        }}
                      >
                        <span>{p.name}</span>
                        {isMe && <span className="text-xs opacity-30">YOU</span>}
                        {isVoted && <span className="text-xs">VOTED</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <VoteLockResult room={room} myVote={myVote} livingPlayers={livingPlayers} />
            )}
          </>
        )}
      </div>
    </FullPage>
  );
}

function VoteLockResult({ room, myVote, livingPlayers }) {
  return (
    <div className="flex flex-col gap-4">
      <div
        className="w-full px-4 py-4 border text-center"
        style={{ borderColor: "#FF3333", background: "#1A1A1A" }}
      >
        <div className="text-xs font-black tracking-widest mb-1" style={{ color: "#FF3333" }}>
          VOTES LOCKED — TALLYING
        </div>
        {myVote && (
          <div className="text-xs tracking-widest opacity-40 mt-1">
            YOU VOTED: {livingPlayers.find((p) => p.id === myVote)?.name ?? "—"}
          </div>
        )}
      </div>

      <div className="text-xs tracking-widest opacity-30 text-center animate-pulse">
        TRANSITIONING TO NIGHT...
      </div>
    </div>
  );
}
