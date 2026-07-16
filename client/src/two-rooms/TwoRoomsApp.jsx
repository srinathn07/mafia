import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import socket from "../socket.js";
import RoomAssignment from "./components/RoomAssignment.jsx";
import RoundScreen from "./components/RoundScreen.jsx";
import HostageSelect from "./components/HostageSelect.jsx";
import MigrationScreen from "./components/MigrationScreen.jsx";
import Boom from "./components/Boom.jsx";
import HowToPlay from "../components/HowToPlay.jsx";

// ── Palette ───────────────────────────────────────────────────────────────────
export const C = {
  bg: "#121212",
  surface: "#1A1A1A",
  surface2: "#262626",
  blue: "#3A85D4",      // Blue team / Room A
  red: "#CC4444",       // Red team / Room B
  text: "#FFFFFF",
  dim: "rgba(255,255,255,0.4)",
  faint: "rgba(255,255,255,0.12)",
};

export const ROOM_COLOR = { A: "#3A85D4", B: "#CC4444" };

// ── How to Play content ───────────────────────────────────────────────────────
const HTP_SECTIONS = [
  {
    heading: "THE TEAMS",
    items: [
      "Players are secretly split into Blue Team and Red Team (as evenly as possible).",
      "Blue Team has one PRESIDENT. Red Team has one BOMBER. All other players are plain team members.",
    ],
  },
  {
    heading: "THE ROOMS",
    items: [
      "At the start, players are randomly split between Room A and Room B.",
      "You stay in your room until you are selected as a hostage — then you physically walk to the other room.",
    ],
  },
  {
    heading: "EACH ROUND",
    items: [
      "A countdown timer runs. Players in the same room can share information with each other.",
      "COLOR SHARE — both players reveal only their team color (Blue / Red) to each other.",
      "CARD SHARE — both players reveal their full identity (team + role) to each other.",
      "Shares are private between the two participants. Both must request the same share level for it to resolve.",
    ],
  },
  {
    heading: "LEADERS",
    items: [
      "Each room needs exactly one Leader at all times.",
      "APPOINT — at Round 1 start, the first player to tap 'Appoint' next to someone's name makes them Leader.",
      "OVERTHROW — if a strict majority of players in a room point at the same person, that person becomes the new Leader instantly.",
      "ABDICATE — the Leader can hand leadership to another willing player. The abdicator cannot become Leader again this round.",
      "Leaders cannot be selected as hostages.",
    ],
  },
  {
    heading: "BETWEEN ROUNDS — THE PARLAY",
    items: [
      "When the timer hits 0, each Leader privately selects hostages (players to send to the other room).",
      "Both Leaders then meet (the Parlay) and confirm they are ready.",
      "The next round starts and the hostages physically walk to their new rooms.",
    ],
  },
  {
    heading: "WIN CONDITIONS",
    items: [
      "After the final round's migration, the game checks: are the President and Bomber in the same room?",
      "SAME ROOM → Bomb explodes. RED TEAM WINS.",
      "DIFFERENT ROOMS → President is safe. BLUE TEAM WINS.",
    ],
  },
];

// ── Session helpers ───────────────────────────────────────────────────────────
function getOrCreatePid() {
  let pid = localStorage.getItem("tr_pid");
  if (!pid) { pid = crypto.randomUUID(); localStorage.setItem("tr_pid", pid); }
  return pid;
}
function saveSession(code) { localStorage.setItem("tr_session", code); }
function clearSession() { localStorage.removeItem("tr_session"); }
function getSavedRoom() { return localStorage.getItem("tr_session") || null; }

// ── Initial room state ────────────────────────────────────────────────────────
const INITIAL_ROOM = {
  state: null,
  currentRound: 0,
  settings: { rounds: 3, playerCount: 6 },
  timerEnd: null,
  players: [],
  roomA: [], roomB: [],
  roomALeader: null, roomBLeader: null,
  pointing: {},
  hostageSubmittedA: false, hostageSubmittedB: false,
  parlayReadyA: false, parlayReadyB: false,
  lastArrivalsA: [], lastArrivalsB: [],
  winner: null, abandonedBy: null,
};

const INITIAL_PRIVATE = {
  team: null, role: null, knownPlayers: {}, myRoomPicks: null, abdicatedThisRound: false,
};

// ── Main app ──────────────────────────────────────────────────────────────────
export default function TwoRoomsApp() {
  const [room, setRoom] = useState(INITIAL_ROOM);
  const [privateInfo, setPrivateInfo] = useState(INITIAL_PRIVATE);
  const [shareState, setShareState] = useState({}); // { pid: { withPid, yourLevel } }
  const [myId, setMyId] = useState(null);
  const [joinError, setJoinError] = useState(null);
  const [reconnecting, setReconnecting] = useState(false);
  const pid = useRef(getOrCreatePid());

  useEffect(() => {
    socket.connect();

    socket.on("connect", () => {
      setMyId(socket.id);
      const saved = getSavedRoom();
      if (saved) {
        setReconnecting(true);
        socket.emit("TR_RECONNECT", { roomCode: saved, pid: pid.current });
      }
    });

    socket.on("TR_CREATED", ({ roomCode }) => {
      saveSession(roomCode);
      setRoom(r => ({ ...r, roomCode }));
    });

    socket.on("TR_ROOM_UPDATE", (payload) => {
      setReconnecting(false);
      setRoom({ ...payload });
    });

    socket.on("TR_PRIVATE_INFO", (info) => {
      setPrivateInfo(info);
    });

    socket.on("TR_JOIN_ERROR", ({ message }) => {
      setJoinError(message);
    });

    socket.on("TR_RECONNECT_FAILED", () => {
      clearSession();
      setReconnecting(false);
      setRoom(INITIAL_ROOM);
    });

    socket.on("TR_SHARE_PENDING", ({ withPid, yourLevel }) => {
      setShareState(s => ({ ...s, [withPid]: { withPid, yourLevel } }));
    });

    socket.on("TR_SHARE_RESOLVED", ({ withPid }) => {
      setShareState(s => { const n = { ...s }; delete n[withPid]; return n; });
    });

    socket.on("disconnect", () => { setReconnecting(true); });

    return () => {
      socket.off("connect");
      socket.off("TR_CREATED");
      socket.off("TR_ROOM_UPDATE");
      socket.off("TR_PRIVATE_INFO");
      socket.off("TR_JOIN_ERROR");
      socket.off("TR_RECONNECT_FAILED");
      socket.off("TR_SHARE_PENDING");
      socket.off("TR_SHARE_RESOLVED");
      socket.off("disconnect");
      socket.disconnect();
    };
  }, []);

  const handleCreate = useCallback((name) => {
    setJoinError(null);
    socket.emit("TR_CREATE", { name, pid: pid.current });
  }, []);

  const handleJoin = useCallback((code, name) => {
    setJoinError(null);
    socket.emit("TR_JOIN", { code, name, pid: pid.current });
    saveSession(code.toUpperCase());
  }, []);

  const handleGoHome = useCallback(() => {
    socket.emit("TR_LEAVE");
    clearSession();
    setRoom(INITIAL_ROOM);
    setPrivateInfo(INITIAL_PRIVATE);
    setShareState({});
    setJoinError(null);
    setReconnecting(false);
  }, []);

  const myPid = pid.current;
  const myPlayer = room.players.find(p => p.pid === myPid) || null;

  if (reconnecting) return <ReconnectingScreen onGiveUp={handleGoHome} />;

  if (!room.state) {
    return <HomeScreen onCreateRoom={handleCreate} onJoinRoom={handleJoin} joinError={joinError} />;
  }

  if (room.state === "LOBBY") {
    return <LobbyScreen room={room} myPlayer={myPlayer} socket={socket} joinError={joinError} myPid={myPid} />;
  }

  const sharedProps = { room, myPlayer, myPid, privateInfo, shareState, socket };

  let screen = null;
  switch (room.state) {
    case "ROOM_ASSIGNMENT": screen = <RoomAssignment {...sharedProps} />; break;
    case "ROUND":           screen = <RoundScreen {...sharedProps} />; break;
    case "HOSTAGE_SELECT":  screen = <HostageSelect {...sharedProps} />; break;
    case "PARLAY":          screen = <MigrationScreen {...sharedProps} />; break;
    case "BOOM":            screen = <Boom {...sharedProps} onGoHome={handleGoHome} />; break;
    default:                return null;
  }

  return (
    <>
      {screen}
      {myPlayer && room.state !== "BOOM" && (
        <PlayerOverlay myPlayer={myPlayer} privateInfo={privateInfo} onLeave={handleGoHome} />
      )}
    </>
  );
}

// ── Home screen ───────────────────────────────────────────────────────────────
function HomeScreen({ onCreateRoom, onJoinRoom, joinError }) {
  const [hostName, setHostName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [view, setView] = useState("CHOOSE");
  const [showHtp, setShowHtp] = useState(false);
  const navigate = useNavigate();

  if (view === "HOST") return (
    <FullPage>
      <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 16 }}>
        <TRLabel>YOUR NAME</TRLabel>
        <TRInput value={hostName} onChange={e => setHostName(e.target.value.toUpperCase().slice(0, 12))}
          placeholder="ENTER NAME" onKeyDown={e => e.key === "Enter" && hostName.trim() && onCreateRoom(hostName.trim())} />
        <TRBtn onClick={() => onCreateRoom(hostName.trim())} disabled={!hostName.trim()}>CREATE ROOM</TRBtn>
        <TRBtnSecondary onClick={() => setView("CHOOSE")}>BACK</TRBtnSecondary>
      </div>
    </FullPage>
  );

  if (view === "JOIN") return (
    <FullPage>
      <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 16 }}>
        <TRLabel>ROOM CODE</TRLabel>
        <TRInput value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 4))} placeholder="XXXX" maxLength={4} />
        <TRLabel>YOUR NAME</TRLabel>
        <TRInput value={joinName} onChange={e => setJoinName(e.target.value.toUpperCase().slice(0, 12))}
          placeholder="ENTER NAME" onKeyDown={e => e.key === "Enter" && joinCode.trim() && joinName.trim() && onJoinRoom(joinCode.trim(), joinName.trim())} />
        {joinError && <div style={{ color: C.red, fontSize: "10px", fontWeight: 900, letterSpacing: "0.15em" }}>{joinError}</div>}
        <TRBtn onClick={() => onJoinRoom(joinCode.trim(), joinName.trim())} disabled={!joinCode.trim() || !joinName.trim()}>JOIN ROOM</TRBtn>
        <TRBtnSecondary onClick={() => setView("CHOOSE")}>BACK</TRBtnSecondary>
      </div>
    </FullPage>
  );

  return (
    <>
      <FullPage>
        <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <BombIcon />
            <div style={{ color: C.text, fontSize: "28px", fontWeight: 900, letterSpacing: "0.08em", marginTop: 12, lineHeight: 1.1 }}>
              TWO ROOMS<br />AND A BOOM
            </div>
            <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.25em", marginTop: 6 }}>TEAM DEDUCTION</div>
            <div style={{ color: "rgba(255,255,255,0.15)", fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", marginTop: 4 }}>
              BY SNATH07 &nbsp;&bull;&nbsp; V{__APP_VERSION__}
            </div>
          </div>
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
            <TRBtn onClick={() => setView("HOST")}>CREATE ROOM</TRBtn>
            <TRBtn onClick={() => setView("JOIN")}>JOIN ROOM</TRBtn>
          </div>
          <button onClick={() => setShowHtp(true)} style={ghostBtn("rgba(58,133,212,0.45)")}>
            HOW TO PLAY
          </button>
          <button onClick={() => navigate("/")} style={ghostBtn(C.faint)}>
            ← GAMENITE HOME
          </button>
        </div>
      </FullPage>
      {showHtp && <HowToPlay sections={HTP_SECTIONS} accent={C.blue} onClose={() => setShowHtp(false)} />}
    </>
  );
}

// ── Lobby screen ──────────────────────────────────────────────────────────────
function LobbyScreen({ room, myPlayer, socket, joinError, myPid }) {
  const isHost = myPlayer?.isHost;
  const { rounds, playerCount } = room.settings;
  const connected = room.players.length;
  const canStart = connected === playerCount;
  const slotsLeft = playerCount - connected;

  const setSetting = useCallback((patch) => {
    socket.emit("TR_UPDATE_SETTINGS", patch);
  }, [socket]);

  return (
    <FullPage>
      <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", maxHeight: "100vh", padding: "32px 0" }}>
        {/* Room code */}
        <div style={{ textAlign: "center" }}>
          <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.25em", marginBottom: 4 }}>ROOM CODE</div>
          <div style={{ color: C.text, fontSize: "40px", fontWeight: 900, letterSpacing: "0.1em" }}>{room.roomCode}</div>
        </div>

        {/* Players */}
        <div style={{ border: `1px solid ${C.faint}`, padding: "12px 16px" }}>
          <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", marginBottom: 8 }}>
            PLAYERS — {connected} / {playerCount}
          </div>
          {room.players.map(p => (
            <div key={p.pid} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "11px", fontWeight: 900, letterSpacing: "0.1em", opacity: p.isBot ? 0.45 : p.connected ? 1 : 0.35 }}>
              <span>{p.name}</span>
              <span style={{ color: C.dim, fontSize: "8px" }}>
                {p.isBot ? "BOT" : p.pid === myPid ? "YOU" : p.isHost ? "HOST" : ""}
              </span>
            </div>
          ))}
          {Array.from({ length: Math.max(0, playerCount - connected) }).map((_, i) => (
            <div key={i} style={{ padding: "4px 0", color: C.faint, fontSize: "11px" }}>—</div>
          ))}
        </div>

        {/* Settings — host only */}
        {isHost && (
          <div style={{ border: `1px solid ${C.faint}`, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em" }}>SETTINGS</div>

            {/* Player count */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.12em" }}>PLAYERS</span>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <StepBtn onClick={() => setSetting({ playerCount: playerCount - 1 })} disabled={playerCount <= 6}>−</StepBtn>
                <span style={{ fontSize: "14px", fontWeight: 900, minWidth: 18, textAlign: "center" }}>{playerCount}</span>
                <StepBtn onClick={() => setSetting({ playerCount: playerCount + 1 })} disabled={playerCount >= 30}>+</StepBtn>
              </div>
            </div>

            {/* Rounds */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.12em" }}>ROUNDS</span>
              <div style={{ display: "flex", gap: 6 }}>
                {[3, 5].map(n => (
                  <button key={n} onClick={() => setSetting({ rounds: n })}
                    style={{ padding: "5px 14px", background: rounds === n ? C.blue : C.surface2, color: rounds === n ? "#fff" : C.dim, border: `1px solid ${rounds === n ? C.blue : C.faint}`, fontFamily: "inherit", fontSize: "10px", fontWeight: 900, letterSpacing: "0.1em", cursor: "pointer" }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Non-host settings view */}
        {!isHost && (
          <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", textAlign: "center" }}>
            {rounds} ROUNDS
          </div>
        )}

        {joinError && <div style={{ color: C.red, fontSize: "10px", fontWeight: 900, letterSpacing: "0.15em" }}>{joinError}</div>}

        {/* Bot fill — host only */}
        {isHost && (
          <div style={{ display: "flex", gap: 8 }}>
            {slotsLeft > 0 && (
              <button onClick={() => socket.emit("TR_FILL_BOTS")}
                style={{ flex: 1, padding: "8px", background: "transparent", border: `1px solid ${C.faint}`, color: C.dim, fontFamily: "inherit", fontSize: "9px", fontWeight: 900, letterSpacing: "0.15em", cursor: "pointer" }}>
                FILL {slotsLeft} BOT{slotsLeft > 1 ? "S" : ""}
              </button>
            )}
            {room.players.some(p => p.isBot) && (
              <button onClick={() => socket.emit("TR_REMOVE_BOTS")}
                style={{ flex: 1, padding: "8px", background: "transparent", border: `1px solid rgba(204,68,68,0.3)`, color: "rgba(204,68,68,0.5)", fontFamily: "inherit", fontSize: "9px", fontWeight: 900, letterSpacing: "0.15em", cursor: "pointer" }}>
                REMOVE BOTS
              </button>
            )}
          </div>
        )}

        {isHost ? (
          <TRBtn onClick={() => socket.emit("TR_START_GAME")} disabled={!canStart}>
            {canStart ? "START GAME" : `WAITING FOR ${slotsLeft} MORE`}
          </TRBtn>
        ) : (
          <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", textAlign: "center" }}>
            WAITING FOR HOST TO START...
          </div>
        )}
      </div>
    </FullPage>
  );
}

// ── Player overlay (in-game) ──────────────────────────────────────────────────
function PlayerOverlay({ myPlayer, privateInfo, onLeave }) {
  const teamColor = privateInfo.team === "BLUE" ? C.blue : privateInfo.team === "RED" ? C.red : "rgba(255,255,255,0.4)";
  return (
    <div style={{ position: "fixed", top: 12, right: 12, zIndex: 5000, display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ background: "rgba(0,0,0,0.65)", border: `1px solid ${teamColor}40`, color: "rgba(255,255,255,0.75)", fontFamily: "inherit", fontSize: "10px", fontWeight: 900, letterSpacing: "0.1em", padding: "5px 8px", backdropFilter: "blur(4px)" }}>
        {myPlayer.name}
        {privateInfo.team && (
          <span style={{ color: teamColor, marginLeft: 6 }}>· {privateInfo.team}</span>
        )}
      </div>
      <button onClick={onLeave} style={{ background: "rgba(0,0,0,0.65)", border: "1px solid rgba(204,68,68,0.4)", color: "rgba(204,68,68,0.65)", fontFamily: "inherit", fontSize: "9px", fontWeight: 900, letterSpacing: "0.1em", padding: "5px 7px", cursor: "pointer", backdropFilter: "blur(4px)", touchAction: "manipulation" }}>
        LEAVE
      </button>
    </div>
  );
}

// ── Reconnecting screen ───────────────────────────────────────────────────────
function ReconnectingScreen({ onGiveUp }) {
  return (
    <FullPage>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <div className="animate-pulse" style={{ width: 2, height: 2, background: C.blue }} />
        <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em" }}>RECONNECTING...</div>
        <button onClick={onGiveUp} style={{ color: C.faint, background: "none", border: "none", fontFamily: "inherit", fontSize: "9px", fontWeight: 900, letterSpacing: "0.15em", cursor: "pointer", marginTop: 24 }}>
          LEAVE GAME
        </button>
      </div>
    </FullPage>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────
export function FullPage({ children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
      {children}
    </div>
  );
}

export function TRLabel({ children }) {
  return <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em" }}>{children}</div>;
}

export function TRInput(props) {
  return (
    <input {...props} style={{ width: "100%", background: "transparent", border: `1px solid ${C.faint}`, color: C.text, fontFamily: "inherit", fontSize: "13px", fontWeight: 900, letterSpacing: "0.1em", padding: "11px 14px", outline: "none", boxSizing: "border-box", ...props.style }} />
  );
}

export function TRBtn({ children, onClick, disabled = false }) {
  return (
    <button onClick={disabled ? undefined : onClick}
      style={{ width: "100%", padding: "14px", background: disabled ? C.surface2 : C.blue, color: disabled ? C.dim : "#fff", border: `1px solid ${disabled ? C.faint : C.blue}`, fontFamily: "inherit", fontSize: "11px", fontWeight: 900, letterSpacing: "0.18em", cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.1s" }}>
      {children}
    </button>
  );
}

export function TRBtnSecondary({ children, onClick }) {
  return (
    <button onClick={onClick}
      style={{ width: "100%", padding: "12px", background: "transparent", color: C.dim, border: `1px solid ${C.faint}`, fontFamily: "inherit", fontSize: "10px", fontWeight: 900, letterSpacing: "0.15em", cursor: "pointer" }}>
      {children}
    </button>
  );
}

function StepBtn({ children, onClick, disabled }) {
  return (
    <button onClick={disabled ? undefined : onClick}
      style={{ width: 28, height: 28, background: disabled ? C.surface : C.surface2, border: `1px solid ${disabled ? C.faint : "rgba(255,255,255,0.25)"}`, color: disabled ? C.faint : C.text, fontFamily: "inherit", fontSize: "16px", fontWeight: 900, cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {children}
    </button>
  );
}

function ghostBtn(color) {
  return { background: "none", border: "none", color, fontFamily: "inherit", fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", cursor: "pointer", padding: "4px 0" };
}

function BombIcon() {
  return (
    <svg width={52} height={52} viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <rect x="2" y="10" width="17" height="24" fill="rgba(58,133,212,0.3)" stroke="#3A85D4" strokeWidth="1" />
      <rect x="25" y="10" width="17" height="24" fill="rgba(204,68,68,0.3)" stroke="#CC4444" strokeWidth="1" />
      <rect x="19" y="19" width="6" height="6" fill="#CC4444" transform="rotate(45 22 22)" />
    </svg>
  );
}
