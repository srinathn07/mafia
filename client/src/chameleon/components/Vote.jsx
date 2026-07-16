import { useState } from "react";
import { FullPage, CBtn, C } from "../ChameleonApp.jsx";

export default function Vote({ room, myPlayer, socket }) {
  const { phase, players, votes, voteCount, tiedPlayerIds } = room;
  const [selected, setSelected] = useState(null);
  const [locked, setLocked] = useState(false);

  const myId = myPlayer?.id;
  const isHost = myPlayer?.isHost;
  const isTieBreak = phase === "TIE_BREAK";
  const alreadyVoted = myId && votes[myId] !== undefined;

  const handleLock = () => {
    if (!selected || locked) return;
    setLocked(true);
    socket.emit("CHAMELEON_SUBMIT_VOTE", { targetId: selected });
  };

  const handleTieBreak = (targetId) => {
    socket.emit("CHAMELEON_BREAK_TIE", { targetId });
  };

  // ── TIE_BREAK view ──────────────────────────────────────────────────────────
  if (isTieBreak) {
    const tiedPlayers = players.filter((p) => tiedPlayerIds.includes(p.id));
    const [tieSelected, setTieSelected] = useState(null);

    if (!isHost) {
      return (
        <FullPage>
          <div className="w-full max-w-sm flex flex-col gap-6 items-center">
            <div style={{ textAlign: "center" }}>
              <div style={{ color: C.amber, fontSize: "9px", fontWeight: 900, letterSpacing: "0.3em", marginBottom: 8 }}>TIE VOTE</div>
              <div style={{ color: C.text, fontSize: "18px", fontWeight: 900, letterSpacing: "0.1em" }}>IT'S A TIE</div>
            </div>
            <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", textAlign: "center" }}>
              WAITING FOR HOST TO DECIDE...
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
              {tiedPlayers.map((p) => (
                <div key={p.id} style={{ padding: "12px 16px", border: `1px solid ${C.faint}`, background: C.surface, fontSize: "11px", fontWeight: 900, letterSpacing: "0.1em" }}>
                  {p.name}
                </div>
              ))}
            </div>
          </div>
        </FullPage>
      );
    }

    return (
      <FullPage>
        <div className="w-full max-w-sm flex flex-col gap-5">
          <div style={{ textAlign: "center" }}>
            <div style={{ color: C.amber, fontSize: "9px", fontWeight: 900, letterSpacing: "0.3em", marginBottom: 8 }}>TIE VOTE</div>
            <div style={{ color: C.text, fontSize: "16px", fontWeight: 900, letterSpacing: "0.1em" }}>YOU DECIDE</div>
            <div style={{ color: C.dim, fontSize: "9px", letterSpacing: "0.15em", marginTop: 4 }}>TAP TO REVEAL ONE TIED PLAYER</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {tiedPlayers.map((p) => (
              <button key={p.id} onClick={() => setTieSelected(p.id)}
                style={{ padding: "14px 16px", border: `1px solid ${tieSelected === p.id ? C.amber : C.faint}`, background: tieSelected === p.id ? "rgba(212,160,23,0.1)" : C.surface, color: C.text, fontFamily: "inherit", fontSize: "13px", fontWeight: 900, letterSpacing: "0.1em", cursor: "pointer", textAlign: "left" }}>
                {p.name}
              </button>
            ))}
          </div>
          <CBtn onClick={() => tieSelected && handleTieBreak(tieSelected)} disabled={!tieSelected}>
            REVEAL THIS PLAYER
          </CBtn>
        </div>
      </FullPage>
    );
  }

  // ── VOTE view ───────────────────────────────────────────────────────────────
  const votableTargets = players.filter((p) => p.id !== myId);

  // Build vote tally if all voted (shouldn't happen during VOTE but just in case)
  const allVotesIn = voteCount >= players.length;

  if (alreadyVoted || locked) {
    return (
      <FullPage>
        <div className="w-full max-w-sm flex flex-col gap-6 items-center">
          <div style={{ textAlign: "center" }}>
            <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.3em", marginBottom: 8 }}>VOTING</div>
            <div style={{ color: C.olive, fontSize: "16px", fontWeight: 900, letterSpacing: "0.1em" }}>VOTE LOCKED IN</div>
          </div>
          <div style={{ color: C.faint, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", textAlign: "center" }}>
            {voteCount} OF {players.length} VOTED
          </div>
          <div className="animate-pulse" style={{ width: 4, height: 4, background: C.olive, marginTop: 8 }} />
        </div>
      </FullPage>
    );
  }

  return (
    <FullPage>
      <div className="w-full max-w-sm flex flex-col gap-5">
        <div style={{ textAlign: "center" }}>
          <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.3em", marginBottom: 8 }}>VOTING</div>
          <div style={{ color: C.text, fontSize: "16px", fontWeight: 900, letterSpacing: "0.1em" }}>WHO IS THE CHAMELEON?</div>
          <div style={{ color: C.faint, fontSize: "9px", letterSpacing: "0.15em", marginTop: 4 }}>
            {voteCount} OF {players.length} VOTED
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {votableTargets.map((p) => (
            <button key={p.id} onClick={() => setSelected(p.id)}
              style={{ padding: "14px 16px", border: `1px solid ${selected === p.id ? C.amber : C.faint}`, background: selected === p.id ? "rgba(212,160,23,0.1)" : C.surface, color: C.text, fontFamily: "inherit", fontSize: "13px", fontWeight: 900, letterSpacing: "0.1em", cursor: "pointer", textAlign: "left", transition: "border-color 0.1s, background 0.1s" }}>
              {p.name}
            </button>
          ))}
        </div>

        <CBtn onClick={handleLock} disabled={!selected}>
          LOCK IN VOTE
        </CBtn>
      </div>
    </FullPage>
  );
}
