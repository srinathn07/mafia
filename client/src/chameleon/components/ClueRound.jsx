import { useState, useCallback } from "react";
import { FullPage, TopicGrid, CBtn, CInput, C } from "../ChameleonApp.jsx";

export default function ClueRound({ room, myPlayer, privateInfo, socket }) {
  const [word, setWord] = useState("");
  const { gridRows, turnOrder, currentTurnIdx, clues, clueOrder, players } = room;
  const { isChameleon, secretCoord } = privateInfo;

  const currentPid = turnOrder[currentTurnIdx] ?? null;
  const myPid = myPlayer?.pid ?? null;
  const isMyTurn = currentPid === myPid;
  const alreadySubmitted = myPid && clues[myPid] !== undefined;

  const currentPlayer = currentPid ? players.find((p) => p.pid === currentPid) : null;

  const handleSubmit = useCallback(() => {
    const clean = word.trim();
    if (!clean || /\s/.test(clean)) return;
    socket.emit("CHAMELEON_SUBMIT_CLUE", { word: clean });
    setWord("");
  }, [word, socket]);

  // Build ordered clue list from clueOrder
  const submittedClues = clueOrder.map((pid) => {
    const player = players.find((p) => p.pid === pid);
    return { name: player?.name ?? pid, word: clues[pid], isMe: pid === myPid };
  });

  return (
    <FullPage>
      <div className="w-full max-w-sm flex flex-col gap-4" style={{ paddingTop: 16, paddingBottom: 16 }}>
        {/* Phase label */}
        <div style={{ textAlign: "center" }}>
          <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.25em" }}>CLUE ROUND</div>
          <div style={{ color: C.faint, fontSize: "8px", letterSpacing: "0.15em", marginTop: 3 }}>
            {currentTurnIdx} / {turnOrder.length} CLUES GIVEN
          </div>
        </div>

        {/* Grid */}
        <TopicGrid rows={gridRows} highlightCoord={isChameleon ? null : secretCoord} />

        {/* Role reminder */}
        <div style={{ textAlign: "center", padding: "6px 0", borderTop: `1px solid ${C.faint}`, borderBottom: `1px solid ${C.faint}` }}>
          {isChameleon
            ? <span style={{ color: C.amber, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em" }}>YOU ARE THE CHAMELEON — BLEND IN</span>
            : <span style={{ color: C.olive, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em" }}>SECRET WORD: <span style={{ color: C.text }}>{secretCoord}</span></span>
          }
        </div>

        {/* Submitted clues */}
        {submittedClues.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {submittedClues.map(({ name, word: w, isMe }, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: C.surface, border: `1px solid ${C.faint}` }}>
                <span style={{ fontSize: "9px", color: C.dim, letterSpacing: "0.1em" }}>{name}{isMe ? " (YOU)" : ""}</span>
                <span style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.1em", color: C.text }}>{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* Current turn */}
        {currentPlayer && (
          <div style={{ textAlign: "center", padding: "8px", border: `1px solid ${isMyTurn ? C.amber : C.faint}`, background: isMyTurn ? "rgba(212,160,23,0.06)" : "transparent" }}>
            {isMyTurn ? (
              <span style={{ color: C.amber, fontSize: "10px", fontWeight: 900, letterSpacing: "0.2em" }}>YOUR TURN — GIVE ONE WORD</span>
            ) : (
              <span style={{ color: C.dim, fontSize: "10px", fontWeight: 900, letterSpacing: "0.15em" }}>
                {currentPlayer.name}'S TURN...
              </span>
            )}
          </div>
        )}

        {/* Input — only on your turn */}
        {isMyTurn && !alreadySubmitted && (
          <div style={{ display: "flex", gap: 8 }}>
            <CInput
              value={word}
              onChange={(e) => setWord(e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 20))}
              placeholder="ONE WORD"
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              style={{ flex: 1 }}
            />
            <button onClick={handleSubmit} disabled={!word.trim()}
              style={{ padding: "0 16px", background: word.trim() ? C.amber : C.surface, color: word.trim() ? "#000" : C.dim, border: `1px solid ${word.trim() ? C.amber : C.faint}`, fontFamily: "inherit", fontSize: "9px", fontWeight: 900, letterSpacing: "0.15em", cursor: word.trim() ? "pointer" : "not-allowed" }}>
              SUBMIT
            </button>
          </div>
        )}
      </div>
    </FullPage>
  );
}
