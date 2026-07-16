import { C, ROOM_COLOR, FullPage, TRBtn } from "../TwoRoomsApp.jsx";

export default function Boom({ room, myPlayer, myPid, privateInfo, socket, onGoHome }) {
  const isHost = myPlayer?.isHost;

  if (room.winner === "ABANDONED") {
    return (
      <FullPage>
        <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 16, alignItems: "center", textAlign: "center" }}>
          <div style={{ color: C.dim, fontSize: "28px", fontWeight: 900, letterSpacing: "0.1em" }}>GAME ENDED</div>
          <div style={{ color: C.faint, fontSize: "10px", fontWeight: 900, letterSpacing: "0.2em" }}>
            {room.abandonedBy} LEFT THE GAME
          </div>
          {isHost && <TRBtn onClick={() => socket.emit("TR_PLAY_AGAIN")}>RETURN TO LOBBY</TRBtn>}
          {!isHost && <div style={{ color: C.faint, fontSize: "9px", fontWeight: 900, letterSpacing: "0.15em" }}>WAITING FOR HOST TO RESTART...</div>}
          <button onClick={onGoHome} style={{ background: "none", border: "none", color: C.faint, fontFamily: "inherit", fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", cursor: "pointer" }}>
            ← LEAVE GAME
          </button>
        </div>
      </FullPage>
    );
  }

  const blueWon = room.winner === "BLUE";
  const winColor = blueWon ? C.blue : C.red;
  const winLabel = blueWon ? "BLUE TEAM WINS" : "RED TEAM WINS";
  const winDesc = blueWon ? "PRESIDENT SURVIVED" : "BOMB EXPLODED";

  // Sort players: Room A first, then Room B; within room sort by team
  const sortedPlayers = [...room.players].sort((a, b) => {
    if (a.currentRoom !== b.currentRoom) return a.currentRoom < b.currentRoom ? -1 : 1;
    // Within room: Blue first
    return 0;
  });

  return (
    <FullPage>
      <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", maxHeight: "100vh", padding: "32px 0" }}>

        {/* Winner banner */}
        <div style={{ padding: "18px", border: `2px solid ${winColor}`, background: `${winColor}18`, textAlign: "center" }}>
          <div style={{ color: winColor, fontSize: "9px", fontWeight: 900, letterSpacing: "0.35em", marginBottom: 4 }}>
            {winLabel}
          </div>
          <div style={{ color: C.text, fontSize: "26px", fontWeight: 900, letterSpacing: "0.1em" }}>
            {winDesc}
          </div>
        </div>

        {/* Final room breakdown */}
        {["A", "B"].map(roomKey => {
          const roomPlayers = sortedPlayers.filter(p => p.currentRoom === roomKey);
          const rc = ROOM_COLOR[roomKey];
          const hasPresident = roomPlayers.some(p => p.role === "PRESIDENT");
          const hasBomber = roomPlayers.some(p => p.role === "BOMBER");
          const exploded = hasPresident && hasBomber;
          return (
            <div key={roomKey} style={{ border: `1px solid ${rc}40`, padding: "12px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ color: rc, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em" }}>
                  ROOM {roomKey}
                </div>
                {exploded && (
                  <div style={{ color: C.red, fontSize: "8px", fontWeight: 900, letterSpacing: "0.15em" }}>💥 BOOM</div>
                )}
              </div>
              {roomPlayers.map(p => {
                const teamColor = p.team === "BLUE" ? C.blue : C.red;
                const isSpecial = p.role === "PRESIDENT" || p.role === "BOMBER";
                return (
                  <div key={p.pid} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${C.faint}` }}>
                    <span style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.08em" }}>{p.name}</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ color: teamColor, fontSize: "8px", fontWeight: 900, letterSpacing: "0.12em" }}>{p.team}</span>
                      {isSpecial && (
                        <span style={{ color: teamColor, fontSize: "8px", fontWeight: 900, letterSpacing: "0.12em", border: `1px solid ${teamColor}60`, padding: "1px 5px" }}>
                          {p.role}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Controls */}
        {isHost ? (
          <TRBtn onClick={() => socket.emit("TR_PLAY_AGAIN")}>PLAY AGAIN</TRBtn>
        ) : (
          <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", textAlign: "center" }}>
            WAITING FOR HOST TO RESTART...
          </div>
        )}
        <button onClick={onGoHome} style={{ background: "none", border: "none", color: C.faint, fontFamily: "inherit", fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", cursor: "pointer", padding: "4px 0" }}>
          ← LEAVE GAME
        </button>
      </div>
    </FullPage>
  );
}
