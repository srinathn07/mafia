import { C, ROOM_COLOR, FullPage, TRBtn } from "../TwoRoomsApp.jsx";

export default function MigrationScreen({ room, myPlayer, myPid, privateInfo, socket }) {
  const myRoom = myPlayer?.currentRoom;
  const roomColor = myRoom ? ROOM_COLOR[myRoom] : C.dim;
  const myRoomLeader = myRoom === "A" ? room.roomALeader : room.roomBLeader;
  const amLeader = myRoomLeader === myPid;
  const parlayReady = myRoom === "A" ? room.parlayReadyA : room.parlayReadyB;
  const otherReady = myRoom === "A" ? room.parlayReadyB : room.parlayReadyA;
  const isFinalRound = room.currentRound === room.settings.rounds;

  // Show own room's hostage picks (revealed at parlay phase)
  const myRoomPicks = privateInfo.myRoomPicks ?? [];
  const pickNames = myRoomPicks
    .map(pid => room.players.find(p => p.pid === pid)?.name)
    .filter(Boolean);

  return (
    <FullPage>
      <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 16, padding: "32px 0" }}>

        {/* Header */}
        <div style={{ textAlign: "center" }}>
          <div style={{ color: roomColor, fontSize: "9px", fontWeight: 900, letterSpacing: "0.3em", marginBottom: 4 }}>
            {isFinalRound ? "FINAL ROUND ENDED" : `END OF ROUND ${room.currentRound}`}
          </div>
          <div style={{ color: C.text, fontSize: "22px", fontWeight: 900, letterSpacing: "0.1em" }}>
            THE PARLAY
          </div>
          <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.15em", marginTop: 6 }}>
            BOTH LEADERS MUST MEET BEFORE {isFinalRound ? "THE BOOM" : "THE NEXT ROUND"}
          </div>
        </div>

        {/* Hostage announcement (own room only) */}
        {myRoomPicks.length > 0 && (
          <div style={{ border: `1px solid ${roomColor}40`, padding: "12px 16px", background: `${roomColor}10` }}>
            <div style={{ color: roomColor, fontSize: "8px", fontWeight: 900, letterSpacing: "0.25em", marginBottom: 6 }}>
              LEAVING YOUR ROOM
            </div>
            <div style={{ color: C.text, fontSize: "13px", fontWeight: 900, letterSpacing: "0.08em" }}>
              {pickNames.join(", ")}
            </div>
            <div style={{ color: C.dim, fontSize: "8px", fontWeight: 900, letterSpacing: "0.1em", marginTop: 4 }}>
              {isFinalRound ? "AFTER THE PARLAY, THESE PLAYERS MOVE TO THE OTHER ROOM" : "PHYSICALLY WALK TO THE OTHER ROOM WHEN TOLD"}
            </div>
          </div>
        )}

        {/* Parlay status */}
        <div style={{ border: `1px solid ${C.faint}`, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ color: C.dim, fontSize: "8px", fontWeight: 900, letterSpacing: "0.2em", marginBottom: 4 }}>LEADER STATUS</div>
          <StatusRow label={`ROOM A LEADER`} ready={room.parlayReadyA} color={ROOM_COLOR.A} />
          <StatusRow label={`ROOM B LEADER`} ready={room.parlayReadyB} color={ROOM_COLOR.B} />
        </div>

        {/* Leader confirm button */}
        {amLeader && !parlayReady && (
          <TRBtn onClick={() => socket.emit("TR_PARLAY_READY")}>
            I'M READY — MET IN THE PARLAY
          </TRBtn>
        )}
        {amLeader && parlayReady && !otherReady && (
          <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", textAlign: "center" }}>
            WAITING FOR OTHER ROOM'S LEADER...
          </div>
        )}
        {!amLeader && (
          <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", textAlign: "center" }}>
            WAITING FOR BOTH LEADERS TO MEET...
          </div>
        )}
      </div>
    </FullPage>
  );
}

function StatusRow({ label, ready, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.1em" }}>{label}</span>
      <span style={{ color: ready ? "#8FAF5A" : C.faint, fontSize: "9px", fontWeight: 900, letterSpacing: "0.15em" }}>
        {ready ? "✓ READY" : "WAITING"}
      </span>
    </div>
  );
}
