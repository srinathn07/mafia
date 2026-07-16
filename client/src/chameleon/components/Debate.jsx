import { useState, useEffect } from "react";
import { FullPage, TopicGrid, C } from "../ChameleonApp.jsx";

export default function Debate({ room, myPlayer, privateInfo, socket }) {
  const { gridRows, clues, clueOrder, players, debateEndTime } = room;
  const { isChameleon, secretCoord } = privateInfo;
  const isHost = myPlayer?.isHost;

  const [secsLeft, setSecsLeft] = useState(() =>
    debateEndTime ? Math.max(0, Math.ceil((debateEndTime - Date.now()) / 1000)) : 120
  );

  useEffect(() => {
    if (!debateEndTime) return;
    const tick = () => setSecsLeft(Math.max(0, Math.ceil((debateEndTime - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [debateEndTime]);

  const mins = String(Math.floor(secsLeft / 60)).padStart(2, "0");
  const secs = String(secsLeft % 60).padStart(2, "0");
  const urgent = secsLeft <= 30;

  const submittedClues = clueOrder.map((pid) => {
    const player = players.find((p) => p.pid === pid);
    return { name: player?.name ?? pid, word: clues[pid], isMe: pid === myPlayer?.pid };
  });

  return (
    <FullPage>
      <div className="w-full max-w-sm flex flex-col gap-4" style={{ paddingTop: 16, paddingBottom: 16 }}>
        {/* Phase label */}
        <div style={{ textAlign: "center" }}>
          <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.25em" }}>DEBATE</div>
          <div style={{ color: C.faint, fontSize: "8px", letterSpacing: "0.15em", marginTop: 2 }}>DISCUSS, THEN VOTE</div>
        </div>

        {/* Timer */}
        <div style={{ textAlign: "center", padding: "14px", border: `1px solid ${urgent ? C.amber : C.faint}`, background: urgent ? "rgba(212,160,23,0.06)" : "transparent" }}>
          <div style={{ fontSize: "40px", fontWeight: 900, letterSpacing: "0.15em", color: urgent ? C.amber : C.text, fontVariantNumeric: "tabular-nums" }}>
            {mins}:{secs}
          </div>
          {secsLeft === 0 && (
            <div style={{ color: C.dim, fontSize: "9px", letterSpacing: "0.2em", marginTop: 4 }}>VOTING OPENS...</div>
          )}
        </div>

        {/* Grid */}
        <TopicGrid rows={gridRows} highlightCoord={isChameleon ? null : secretCoord} />

        {/* Role reminder */}
        <div style={{ textAlign: "center" }}>
          {isChameleon
            ? <span style={{ color: C.amber, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em" }}>YOU ARE THE CHAMELEON</span>
            : <span style={{ color: C.olive, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em" }}>SECRET WORD: <span style={{ color: C.text }}>{secretCoord}</span></span>
          }
        </div>

        {/* Clue recap */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", marginBottom: 4 }}>ALL CLUES</div>
          {submittedClues.map(({ name, word, isMe }, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: C.surface, border: `1px solid ${C.faint}` }}>
              <span style={{ fontSize: "9px", color: C.dim, letterSpacing: "0.1em" }}>{name}{isMe ? " (YOU)" : ""}</span>
              <span style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.1em" }}>{word}</span>
            </div>
          ))}
        </div>

        {/* Host early end */}
        {isHost && (
          <button onClick={() => socket.emit("CHAMELEON_END_DEBATE_EARLY")}
            style={{ background: "none", border: `1px solid ${C.faint}`, color: C.dim, fontFamily: "inherit", fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", padding: "8px", cursor: "pointer" }}>
            END DEBATE EARLY
          </button>
        )}
      </div>
    </FullPage>
  );
}
