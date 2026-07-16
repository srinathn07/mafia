import { useState } from "react";
import { C, ROOM_COLOR, FullPage, TRBtn } from "../TwoRoomsApp.jsx";

// Mirrors hostageCount() in server — keep in sync
function hostageCount(playerCount, roundNum, totalRounds) {
  let base = playerCount >= 22 ? 3 : playerCount >= 11 ? 2 : 1;
  if (totalRounds === 5) base += 2;
  return Math.max(1, base - (roundNum - 1));
}

export default function HostageSelect({ room, myPlayer, myPid, privateInfo, socket }) {
  const [picks, setPicks] = useState([]);

  const myRoom = myPlayer?.currentRoom;
  const roomColor = myRoom ? ROOM_COLOR[myRoom] : C.dim;
  const myRoomLeader = myRoom === "A" ? room.roomALeader : room.roomBLeader;
  const amLeader = myRoomLeader === myPid;
  const submitted = myRoom === "A" ? room.hostageSubmittedA : room.hostageSubmittedB;
  const otherSubmitted = myRoom === "A" ? room.hostageSubmittedB : room.hostageSubmittedA;

  const required = hostageCount(room.players.length, room.currentRound, room.settings.rounds);
  const myRoomPlayers = room.players.filter(p => p.currentRoom === myRoom && p.pid !== myRoomLeader);

  function togglePick(pid) {
    if (submitted) return;
    setPicks(prev => {
      if (prev.includes(pid)) return prev.filter(p => p !== pid);
      if (prev.length >= required) return prev;
      return [...prev, pid];
    });
  }

  function handleSubmit() {
    if (picks.length !== required || submitted) return;
    socket.emit("TR_SUBMIT_HOSTAGES", { picks });
  }

  return (
    <FullPage>
      <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", maxHeight: "100vh", padding: "32px 0" }}>

        {/* Header */}
        <div style={{ textAlign: "center" }}>
          <div style={{ color: roomColor, fontSize: "9px", fontWeight: 900, letterSpacing: "0.3em", marginBottom: 4 }}>
            ROUND {room.currentRound} ENDED
          </div>
          <div style={{ color: C.text, fontSize: "20px", fontWeight: 900, letterSpacing: "0.1em" }}>
            HOSTAGE SELECTION
          </div>
        </div>

        {amLeader && !submitted ? (
          <>
            <div style={{ border: `1px solid ${C.faint}`, padding: "10px 14px" }}>
              <div style={{ color: C.dim, fontSize: "8px", fontWeight: 900, letterSpacing: "0.2em", marginBottom: 8 }}>
                SELECT {required} PLAYER{required > 1 ? "S" : ""} TO SEND TO THE OTHER ROOM
              </div>
              <div style={{ color: C.faint, fontSize: "8px", letterSpacing: "0.1em", marginBottom: 12 }}>
                YOU (LEADER) CANNOT BE SELECTED.
              </div>
              {myRoomPlayers.map(p => {
                const selected = picks.includes(p.pid);
                return (
                  <button key={p.pid} onClick={() => togglePick(p.pid)}
                    style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", marginBottom: 4, background: selected ? `${roomColor}20` : C.surface2, border: `1px solid ${selected ? roomColor : C.faint}`, color: selected ? C.text : C.dim, fontFamily: "inherit", fontSize: "11px", fontWeight: 900, letterSpacing: "0.08em", cursor: "pointer", textAlign: "left" }}>
                    <span>{p.name}</span>
                    {selected && <span style={{ color: roomColor, fontSize: "10px" }}>✓</span>}
                  </button>
                );
              })}
            </div>

            <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.15em", textAlign: "center" }}>
              {picks.length} / {required} SELECTED
            </div>

            <TRBtn onClick={handleSubmit} disabled={picks.length !== required}>
              CONFIRM HOSTAGES
            </TRBtn>
          </>
        ) : amLeader && submitted ? (
          <div style={{ border: `1px solid ${roomColor}40`, padding: "14px", background: `${roomColor}10` }}>
            <div style={{ color: roomColor, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", marginBottom: 8 }}>
              HOSTAGES SUBMITTED
            </div>
            <div style={{ color: C.text, fontSize: "11px", fontWeight: 900, letterSpacing: "0.08em" }}>
              {picks.map(pid => room.players.find(p => p.pid === pid)?.name).filter(Boolean).join(", ")}
            </div>
            {!otherSubmitted && (
              <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.15em", marginTop: 10 }}>
                WAITING FOR OTHER ROOM'S LEADER...
              </div>
            )}
          </div>
        ) : (
          // Non-leader view
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", paddingTop: 20 }}>
            <div className="animate-pulse" style={{ width: 4, height: 4, background: roomColor }} />
            <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em" }}>
              {submitted
                ? `YOUR LEADER HAS SELECTED ${required} HOSTAGE${required > 1 ? "S" : ""}`
                : "YOUR LEADER IS SELECTING HOSTAGES..."}
            </div>
            {!otherSubmitted && submitted && (
              <div style={{ color: C.faint, fontSize: "9px", fontWeight: 900, letterSpacing: "0.15em" }}>
                WAITING FOR OTHER ROOM'S LEADER...
              </div>
            )}
          </div>
        )}
      </div>
    </FullPage>
  );
}
