import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MafiaIcon } from "./hub/icons.jsx";
import socket from "./socket.js";
import Lobby from "./components/Lobby.jsx";
import RoleReveal from "./components/RoleReveal.jsx";
import Night from "./components/Night.jsx";
import Day from "./components/Day.jsx";
import GameOver from "./components/GameOver.jsx";
import RoundRecap from "./components/RoundRecap.jsx";

const INITIAL_ROOM = {
  roomCode: null,
  gameState: null,
  nightSubPhase: "NONE",
  players: [],
  mafiaTarget: null,
  mafiaVotes: {},
  doctorTarget: null,
  lastNightEliminated: "NONE",
  lastDayEliminated: "NONE",
  dayTied: false,
  timerRemaining: 0,
  winner: null,
  abandonedBy: null,
  playerCount: 5,
  revealRolesOnElimination: false,
  roundRecap: null,
};

// Persistent player ID — survives page reloads
function getOrCreatePid() {
  let pid = localStorage.getItem("mafia_pid");
  if (!pid) {
    pid = crypto.randomUUID();
    localStorage.setItem("mafia_pid", pid);
  }
  return pid;
}

function saveSession(roomCode) {
  localStorage.setItem("mafia_session", roomCode);
}

function clearSession() {
  localStorage.removeItem("mafia_session");
}

function getSavedRoom() {
  return localStorage.getItem("mafia_session") || null;
}

export default function App() {
  const [room, setRoom] = useState(INITIAL_ROOM);
  const [myId, setMyId] = useState(null);
  const [joinError, setJoinError] = useState(null);
  const [dayFlash, setDayFlash] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const pid = useRef(getOrCreatePid());

  useEffect(() => {
    socket.connect();

    socket.on("connect", () => {
      const savedRoom = getSavedRoom();
      if (savedRoom) {
        // Attempt to resume an existing session
        setReconnecting(true);
        socket.emit("RECONNECT_REQUEST", { pid: pid.current, roomCode: savedRoom });
      }
      setMyId(socket.id);
    });

    socket.on("ROOM_CREATED", ({ roomCode }) => {
      saveSession(roomCode);
      setRoom((r) => ({ ...r, roomCode }));
    });

    socket.on("ROOM_UPDATE", (payload) => {
      setReconnecting(false);
      setRoom((prev) => {
        if (prev.gameState !== "STATE_DAY" && payload.gameState === "STATE_DAY") {
          setDayFlash(true);
          setTimeout(() => setDayFlash(false), 150);
        }
        return { ...payload };
      });
    });

    socket.on("JOIN_ERROR", ({ message }) => {
      setJoinError(message);
    });

    socket.on("RECONNECT_FAILED", () => {
      // Room expired or pid not found — clear session and go home
      clearSession();
      setReconnecting(false);
      setRoom(INITIAL_ROOM);
    });

    socket.on("disconnect", () => {
      // Don't wipe state — show reconnecting overlay and let socket.io retry
      setReconnecting(true);
    });

    return () => {
      socket.off("connect");
      socket.off("ROOM_CREATED");
      socket.off("ROOM_UPDATE");
      socket.off("JOIN_ERROR");
      socket.off("RECONNECT_FAILED");
      socket.off("disconnect");
      socket.disconnect();
    };
  }, []);

  const handleCreateRoom = useCallback((hostName) => {
    setJoinError(null);
    socket.emit("CREATE_ROOM_REQUEST", { name: hostName, pid: pid.current });
  }, []);

  const handleJoinRoom = useCallback((code, name) => {
    setJoinError(null);
    socket.emit("JOIN_ROOM_REQUEST", { code, name, pid: pid.current });
    saveSession(code.toUpperCase());
  }, []);

  const handleGoHome = useCallback(() => {
    socket.emit("LEAVE_ROOM_REQUEST");
    clearSession();
    setRoom(INITIAL_ROOM);
    setJoinError(null);
    setReconnecting(false);
  }, []);

  // myPlayer lookup uses socket.id which server keeps in sync after reconnect
  const myPlayer = room.players.find((p) => p.id === myId) || null;

  // Day flash overlay
  if (dayFlash) {
    return <div style={{ position: "fixed", inset: 0, background: "#FFFFFF", zIndex: 9999 }} />;
  }

  // Reconnecting overlay — shown when socket dropped but session exists
  if (reconnecting) {
    return <ReconnectingScreen onGiveUp={handleGoHome} />;
  }

  // Pre-join home screen
  if (!room.gameState) {
    return (
      <HomeScreen
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        joinError={joinError}
      />
    );
  }

  let screen = null;
  switch (room.gameState) {
    case "STATE_LOBBY":
      screen = <Lobby room={room} myPlayer={myPlayer} socket={socket} joinError={joinError} />;
      break;
    case "STATE_ROLE_REVEAL":
      screen = <RoleReveal room={room} myPlayer={myPlayer} socket={socket} />;
      break;
    case "STATE_NIGHT":
      screen = <Night room={room} myPlayer={myPlayer} socket={socket} />;
      break;
    case "STATE_DAY":
      screen = <Day room={room} myPlayer={myPlayer} socket={socket} />;
      break;
    case "STATE_ROUND_RECAP":
      screen = <RoundRecap room={room} myPlayer={myPlayer} socket={socket} />;
      break;
    case "STATE_GAME_OVER":
      screen = <GameOver room={room} myPlayer={myPlayer} socket={socket} onGoHome={handleGoHome} />;
      break;
    default:
      return null;
  }

  return (
    <>
      {screen}
      {myPlayer && <PlayerOverlay myPlayer={myPlayer} onLeave={handleGoHome} />}
    </>
  );
}

function PlayerOverlay({ myPlayer, onLeave }) {
  const [revealing, setRevealing] = useState(false);
  const hasRole = !!myPlayer.role;

  const roleColor = myPlayer.role === "MAFIA" ? "#FF3333" : "#FFFFFF";

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 5000,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      {/* Name + hold-to-reveal role */}
      <button
        onPointerDown={() => hasRole && setRevealing(true)}
        onPointerUp={() => setRevealing(false)}
        onPointerLeave={() => setRevealing(false)}
        onPointerCancel={() => setRevealing(false)}
        style={{
          background: revealing ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.6)",
          border: "1px solid rgba(255,255,255,0.2)",
          color: revealing ? roleColor : "rgba(255,255,255,0.7)",
          fontFamily: "inherit",
          fontSize: "10px",
          fontWeight: 900,
          letterSpacing: "0.1em",
          padding: "5px 8px",
          cursor: hasRole ? "pointer" : "default",
          whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          userSelect: "none",
          WebkitUserSelect: "none",
          touchAction: "manipulation",
        }}
      >
        {myPlayer.name}
        {revealing && myPlayer.role && (
          <span style={{ color: roleColor }}> — {myPlayer.role}</span>
        )}
        {hasRole && !revealing && (
          <span style={{ color: "rgba(255,255,255,0.25)", marginLeft: 4 }}>▼</span>
        )}
      </button>

      {/* Leave */}
      <button
        onClick={onLeave}
        style={{
          background: "rgba(0,0,0,0.6)",
          border: "1px solid rgba(255,51,51,0.4)",
          color: "rgba(255,51,51,0.6)",
          fontFamily: "inherit",
          fontSize: "9px",
          fontWeight: 900,
          letterSpacing: "0.1em",
          padding: "5px 7px",
          cursor: "pointer",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          touchAction: "manipulation",
        }}
      >
        LEAVE
      </button>
    </div>
  );
}

function ReconnectingScreen({ onGiveUp }) {
  return (
    <FullPage bg="#000000">
      <div className="flex flex-col items-center gap-6">
        <div className="animate-pulse" style={{ width: 2, height: 2, background: "#FFFFFF" }} />
        <div className="text-xs font-black tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
          RECONNECTING...
        </div>
        <button
          onClick={onGiveUp}
          className="text-xs tracking-widest mt-8"
          style={{ color: "rgba(255,255,255,0.2)", background: "none", border: "none" }}
        >
          LEAVE GAME
        </button>
      </div>
    </FullPage>
  );
}

function HomeScreen({ onCreateRoom, onJoinRoom, joinError }) {
  const [hostName, setHostName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [view, setView] = useState("CHOOSE");
  const navigate = useNavigate();

  const handleCreate = () => {
    if (!hostName.trim()) return;
    onCreateRoom(hostName.trim());
  };

  const handleJoin = () => {
    if (!joinCode.trim() || !joinName.trim()) return;
    onJoinRoom(joinCode.trim(), joinName.trim());
  };

  if (view === "HOST") {
    return (
      <FullPage>
        <div className="w-full max-w-sm flex flex-col gap-4">
          <Label>YOUR NAME</Label>
          <Input
            value={hostName}
            onChange={(e) => setHostName(e.target.value.toUpperCase().slice(0, 12))}
            placeholder="ENTER NAME"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <Btn onClick={handleCreate} disabled={!hostName.trim()}>CREATE ROOM</Btn>
          <BtnSecondary onClick={() => setView("CHOOSE")}>BACK</BtnSecondary>
        </div>
      </FullPage>
    );
  }

  if (view === "JOIN") {
    return (
      <FullPage>
        <div className="w-full max-w-sm flex flex-col gap-4">
          <Label>ROOM CODE</Label>
          <Input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 4))}
            placeholder="XXXX"
            maxLength={4}
          />
          <Label>YOUR NAME</Label>
          <Input
            value={joinName}
            onChange={(e) => setJoinName(e.target.value.toUpperCase().slice(0, 12))}
            placeholder="ENTER NAME"
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          />
          {joinError && <ErrorText>{joinError}</ErrorText>}
          <Btn onClick={handleJoin} disabled={!joinCode.trim() || !joinName.trim()}>JOIN ROOM</Btn>
          <BtnSecondary onClick={() => setView("CHOOSE")}>BACK</BtnSecondary>
        </div>
      </FullPage>
    );
  }

  return (
    <FullPage>
      <div className="w-full max-w-sm flex flex-col gap-6 items-center">
        <div className="text-center mb-4">
          <div className="flex justify-center mb-3">
            <MafiaIcon size={64} />
          </div>
          <div className="text-5xl font-black tracking-widest text-white mb-1">MAFIA</div>
          <div className="text-xs tracking-widest text-white opacity-40">SOCIAL DEDUCTION</div>
          <div className="text-xs tracking-widest text-white opacity-20 mt-2">
            BY SNATH07 &nbsp;&bull;&nbsp; V{__APP_VERSION__}
          </div>
        </div>
        <Btn onClick={() => setView("HOST")}>CREATE ROOM</Btn>
        <Btn onClick={() => setView("JOIN")}>JOIN ROOM</Btn>
        <button
          onClick={() => navigate("/")}
          style={{
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.2)",
            fontFamily: "inherit",
            fontSize: "9px",
            fontWeight: 900,
            letterSpacing: "0.2em",
            cursor: "pointer",
            padding: "8px 0 0",
          }}
        >
          ← GAMENITE
        </button>
      </div>
    </FullPage>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────

export function FullPage({ children, bg = "#121212" }) {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center px-6"
      style={{ background: bg }}
    >
      {children}
    </div>
  );
}

export function Label({ children }) {
  return <div className="text-xs font-bold tracking-widest text-white opacity-60">{children}</div>;
}

export function Input({ ...props }) {
  return (
    <input
      {...props}
      className="w-full bg-transparent border border-white text-white text-sm font-mono tracking-widest px-4 py-3 outline-none placeholder-white placeholder-opacity-20 transition-all duration-100 ease-linear focus:border-white focus:bg-white focus:bg-opacity-5"
    />
  );
}

export function Btn({ children, onClick, disabled = false, danger = false }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      className="w-full py-4 text-sm font-black tracking-widest transition-all duration-100 ease-linear border"
      style={{
        background: disabled ? "#1A1A1A" : danger ? "#FF3333" : "#FFFFFF",
        color: disabled ? "rgba(255,255,255,0.2)" : danger ? "#FFFFFF" : "#121212",
        borderColor: disabled ? "#1A1A1A" : danger ? "#FF3333" : "#FFFFFF",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function BtnSecondary({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full py-3 text-xs font-bold tracking-widest border border-white text-white transition-all duration-100 ease-linear"
      style={{ background: "#262626" }}
    >
      {children}
    </button>
  );
}

export function ErrorText({ children }) {
  return (
    <div className="text-xs font-bold tracking-widest" style={{ color: "#FF3333" }}>
      {children}
    </div>
  );
}
