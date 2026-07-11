import { useEffect, useRef, useState, useCallback } from "react";
import socket from "./socket.js";
import Lobby from "./components/Lobby.jsx";
import RoleReveal from "./components/RoleReveal.jsx";
import Night from "./components/Night.jsx";
import Day from "./components/Day.jsx";
import GameOver from "./components/GameOver.jsx";

const INITIAL_ROOM = {
  roomCode: null,
  gameState: null,
  nightSubPhase: "NONE",
  players: [],
  mafiaTarget: null,
  doctorTarget: null,
  lastNightEliminated: "NONE",
  lastDayEliminated: "NONE",
  dayTied: false,
  timerRemaining: 0,
  winner: null,
  playerCount: 5,
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

    return () => socket.disconnect();
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

  switch (room.gameState) {
    case "STATE_LOBBY":
      return <Lobby room={room} myPlayer={myPlayer} socket={socket} joinError={joinError} />;
    case "STATE_ROLE_REVEAL":
      return <RoleReveal room={room} myPlayer={myPlayer} socket={socket} />;
    case "STATE_NIGHT":
      return <Night room={room} myPlayer={myPlayer} socket={socket} />;
    case "STATE_DAY":
      return <Day room={room} myPlayer={myPlayer} socket={socket} />;
    case "STATE_GAME_OVER":
      return <GameOver room={room} myPlayer={myPlayer} socket={socket} onGoHome={handleGoHome} />;
    default:
      return null;
  }
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
          <div className="text-5xl font-black tracking-widest text-white mb-1">MAFIA</div>
          <div className="text-xs tracking-widest text-white opacity-40">SOCIAL DEDUCTION</div>
          <div className="text-xs tracking-widest text-white opacity-20 mt-2">
            BY SNATH07 &nbsp;&bull;&nbsp; V{__APP_VERSION__}
          </div>
        </div>
        <Btn onClick={() => setView("HOST")}>CREATE ROOM</Btn>
        <Btn onClick={() => setView("JOIN")}>JOIN ROOM</Btn>
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
