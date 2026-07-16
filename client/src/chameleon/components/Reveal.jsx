import { useState } from "react";
import { FullPage, TopicGrid, CBtn, C } from "../ChameleonApp.jsx";
import { coordToWord } from "../data/grids.js";

export default function Reveal({ room, myPlayer, privateInfo, socket, onGoHome }) {
  const { phase, players, gridRows, votes, revealedPlayerId, chameleonId, secretCoord, chameleonGuess, winner, settings } = room;
  const { isChameleon } = privateInfo;
  const isHost = myPlayer?.isHost;

  const [guessSelected, setGuessSelected] = useState(null);
  const [guessLocked, setGuessLocked] = useState(false);

  if (winner === "ABANDONED") {
    return (
      <FullPage>
        <div className="w-full max-w-sm flex flex-col gap-6 items-center" style={{ textAlign: "center" }}>
          <div>
            <div style={{ color: C.dim, fontSize: "32px", fontWeight: 900, letterSpacing: "0.1em" }}>GAME ENDED</div>
            <div style={{ color: C.faint, fontSize: "11px", fontWeight: 900, letterSpacing: "0.15em", marginTop: 10 }}>
              {room.abandonedBy} LEFT THE GAME
            </div>
          </div>
          {isHost && <CBtn onClick={() => socket.emit("CHAMELEON_PLAY_AGAIN")}>RETURN TO LOBBY</CBtn>}
          {!isHost && <div style={{ color: C.faint, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em" }}>WAITING FOR HOST TO RESTART...</div>}
          <button onClick={onGoHome} style={{ background: "none", border: "none", color: C.faint, fontFamily: "inherit", fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", cursor: "pointer" }}>← LEAVE GAME</button>
        </div>
      </FullPage>
    );
  }

  const revealedPlayer = revealedPlayerId ? players.find((p) => p.id === revealedPlayerId) : null;
  const chameleonPlayer = chameleonId ? players.find((p) => p.id === chameleonId) : null;
  const secretWord = secretCoord ? coordToWord(settings.gridKey, secretCoord) : null;

  // ── CHAMELEON_GUESS phase ───────────────────────────────────────────────────
  if (phase === "CHAMELEON_GUESS") {
    if (isChameleon) {
      return (
        <FullPage>
          <div className="w-full max-w-sm flex flex-col gap-5" style={{ paddingTop: 16, paddingBottom: 16 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ color: C.amber, fontSize: "9px", fontWeight: 900, letterSpacing: "0.3em", marginBottom: 6 }}>YOU'VE BEEN CAUGHT</div>
              <div style={{ color: C.text, fontSize: "18px", fontWeight: 900, letterSpacing: "0.1em" }}>GUESS THE SECRET WORD</div>
              <div style={{ color: C.dim, fontSize: "9px", letterSpacing: "0.15em", marginTop: 4 }}>
                CORRECT GUESS → YOU WIN
              </div>
            </div>
            <TopicGrid
              rows={gridRows}
              highlightCoord={guessSelected}
              onCellSelect={(coord) => !guessLocked && setGuessSelected(coord)}
            />
            <CBtn onClick={() => {
              if (!guessSelected || guessLocked) return;
              const word = coordToWord(settings.gridKey, guessSelected);
              if (!word) return;
              setGuessLocked(true);
              socket.emit("CHAMELEON_SUBMIT_GUESS", { word: word.toUpperCase() });
            }} disabled={!guessSelected || guessLocked}>
              {guessLocked ? "GUESSING..." : "SUBMIT GUESS"}
            </CBtn>
          </div>
        </FullPage>
      );
    }

    return (
      <FullPage>
        <div className="flex flex-col items-center gap-6">
          <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.3em" }}>CHAMELEON IS GUESSING</div>
          <div className="animate-pulse" style={{ width: 4, height: 4, background: C.amber }} />
          <div style={{ color: C.faint, fontSize: "9px", letterSpacing: "0.15em" }}>
            {chameleonPlayer?.name ?? "..."} IS PICKING A WORD
          </div>
        </div>
      </FullPage>
    );
  }

  // ── REVEAL phase ────────────────────────────────────────────────────────────
  const crewWon = winner === "CREW";
  const accentColor = crewWon ? C.olive : C.amber;

  // Build vote tally
  const tallyCounts = {};
  for (const targetId of Object.values(votes)) {
    tallyCounts[targetId] = (tallyCounts[targetId] || 0) + 1;
  }
  const tallyRows = players
    .map((p) => ({ player: p, count: tallyCounts[p.id] || 0, wasRevealed: p.id === revealedPlayerId, isCham: p.id === chameleonId }))
    .sort((a, b) => b.count - a.count);

  return (
    <FullPage>
      <div className="w-full max-w-sm flex flex-col gap-5" style={{ paddingTop: 16, paddingBottom: 24 }}>
        {/* Winner banner */}
        <div style={{ textAlign: "center", padding: "16px", border: `2px solid ${accentColor}`, background: `${accentColor}18` }}>
          <div style={{ color: accentColor, fontSize: "9px", fontWeight: 900, letterSpacing: "0.3em", marginBottom: 4 }}>
            {crewWon ? "CREW WINS" : "CHAMELEON WINS"}
          </div>
          <div style={{ color: C.text, fontSize: "22px", fontWeight: 900, letterSpacing: "0.1em" }}>
            {crewWon ? "THE TRUTH IS OUT" : "THEY GOT AWAY"}
          </div>
        </div>

        {/* Chameleon identity */}
        <div style={{ border: `1px solid ${C.faint}`, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em" }}>THE CHAMELEON WAS</div>
          <div style={{ color: C.amber, fontSize: "20px", fontWeight: 900, letterSpacing: "0.12em" }}>
            {chameleonPlayer?.name ?? "—"}
          </div>
          <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", marginTop: 4 }}>SECRET WORD WAS</div>
          <div style={{ color: C.olive, fontSize: "16px", fontWeight: 900, letterSpacing: "0.1em" }}>
            {secretCoord} — {secretWord ?? "—"}
          </div>
          {chameleonGuess != null && (
            <>
              <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", marginTop: 4 }}>CHAMELEON GUESSED</div>
              <div style={{ color: crewWon ? C.red : C.olive, fontSize: "16px", fontWeight: 900, letterSpacing: "0.1em" }}>
                {chameleonGuess} {crewWon ? "✗ WRONG" : "✓ CORRECT"}
              </div>
            </>
          )}
        </div>

        {/* Vote tally */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", marginBottom: 4 }}>VOTE TALLY</div>
          {tallyRows.map(({ player, count, wasRevealed, isCham }) => (
            <div key={player.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 12px", background: wasRevealed ? "rgba(212,160,23,0.1)" : C.surface, border: `1px solid ${wasRevealed ? C.amber : C.faint}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.08em" }}>{player.name}</span>
                {isCham && <span style={{ color: C.amber, fontSize: "7px", fontWeight: 900, letterSpacing: "0.15em" }}>CHAMELEON</span>}
              </div>
              <span style={{ color: count > 0 ? C.text : C.faint, fontSize: "11px", fontWeight: 900 }}>{count}</span>
            </div>
          ))}
        </div>

        {/* Controls */}
        {isHost && (
          <CBtn onClick={() => socket.emit("CHAMELEON_PLAY_AGAIN")}>PLAY AGAIN</CBtn>
        )}
        {!isHost && (
          <div style={{ color: C.faint, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", textAlign: "center" }}>
            WAITING FOR HOST TO START NEXT ROUND...
          </div>
        )}
        <button onClick={onGoHome} style={{ background: "none", border: "none", color: C.faint, fontFamily: "inherit", fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", cursor: "pointer", padding: "4px 0" }}>
          ← LEAVE GAME
        </button>
      </div>
    </FullPage>
  );
}
