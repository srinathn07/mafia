import { useState, useEffect } from "react";
import { C, ROOM_COLOR, FullPage } from "../TwoRoomsApp.jsx";

// ── Timer display ─────────────────────────────────────────────────────────────
function useTimer(timerEnd) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    function tick() {
      const ms = Math.max(0, (timerEnd || 0) - Date.now());
      setRemaining(ms);
    }
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [timerEnd]);
  return remaining;
}

function TimerDisplay({ timerEnd }) {
  const ms = useTimer(timerEnd);
  const totalSec = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const display = `${mins}:${String(secs).padStart(2, "0")}`;
  const urgent = totalSec <= 30 && totalSec > 0;
  return (
    <div style={{
      fontFamily: "'Courier New', Courier, monospace",
      fontSize: "64px",
      fontWeight: 900,
      letterSpacing: "0.06em",
      fontVariantNumeric: "tabular-nums",
      color: urgent ? "#CC4444" : "#FFFFFF",
      lineHeight: 1,
      textAlign: "center",
      transition: "color 0.3s",
    }}>
      {display}
    </div>
  );
}

// ── Share modal ───────────────────────────────────────────────────────────────
function ShareModal({ targetPlayer, shareState, myPid, socket, onClose }) {
  const withPid = targetPlayer.pid;
  const pending = shareState[withPid];
  const yourLevel = pending?.yourLevel;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.faint}`, width: "100%", maxWidth: 320, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.25em" }}>SHARE WITH {targetPlayer.name}</div>

        {!pending ? (
          <>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "10px", letterSpacing: "0.08em", lineHeight: 1.6 }}>
              Choose what to share. Both players must request the same level for it to resolve.
            </div>
            <ShareBtn label="COLOR SHARE" sub="Reveal team color only" onClick={() => socket.emit("TR_REQUEST_SHARE", { targetPid: withPid, level: "COLOR" })} color={C.blue} />
            <ShareBtn label="CARD SHARE" sub="Reveal full identity (team + role)" onClick={() => socket.emit("TR_REQUEST_SHARE", { targetPid: withPid, level: "CARD" })} color="#8FAF5A" />
          </>
        ) : (
          <>
            <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.15em" }}>
              {yourLevel ? `YOU REQUESTED: ${yourLevel} SHARE` : `${targetPlayer.name} HAS REQUESTED A SHARE`}
            </div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "10px", letterSpacing: "0.06em", lineHeight: 1.6 }}>
              {yourLevel
                ? `Waiting for ${targetPlayer.name} to request the same level...`
                : `Request the same level to accept, or a different level to counter.`}
            </div>
            {!yourLevel && (
              <>
                <ShareBtn label={`ACCEPT: ${pending.level ?? "?"} SHARE`} onClick={() => socket.emit("TR_REQUEST_SHARE", { targetPid: withPid, level: pending.level })} color={C.blue} />
                <ShareBtn label="COUNTER: COLOR SHARE" onClick={() => socket.emit("TR_REQUEST_SHARE", { targetPid: withPid, level: "COLOR" })} color={C.dim} />
                <ShareBtn label="COUNTER: CARD SHARE" onClick={() => socket.emit("TR_REQUEST_SHARE", { targetPid: withPid, level: "CARD" })} color={C.dim} />
              </>
            )}
            <button onClick={() => { socket.emit("TR_CANCEL_SHARE", { targetPid: withPid }); onClose(); }}
              style={{ background: "transparent", border: `1px solid ${C.faint}`, color: C.dim, fontFamily: "inherit", fontSize: "9px", fontWeight: 900, letterSpacing: "0.15em", padding: "8px", cursor: "pointer" }}>
              CANCEL
            </button>
          </>
        )}

        <button onClick={onClose}
          style={{ background: "transparent", border: "none", color: C.faint, fontFamily: "inherit", fontSize: "9px", fontWeight: 900, letterSpacing: "0.15em", cursor: "pointer", padding: "4px 0" }}>
          CLOSE
        </button>
      </div>
    </div>
  );
}

function ShareBtn({ label, sub, onClick, color }) {
  return (
    <button onClick={onClick} style={{ width: "100%", padding: "10px 14px", background: `${color}18`, border: `1px solid ${color}60`, color, fontFamily: "inherit", fontSize: "10px", fontWeight: 900, letterSpacing: "0.15em", cursor: "pointer", textAlign: "left" }}>
      {label}
      {sub && <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "8px", fontWeight: 900, letterSpacing: "0.1em", marginTop: 3 }}>{sub}</div>}
    </button>
  );
}

// ── Main round screen ─────────────────────────────────────────────────────────
export default function RoundScreen({ room, myPlayer, myPid, privateInfo, shareState, socket }) {
  const [shareTarget, setShareTarget] = useState(null); // player object
  const [abdicateMode, setAbdicateMode] = useState(false);

  const myRoom = myPlayer?.currentRoom;
  const roomColor = myRoom ? ROOM_COLOR[myRoom] : C.dim;
  const myRoomPlayers = room.players.filter(p => p.currentRoom === myRoom);
  const myRoomLeader = myRoom === "A" ? room.roomALeader : room.roomBLeader;
  const amLeader = myRoomLeader === myPid;

  const teamColor = privateInfo.team === "BLUE" ? C.blue : C.red;

  // Migration banner: show arrivals at start of round 2+
  const arrivals = myRoom === "A" ? room.lastArrivalsA : room.lastArrivalsB;
  const arrivalNames = arrivals
    .map(pid => room.players.find(p => p.pid === pid)?.name)
    .filter(Boolean);

  // Overthrow: am I currently pointing?
  const myTarget = room.pointing[myPid] ?? null;

  return (
    <FullPage>
      <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", maxHeight: "100vh", padding: "24px 0 80px" }}>

        {/* Round + room header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.25em" }}>
            ROUND {room.currentRound} / {room.settings.rounds}
          </div>
          <div style={{ color: roomColor, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", border: `1px solid ${roomColor}60`, padding: "3px 8px" }}>
            ROOM {myRoom}
          </div>
        </div>

        {/* Timer — centerpiece */}
        <div style={{ padding: "20px 0 12px", textAlign: "center" }}>
          <TimerDisplay timerEnd={room.timerEnd} />
          <div style={{ color: C.dim, fontSize: "8px", fontWeight: 900, letterSpacing: "0.25em", marginTop: 8 }}>
            ROUND TIMER
          </div>
        </div>

        {/* Migration banner */}
        {arrivalNames.length > 0 && (
          <div style={{ background: `${roomColor}18`, border: `1px solid ${roomColor}60`, padding: "8px 12px" }}>
            <div style={{ color: roomColor, fontSize: "8px", fontWeight: 900, letterSpacing: "0.2em", marginBottom: 4 }}>
              ARRIVED FROM OTHER ROOM
            </div>
            <div style={{ color: C.text, fontSize: "11px", fontWeight: 900, letterSpacing: "0.08em" }}>
              {arrivalNames.join(", ")}
            </div>
          </div>
        )}

        {/* Players in room */}
        <div style={{ border: `1px solid ${C.faint}` }}>
          <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.faint}`, color: C.dim, fontSize: "8px", fontWeight: 900, letterSpacing: "0.2em" }}>
            YOUR ROOM — {myRoomPlayers.length} PLAYERS
          </div>
          {myRoomPlayers.map(p => {
            const isLeader = p.pid === myRoomLeader;
            const isMe = p.pid === myPid;
            const pointing = room.pointing[myPid] === p.pid;
            // Count how many players in my room are pointing at this player
            const pointsAtP = myRoomPlayers.filter(r => room.pointing[r.pid] === p.pid).length;
            const known = privateInfo.knownPlayers?.[p.pid];

            return (
              <div key={p.pid} style={{ padding: "8px 14px", borderBottom: `1px solid ${C.faint}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.08em", opacity: p.connected ? 1 : 0.4 }}>{p.name}</span>
                    {isLeader && <span style={{ color: roomColor, fontSize: "7px", fontWeight: 900, letterSpacing: "0.15em" }}>LEADER</span>}
                    {isMe && <span style={{ color: C.dim, fontSize: "7px", letterSpacing: "0.1em" }}>YOU</span>}
                    {pointsAtP > 0 && (
                      <span style={{ color: "#CC4444", fontSize: "7px", fontWeight: 900, letterSpacing: "0.1em" }}>▲{pointsAtP}</span>
                    )}
                  </div>
                  {known && (
                    <div style={{ fontSize: "8px", color: known.team === "BLUE" ? C.blue : C.red, fontWeight: 900, letterSpacing: "0.1em" }}>
                      {known.team}{known.role ? ` · ${known.role}` : ""}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 6 }}>
                  {/* Abdication target */}
                  {abdicateMode && amLeader && !isMe && (
                    <ActionBtn onClick={() => { socket.emit("TR_ABDICATE", { targetPid: p.pid }); setAbdicateMode(false); }} color="#8FAF5A" label="HAND OFF" />
                  )}
                  {/* Appoint (if no leader yet) */}
                  {!myRoomLeader && !isMe && (
                    <ActionBtn onClick={() => socket.emit("TR_APPOINT_LEADER", { targetPid: p.pid })} color={roomColor} label="APPOINT" />
                  )}
                  {/* Point (overthrow) */}
                  {myRoomLeader && !isMe && !abdicateMode && (
                    <ActionBtn
                      onClick={() => socket.emit("TR_POINT", { targetPid: p.pid })}
                      color={pointing ? "#CC4444" : C.dim}
                      label={pointing ? "POINTED" : "POINT"}
                    />
                  )}
                  {/* Share */}
                  {!isMe && !abdicateMode && (
                    <ActionBtn onClick={() => setShareTarget(p)} color={C.blue} label="SHARE" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Leader controls */}
        {amLeader && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setAbdicateMode(a => !a)}
              style={{ flex: 1, padding: "8px", background: abdicateMode ? "#8FAF5A18" : "transparent", border: `1px solid ${abdicateMode ? "#8FAF5A" : C.faint}`, color: abdicateMode ? "#8FAF5A" : C.dim, fontFamily: "inherit", fontSize: "8px", fontWeight: 900, letterSpacing: "0.15em", cursor: "pointer" }}>
              {abdicateMode ? "CANCEL ABDICATION" : "ABDICATE"}
            </button>
          </div>
        )}

        {/* Role reminder */}
        <div style={{ border: `1px solid ${C.faint}`, padding: "8px 14px", display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ color: teamColor, fontSize: "11px", fontWeight: 900, letterSpacing: "0.1em" }}>
            {privateInfo.team} TEAM
            {privateInfo.role && <span style={{ opacity: 0.7 }}> · {privateInfo.role}</span>}
          </div>
        </div>
      </div>

      {shareTarget && (
        <ShareModal
          targetPlayer={shareTarget}
          shareState={shareState}
          myPid={myPid}
          socket={socket}
          onClose={() => setShareTarget(null)}
        />
      )}
    </FullPage>
  );
}

function ActionBtn({ label, onClick, color }) {
  return (
    <button onClick={onClick}
      style={{ background: "transparent", border: `1px solid ${color}60`, color, fontFamily: "inherit", fontSize: "7px", fontWeight: 900, letterSpacing: "0.12em", padding: "3px 7px", cursor: "pointer", whiteSpace: "nowrap" }}>
      {label}
    </button>
  );
}
