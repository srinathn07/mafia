import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import socket from "../socket.js";
import { GRIDS, GRID_KEYS } from "./data/grids.js";
import RoleReveal from "./components/RoleReveal.jsx";
import ClueRound from "./components/ClueRound.jsx";
import Debate from "./components/Debate.jsx";
import Vote from "./components/Vote.jsx";
import Reveal from "./components/Reveal.jsx";

// ── Palette ───────────────────────────────────────────────────────────────────
export const C = {
  bg: "#121212",
  surface: "#1A1A1A",
  surface2: "#262626",
  olive: "#8FAF5A",    // primary accent — crew / grid highlight
  amber: "#D4A017",   // CTA accent — submit, vote
  red: "#CC3333",     // error / danger
  text: "#FFFFFF",
  dim: "rgba(255,255,255,0.4)",
  faint: "rgba(255,255,255,0.15)",
};

// ── Persistent player ID ──────────────────────────────────────────────────────
function getOrCreatePid() {
  let pid = localStorage.getItem("chameleon_pid");
  if (!pid) { pid = crypto.randomUUID(); localStorage.setItem("chameleon_pid", pid); }
  return pid;
}
function saveSession(code) { localStorage.setItem("chameleon_session", code); }
function clearSession() { localStorage.removeItem("chameleon_session"); }
function getSavedRoom() { return localStorage.getItem("chameleon_session") || null; }

// ── Initial room state ────────────────────────────────────────────────────────
const INITIAL_ROOM = {
  roomCode: null, phase: null,
  players: [],
  settings: { playerCount: 5, gridKey: "fastFood", hintsEnabled: false },
  gridRows: [], turnOrder: [], currentTurnIdx: 0,
  clues: {}, clueOrder: [],
  voteCount: 0, votes: {}, tiedPlayerIds: [],
  revealedPlayerId: null, chameleonId: null,
  secretCoord: null, chameleonGuess: null, winner: null, abandonedBy: null,
  debateEndTime: null,
};

const INITIAL_PRIVATE = { isChameleon: false, secretCoord: null, rowHint: null };

// ── Main app ──────────────────────────────────────────────────────────────────
export default function ChameleonApp() {
  const [room, setRoom] = useState(INITIAL_ROOM);
  const [privateInfo, setPrivateInfo] = useState(INITIAL_PRIVATE);
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
        socket.emit("CHAMELEON_RECONNECT", { pid: pid.current, roomCode: saved });
      }
    });

    socket.on("CHAMELEON_ROOM_CREATED", ({ roomCode }) => {
      saveSession(roomCode);
      setRoom((r) => ({ ...r, roomCode }));
    });

    socket.on("CHAMELEON_ROOM_UPDATE", (payload) => {
      setReconnecting(false);
      setRoom({ ...payload });
    });

    socket.on("CHAMELEON_PRIVATE_INFO", (info) => {
      setPrivateInfo(info);
    });

    socket.on("CHAMELEON_JOIN_ERROR", ({ message }) => {
      setJoinError(message);
    });

    socket.on("CHAMELEON_RECONNECT_FAILED", () => {
      clearSession();
      setReconnecting(false);
      setRoom(INITIAL_ROOM);
    });

    socket.on("disconnect", () => { setReconnecting(true); });

    return () => {
      socket.off("connect");
      socket.off("CHAMELEON_ROOM_CREATED");
      socket.off("CHAMELEON_ROOM_UPDATE");
      socket.off("CHAMELEON_PRIVATE_INFO");
      socket.off("CHAMELEON_JOIN_ERROR");
      socket.off("CHAMELEON_RECONNECT_FAILED");
      socket.off("disconnect");
      socket.disconnect();
    };
  }, []);

  const handleCreateRoom = useCallback((name) => {
    setJoinError(null);
    socket.emit("CHAMELEON_CREATE_ROOM", { name, pid: pid.current });
  }, []);

  const handleJoinRoom = useCallback((code, name) => {
    setJoinError(null);
    socket.emit("CHAMELEON_JOIN_ROOM", { code, name, pid: pid.current });
    saveSession(code.toUpperCase());
  }, []);

  const handleGoHome = useCallback(() => {
    socket.emit("CHAMELEON_LEAVE");
    clearSession();
    setRoom(INITIAL_ROOM);
    setPrivateInfo(INITIAL_PRIVATE);
    setJoinError(null);
    setReconnecting(false);
  }, []);

  const myPlayer = room.players.find((p) => p.id === myId) || null;

  if (reconnecting) return <ReconnectingScreen onGiveUp={handleGoHome} />;

  if (!room.phase) {
    return <HomeScreen onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} joinError={joinError} />;
  }

  if (room.phase === "LOBBY") {
    return <Lobby room={room} myPlayer={myPlayer} socket={socket} joinError={joinError} />;
  }

  const props = { room, myPlayer, myId, privateInfo, socket };

  let screen = null;
  switch (room.phase) {
    case "ROLE_REVEAL":     screen = <RoleReveal {...props} />; break;
    case "CLUE_ROUND":      screen = <ClueRound {...props} />; break;
    case "DEBATE":          screen = <Debate {...props} />; break;
    case "VOTE":
    case "TIE_BREAK":       screen = <Vote {...props} />; break;
    case "CHAMELEON_GUESS":
    case "REVEAL":          screen = <Reveal {...props} onGoHome={handleGoHome} />; break;
    default:                return null;
  }

  return (
    <>
      {screen}
      {myPlayer && <ChameleonPlayerOverlay myPlayer={myPlayer} onLeave={handleGoHome} />}
    </>
  );
}

// ── Home screen ───────────────────────────────────────────────────────────────
function HomeScreen({ onCreateRoom, onJoinRoom, joinError }) {
  const [hostName, setHostName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [view, setView] = useState("CHOOSE");
  const navigate = useNavigate();

  if (view === "HOST") return (
    <FullPage>
      <div className="w-full max-w-sm flex flex-col gap-4">
        <CLabel>YOUR NAME</CLabel>
        <CInput value={hostName} onChange={(e) => setHostName(e.target.value.toUpperCase().slice(0, 12))}
          placeholder="ENTER NAME" onKeyDown={(e) => e.key === "Enter" && hostName.trim() && onCreateRoom(hostName.trim())} />
        <CBtn onClick={() => onCreateRoom(hostName.trim())} disabled={!hostName.trim()}>CREATE ROOM</CBtn>
        <CBtnSecondary onClick={() => setView("CHOOSE")}>BACK</CBtnSecondary>
      </div>
    </FullPage>
  );

  if (view === "JOIN") return (
    <FullPage>
      <div className="w-full max-w-sm flex flex-col gap-4">
        <CLabel>ROOM CODE</CLabel>
        <CInput value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 4))} placeholder="XXXX" maxLength={4} />
        <CLabel>YOUR NAME</CLabel>
        <CInput value={joinName} onChange={(e) => setJoinName(e.target.value.toUpperCase().slice(0, 12))}
          placeholder="ENTER NAME" onKeyDown={(e) => e.key === "Enter" && joinCode.trim() && joinName.trim() && onJoinRoom(joinCode.trim(), joinName.trim())} />
        {joinError && <CError>{joinError}</CError>}
        <CBtn onClick={() => onJoinRoom(joinCode.trim(), joinName.trim())} disabled={!joinCode.trim() || !joinName.trim()}>JOIN ROOM</CBtn>
        <CBtnSecondary onClick={() => setView("CHOOSE")}>BACK</CBtnSecondary>
      </div>
    </FullPage>
  );

  return (
    <FullPage>
      <div className="w-full max-w-sm flex flex-col gap-6 items-center">
        <div className="text-center mb-4">
          <div className="flex justify-center mb-3"><GridIcon size={64} /></div>
          <div className="text-5xl font-black tracking-widest text-white mb-1">CHAMELEON</div>
          <div className="text-xs tracking-widest opacity-40" style={{ color: C.text }}>BLUFFING WORD GAME</div>
          <div className="text-xs tracking-widest opacity-20 mt-2" style={{ color: C.text }}>BY SNATH07 &nbsp;&bull;&nbsp; V{__APP_VERSION__}</div>
        </div>
        <CBtn onClick={() => setView("HOST")}>CREATE ROOM</CBtn>
        <CBtn onClick={() => setView("JOIN")}>JOIN ROOM</CBtn>
        <button onClick={() => navigate("/")} style={{ background: "none", border: "none", color: C.faint, fontFamily: "inherit", fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", cursor: "pointer", padding: "8px 0 0" }}>
          ← GAMENITE HOME
        </button>
      </div>
    </FullPage>
  );
}

// ── Lobby ─────────────────────────────────────────────────────────────────────
function Lobby({ room, myPlayer, socket, joinError }) {
  const isHost = myPlayer?.isHost;
  const { playerCount, gridKey, hintsEnabled } = room.settings;
  const connected = room.players.length;
  const canStart = connected === playerCount;

  const setSetting = useCallback((patch) => {
    socket.emit("CHAMELEON_UPDATE_SETTINGS", patch);
  }, [socket]);

  return (
    <FullPage>
      <div className="w-full max-w-sm flex flex-col gap-5">
        {/* Room code */}
        <div className="text-center">
          <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.25em", marginBottom: 4 }}>ROOM CODE</div>
          <div className="text-4xl font-black tracking-widest">{room.roomCode}</div>
        </div>

        {/* Player list */}
        <div style={{ border: `1px solid ${C.faint}`, padding: "12px 16px" }}>
          <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", marginBottom: 8 }}>
            PLAYERS — {connected} / {playerCount}
          </div>
          {room.players.map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: "11px", fontWeight: 900, letterSpacing: "0.1em", opacity: p.connected ? 1 : 0.35 }}>
              <span>{p.name}</span>
              {p.isHost && <span style={{ color: C.olive, fontSize: "8px" }}>HOST</span>}
            </div>
          ))}
          {Array.from({ length: Math.max(0, playerCount - connected) }).map((_, i) => (
            <div key={`empty-${i}`} style={{ padding: "4px 0", fontSize: "11px", letterSpacing: "0.1em", color: C.faint }}>—</div>
          ))}
        </div>

        {/* Settings — host only */}
        {isHost && (
          <div style={{ border: `1px solid ${C.faint}`, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em" }}>SETTINGS</div>

            {/* Player count */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.15em" }}>PLAYERS</span>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={() => setSetting({ playerCount: playerCount - 1 })} disabled={playerCount <= 3}
                  style={stepBtn(playerCount <= 3)}>−</button>
                <span style={{ fontSize: "14px", fontWeight: 900, minWidth: 16, textAlign: "center" }}>{playerCount}</span>
                <button onClick={() => setSetting({ playerCount: playerCount + 1 })} disabled={playerCount >= 8}
                  style={stepBtn(playerCount >= 8)}>+</button>
              </div>
            </div>

            {/* Grid selector */}
            <div>
              <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.15em", marginBottom: 8 }}>GRID</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {GRID_KEYS.map((key) => (
                  <button key={key} onClick={() => setSetting({ gridKey: key })}
                    style={{ background: gridKey === key ? C.olive : C.surface2, color: gridKey === key ? "#000" : C.text, border: `1px solid ${gridKey === key ? C.olive : C.faint}`, padding: "7px 10px", fontSize: "9px", fontWeight: 900, letterSpacing: "0.15em", fontFamily: "inherit", cursor: "pointer", textAlign: "left" }}>
                    {GRIDS[key].name.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Hints toggle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "10px", fontWeight: 900, letterSpacing: "0.15em" }}>SMART HINTS</div>
                <div style={{ fontSize: "8px", color: C.dim, letterSpacing: "0.1em", marginTop: 2 }}>CHAMELEON GETS A CATEGORY HINT</div>
              </div>
              <button onClick={() => setSetting({ hintsEnabled: !hintsEnabled })}
                style={{ background: hintsEnabled ? C.olive : C.surface2, color: hintsEnabled ? "#000" : C.dim, border: `1px solid ${hintsEnabled ? C.olive : C.faint}`, padding: "6px 12px", fontSize: "9px", fontWeight: 900, letterSpacing: "0.15em", fontFamily: "inherit", cursor: "pointer" }}>
                {hintsEnabled ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        )}

        {/* Non-host settings view */}
        {!isHost && (
          <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", textAlign: "center" }}>
            GRID: {GRIDS[gridKey]?.name.toUpperCase() || gridKey} &nbsp;·&nbsp; HINTS: {hintsEnabled ? "ON" : "OFF"}
          </div>
        )}

        {joinError && <CError>{joinError}</CError>}

        {/* Bot fill — host only */}
        {isHost && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => socket.emit("CHAMELEON_FILL_BOTS")} disabled={connected >= playerCount}
              style={{ flex: 1, padding: "7px", background: C.surface2, border: `1px solid ${C.faint}`, color: connected >= playerCount ? C.faint : C.dim, fontFamily: "inherit", fontSize: "9px", fontWeight: 900, letterSpacing: "0.15em", cursor: connected >= playerCount ? "not-allowed" : "pointer" }}>
              FILL BOTS
            </button>
            <button onClick={() => socket.emit("CHAMELEON_REMOVE_BOTS")} disabled={!room.players.some(p => p.isBot)}
              style={{ flex: 1, padding: "7px", background: C.surface2, border: `1px solid ${C.faint}`, color: !room.players.some(p => p.isBot) ? C.faint : C.dim, fontFamily: "inherit", fontSize: "9px", fontWeight: 900, letterSpacing: "0.15em", cursor: !room.players.some(p => p.isBot) ? "not-allowed" : "pointer" }}>
              REMOVE BOTS
            </button>
          </div>
        )}

        {isHost && (
          <CBtn onClick={() => socket.emit("CHAMELEON_START_GAME")} disabled={!canStart}>
            {canStart ? "START GAME" : `WAITING FOR ${playerCount - connected} MORE`}
          </CBtn>
        )}
        {!isHost && <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", textAlign: "center" }}>WAITING FOR HOST TO START...</div>}
      </div>
    </FullPage>
  );
}

function stepBtn(disabled) {
  return {
    width: 28, height: 28, background: disabled ? C.surface : C.surface2,
    border: `1px solid ${disabled ? C.faint : "rgba(255,255,255,0.3)"}`,
    color: disabled ? C.faint : C.text, fontFamily: "inherit", fontSize: "16px",
    fontWeight: 900, cursor: disabled ? "not-allowed" : "pointer", display: "flex",
    alignItems: "center", justifyContent: "center",
  };
}

function ReconnectingScreen({ onGiveUp }) {
  return (
    <FullPage>
      <div className="flex flex-col items-center gap-6">
        <div className="animate-pulse" style={{ width: 2, height: 2, background: C.olive }} />
        <div className="text-xs font-black tracking-widest" style={{ color: C.dim }}>RECONNECTING...</div>
        <button onClick={onGiveUp} className="text-xs tracking-widest mt-8" style={{ color: C.faint, background: "none", border: "none" }}>LEAVE GAME</button>
      </div>
    </FullPage>
  );
}

// ── In-game player overlay ────────────────────────────────────────────────────
function ChameleonPlayerOverlay({ myPlayer, onLeave }) {
  return (
    <div style={{ position: "fixed", top: 12, right: 12, zIndex: 5000, display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ background: "rgba(0,0,0,0.6)", border: `1px solid ${C.faint}`, color: "rgba(255,255,255,0.7)", fontFamily: "inherit", fontSize: "10px", fontWeight: 900, letterSpacing: "0.1em", padding: "5px 8px", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}>
        {myPlayer.name}
      </div>
      <button onClick={onLeave} style={{ background: "rgba(0,0,0,0.6)", border: `1px solid rgba(212,160,23,0.4)`, color: "rgba(212,160,23,0.6)", fontFamily: "inherit", fontSize: "9px", fontWeight: 900, letterSpacing: "0.1em", padding: "5px 7px", cursor: "pointer", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", touchAction: "manipulation" }}>
        LEAVE
      </button>
    </div>
  );
}

// ── Grid icon (used on home screen) ──────────────────────────────────────────
export function GridIcon({ size = 44 }) {
  const highlight = { r: 1, c: 1 }; // B2
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" aria-hidden="true">
      {[0, 1, 2, 3].map((r) =>
        [0, 1, 2, 3].map((c) => (
          <rect key={`${r}-${c}`} x={3 + c * 10} y={3 + r * 10} width={8} height={8}
            fill={r === highlight.r && c === highlight.c ? C.olive : "rgba(255,255,255,0.18)"} />
        ))
      )}
    </svg>
  );
}

// ── Topic grid ────────────────────────────────────────────────────────────────
export function TopicGrid({ rows, highlightCoord = null, onCellSelect = null }) {
  const ROW_LABELS = ["A", "B", "C", "D"];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "2px", width: "100%" }}>
      {rows.map((row, ri) =>
        row.map((word, ci) => {
          const coord = `${ROW_LABELS[ri]}${ci + 1}`;
          const highlighted = highlightCoord === coord;
          const clickable = !!onCellSelect;
          return (
            <div key={coord} onClick={clickable ? () => onCellSelect(coord, word) : undefined}
              style={{
                padding: "8px 4px", textAlign: "center",
                background: highlighted ? C.olive : C.surface,
                color: highlighted ? "#000000" : C.text,
                border: `1px solid ${highlighted ? C.olive : C.faint}`,
                fontSize: "9px", fontWeight: 900, letterSpacing: "0.04em",
                fontFamily: "'Courier New', Courier, monospace",
                cursor: clickable ? "pointer" : "default",
                userSelect: "none", lineHeight: 1.3,
                transition: "background 0.1s ease",
              }}>
              <div style={{ opacity: 0.4, fontSize: "7px", marginBottom: "3px" }}>{coord}</div>
              {word}
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────
export function FullPage({ children, bg = C.bg }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center px-6 overflow-y-auto" style={{ background: bg }}>
      {children}
    </div>
  );
}

export function CLabel({ children }) {
  return <div style={{ color: C.dim, fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em" }}>{children}</div>;
}

export function CInput(props) {
  return (
    <input {...props} style={{ width: "100%", background: "transparent", border: `1px solid ${C.faint}`, color: C.text, fontSize: "13px", fontFamily: "inherit", fontWeight: 900, letterSpacing: "0.1em", padding: "12px 16px", outline: "none", ...props.style }}
      className="placeholder-white placeholder-opacity-20 focus:border-white" />
  );
}

export function CBtn({ children, onClick, disabled = false }) {
  return (
    <button onClick={disabled ? undefined : onClick}
      className="w-full py-4 text-sm font-black tracking-widest border"
      style={{ background: disabled ? C.surface : C.amber, color: disabled ? C.dim : "#000000", borderColor: disabled ? C.faint : C.amber, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
      {children}
    </button>
  );
}

export function CBtnSecondary({ children, onClick }) {
  return (
    <button onClick={onClick} className="w-full py-3 text-xs font-bold tracking-widest border"
      style={{ background: C.surface2, border: `1px solid ${C.faint}`, color: C.text, fontFamily: "inherit", cursor: "pointer" }}>
      {children}
    </button>
  );
}

export function CError({ children }) {
  return <div style={{ color: C.red, fontSize: "10px", fontWeight: 900, letterSpacing: "0.15em" }}>{children}</div>;
}
