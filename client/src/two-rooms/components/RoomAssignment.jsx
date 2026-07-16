import { C, ROOM_COLOR, FullPage, TRBtn } from "../TwoRoomsApp.jsx";

export default function RoomAssignment({ room, myPlayer, myPid, privateInfo, socket }) {
  const myRoom = myPlayer?.currentRoom;
  const isHost = myPlayer?.isHost;
  const roomColor = myRoom ? ROOM_COLOR[myRoom] : C.dim;

  const roomALeaderPlayer = room.players.find(p => p.pid === room.roomALeader);
  const roomBLeaderPlayer = room.players.find(p => p.pid === room.roomBLeader);
  const myRoomLeader = myRoom === "A" ? room.roomALeader : room.roomBLeader;
  const myRoomPlayers = room.players.filter(p => p.currentRoom === myRoom);

  const canAppoint = !myRoomLeader; // no leader yet in my room

  const teamColor = privateInfo.team === "BLUE" ? C.blue : C.red;
  const roleLabel = privateInfo.role === "PRESIDENT"
    ? "PRESIDENT" : privateInfo.role === "BOMBER"
    ? "BOMBER" : null;

  return (
    <FullPage>
      <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 16, padding: "32px 0", overflowY: "auto", maxHeight: "100vh" }}>

        {/* Room banner */}
        <div style={{ padding: "16px", border: `2px solid ${roomColor}`, background: `${roomColor}18`, textAlign: "center" }}>
          <div style={{ color: roomColor, fontSize: "9px", fontWeight: 900, letterSpacing: "0.3em", marginBottom: 4 }}>YOU ARE IN</div>
          <div style={{ color: C.text, fontSize: "32px", fontWeight: 900, letterSpacing: "0.12em" }}>ROOM {myRoom}</div>
        </div>

        {/* Role card */}
        <div style={{ border: `1px solid ${C.faint}`, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em" }}>YOUR IDENTITY</div>
          <div style={{ color: teamColor, fontSize: "22px", fontWeight: 900, letterSpacing: "0.1em" }}>
            {privateInfo.team ?? "—"} TEAM
          </div>
          {roleLabel && (
            <div style={{ color: teamColor, fontSize: "11px", fontWeight: 900, letterSpacing: "0.2em", opacity: 0.8 }}>
              ★ {roleLabel}
            </div>
          )}
        </div>

        {/* Players in my room + leader election */}
        <div style={{ border: `1px solid ${C.faint}`, padding: "12px 16px" }}>
          <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", marginBottom: 8 }}>
            YOUR ROOM — {myRoomPlayers.length} PLAYERS
          </div>
          {myRoomPlayers.map(p => {
            const isLeader = p.pid === myRoomLeader;
            const isMe = p.pid === myPid;
            const canAppointThis = canAppoint && !isMe;
            return (
              <div key={p.pid} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${C.faint}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.08em", opacity: p.connected ? 1 : 0.35 }}>{p.name}</span>
                  {isLeader && <span style={{ color: roomColor, fontSize: "7px", fontWeight: 900, letterSpacing: "0.2em" }}>LEADER</span>}
                  {isMe && <span style={{ color: C.dim, fontSize: "7px", fontWeight: 900, letterSpacing: "0.2em" }}>YOU</span>}
                </div>
                {canAppointThis && (
                  <button onClick={() => socket.emit("TR_APPOINT_LEADER", { targetPid: p.pid })}
                    style={{ background: "transparent", border: `1px solid ${roomColor}60`, color: roomColor, fontFamily: "inherit", fontSize: "8px", fontWeight: 900, letterSpacing: "0.15em", padding: "3px 8px", cursor: "pointer" }}>
                    APPOINT
                  </button>
                )}
              </div>
            );
          })}
          {!myRoomLeader && (
            <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.15em", marginTop: 8 }}>
              TAP APPOINT TO ELECT YOUR ROOM'S LEADER
            </div>
          )}
        </div>

        {/* Other room summary */}
        <div style={{ border: `1px solid ${C.faint}`, padding: "10px 14px" }}>
          <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", marginBottom: 6 }}>
            OTHER ROOM — {room.players.filter(p => p.currentRoom !== myRoom).length} PLAYERS
          </div>
          <div style={{ color: C.faint, fontSize: "9px", letterSpacing: "0.1em" }}>
            {myRoom === "A"
              ? `ROOM B LEADER: ${roomBLeaderPlayer?.name ?? "NOT YET ELECTED"}`
              : `ROOM A LEADER: ${roomALeaderPlayer?.name ?? "NOT YET ELECTED"}`}
          </div>
        </div>

        {/* Host start button */}
        {isHost && (
          <TRBtn onClick={() => socket.emit("TR_START_ROUND_ONE")}>
            START ROUND 1
          </TRBtn>
        )}
        {!isHost && (
          <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", textAlign: "center" }}>
            WAITING FOR HOST TO START ROUND 1...
          </div>
        )}
      </div>
    </FullPage>
  );
}
