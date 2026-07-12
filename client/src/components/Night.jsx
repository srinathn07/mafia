import { useState, useCallback, useEffect, useRef } from "react";
import { FullPage, Btn } from "../App.jsx";

const PHASE_LABELS = {
  MAFIA_TURN: "THE MAFIA IS CHOOSING A TARGET",
  DOCTOR_TURN: "THE DOCTOR IS CHOOSING WHO TO PROTECT",
  DETECTIVE_TURN: "THE DETECTIVE IS AUDITING A PLAYER",
  NONE: "THE NIGHT IS BEGINNING...",
};

const PALETTE = [
  { color: "#FFFFFF", label: "W" },
  { color: "#FF3333", label: "R" },
  { color: "#3399FF", label: "B" },
  { color: "#FFD700", label: "Y" },
  { color: "#888888", label: "G" },
  { color: "#000000", label: "E" }, // eraser
];

function DrawingPad() {
  const canvasRef = useRef(null);
  const [activeColor, setActiveColor] = useState("#FFFFFF");
  const drawing = useRef(false);
  const lastPos = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPos.current = getPos(e);
  };

  const draw = (e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = activeColor;
    ctx.lineWidth = activeColor === "#000000" ? 20 : 5;
    ctx.lineCap = "square";
    ctx.lineJoin = "miter";
    ctx.stroke();
    lastPos.current = pos;
  };

  const stopDraw = (e) => {
    drawing.current = false;
    lastPos.current = null;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  // Fix: need canvas ref for setPointerCapture inside startDraw
  const canvasEl = canvasRef;

  return (
    <div className="flex flex-col gap-2 w-full h-full">
      <canvas
        ref={canvasRef}
        width={500}
        height={440}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          lastPos.current = getPos(e);
        }}
        onPointerMove={draw}
        onPointerUp={stopDraw}
        onPointerCancel={stopDraw}
        style={{
          width: "100%",
          flex: 1,
          touchAction: "none",
          background: "#000000",
          border: "1px solid rgba(255,255,255,0.1)",
          cursor: "crosshair",
          display: "block",
        }}
      />

      {/* Color palette + clear */}
      <div className="flex gap-2">
        {PALETTE.map(({ color, label }) => (
          <button
            key={color}
            onClick={() => setActiveColor(color)}
            style={{
              flex: 1,
              height: 36,
              background: color === "#000000" ? "#1A1A1A" : color,
              border: activeColor === color
                ? "2px solid #FFFFFF"
                : "1px solid rgba(255,255,255,0.15)",
              cursor: "pointer",
              position: "relative",
            }}
          >
            {color === "#000000" && (
              <span style={{ color: "#FFFFFF", fontSize: 9, fontWeight: 900, letterSpacing: "0.05em" }}>
                ERASE
              </span>
            )}
          </button>
        ))}
        <button
          onClick={clearCanvas}
          style={{
            flex: 1,
            height: 36,
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.2)",
            color: "rgba(255,255,255,0.5)",
            fontSize: 9,
            fontWeight: 900,
            letterSpacing: "0.1em",
            cursor: "pointer",
          }}
        >
          CLR
        </button>
      </div>
    </div>
  );
}

function DeadRolesPanel({ players }) {
  return (
    <div className="w-full">
      <div className="text-xs tracking-widest opacity-40 mb-2">ALL ROLES</div>
      <div className="flex flex-col gap-1">
        {players.map((p) => (
          <div
            key={p.id}
            className="flex justify-between items-center px-3 py-2"
            style={{
              background: p.isAlive ? "#1A1A1A" : "rgba(255,255,255,0.03)",
              opacity: p.isAlive ? 1 : 0.5,
            }}
          >
            <span className="text-xs font-black tracking-widest" style={{ color: "#FFFFFF" }}>
              {p.name}
            </span>
            <span
              className="text-xs font-black tracking-widest"
              style={{ color: p.role === "MAFIA" ? "#FF3333" : "rgba(255,255,255,0.6)" }}
            >
              {p.role || "—"}{!p.isAlive ? " †" : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WaitingScreen({ room, myPlayer }) {
  const label = PHASE_LABELS[room.nightSubPhase] || "STANDBY...";
  const isDead = myPlayer && !myPlayer.isAlive;
  const showRoles = isDead && room.revealRolesOnElimination;

  const dayResult =
    room.lastDayEliminated && room.lastDayEliminated !== "NONE"
      ? `${room.lastDayEliminated} WAS EXECUTED BY THE TOWN.`
      : room.dayTied
      ? "THE TOWN WAS DIVIDED. NO EXECUTION."
      : null;

  return (
    <div
      className="fixed inset-0 flex flex-col px-5 pb-5"
      style={{ background: "#000000", paddingTop: 56 }}
    >
      {/* Phase label or roles for dead */}
      {showRoles ? (
        <div className="mb-3">
          <DeadRolesPanel players={room.players} />
        </div>
      ) : (
        <div
          className="w-full px-4 py-3 border text-center mb-3"
          style={{ borderColor: "rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)" }}
        >
          <div className="text-xs font-black tracking-widest" style={{ color: "#FFFFFF" }}>
            {label}
          </div>
        </div>
      )}

      {/* Drawing pad fills remaining space */}
      <div className="flex-1 flex flex-col min-h-0">
        <DrawingPad />
      </div>

      {dayResult && (
        <div
          className="w-full px-4 py-2 border text-center mt-2"
          style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}
        >
          <div className="text-xs font-black tracking-widest">{dayResult}</div>
        </div>
      )}
    </div>
  );
}

export default function Night({ room, myPlayer, socket }) {
  const { nightSubPhase } = room;

  if (!myPlayer) return <WaitingScreen room={room} myPlayer={null} />;

  const isMafia = myPlayer.role === "MAFIA" && myPlayer.isAlive;
  const isDoctor = myPlayer.role === "DOCTOR" && myPlayer.isAlive;
  const isDetective = myPlayer.role === "DETECTIVE" && myPlayer.isAlive;

  if (nightSubPhase === "MAFIA_TURN") {
    return isMafia
      ? <MafiaInterface room={room} myPlayer={myPlayer} socket={socket} />
      : <WaitingScreen room={room} myPlayer={myPlayer} />;
  }
  if (nightSubPhase === "DOCTOR_TURN") {
    return isDoctor
      ? <DoctorInterface room={room} myPlayer={myPlayer} socket={socket} />
      : <WaitingScreen room={room} myPlayer={myPlayer} />;
  }
  if (nightSubPhase === "DETECTIVE_TURN") {
    return isDetective
      ? <DetectiveInterface room={room} myPlayer={myPlayer} socket={socket} />
      : <WaitingScreen room={room} myPlayer={myPlayer} />;
  }

  return <WaitingScreen room={room} myPlayer={myPlayer} />;
}

// ── MAFIA ─────────────────────────────────────────────────────────────────────
function MafiaInterface({ room, myPlayer, socket }) {
  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const targets = room.players.filter((p) => p.isAlive && p.role !== "MAFIA");

  const handleSubmit = useCallback(() => {
    if (!selected || submitted) return;
    setSubmitted(true);
    socket.emit("SUBMIT_MAFIA_TARGET", { targetId: selected });
  }, [selected, submitted, socket]);

  const mafiaTeam = room.players.filter((p) => p.role === "MAFIA" && p.id !== myPlayer.id);

  return (
    <FullPage bg="#000000">
      <div className="w-full max-w-sm flex flex-col gap-4">
        <div className="text-center mb-2">
          <div className="text-xs tracking-widest mb-1" style={{ color: "#FF3333" }}>
            NIGHT PHASE — MAFIA TURN
          </div>
          {mafiaTeam.length > 0 && (
            <div className="text-xs tracking-widest opacity-30">
              TEAM: {mafiaTeam.map((p) => p.name).join(", ")}
            </div>
          )}
        </div>
        <div className="text-xs tracking-widest opacity-40 mb-2">SELECT TARGET TO ELIMINATE</div>
        <div className="flex flex-col gap-2">
          {targets.map((p) => (
            <button
              key={p.id}
              onClick={() => !submitted && setSelected(p.id)}
              className="w-full px-4 py-4 text-left text-sm font-black tracking-widest transition-all duration-100 ease-linear"
              style={{
                background: selected === p.id ? "#FF3333" : "#262626",
                color: "#FFFFFF",
                border: selected === p.id ? "2px solid #FF3333" : "1px solid #FFFFFF",
                opacity: submitted && selected !== p.id ? 0.3 : 1,
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="mt-4">
          <Btn onClick={handleSubmit} disabled={!selected || submitted} danger={!!selected}>
            {submitted ? "TARGET LOCKED" : "EXECUTE TARGET"}
          </Btn>
        </div>
      </div>
    </FullPage>
  );
}

// ── DOCTOR ────────────────────────────────────────────────────────────────────
function DoctorInterface({ room, myPlayer, socket }) {
  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const targets = room.players.filter((p) => p.isAlive);

  const handleSubmit = useCallback(() => {
    if (!selected || submitted) return;
    setSubmitted(true);
    socket.emit("SUBMIT_DOCTOR_TARGET", { targetId: selected });
  }, [selected, submitted, socket]);

  return (
    <FullPage bg="#000000">
      <div className="w-full max-w-sm flex flex-col gap-4">
        <div className="text-center mb-2">
          <div className="text-xs tracking-widest opacity-60">NIGHT PHASE — DOCTOR TURN</div>
        </div>
        <div className="text-xs tracking-widest opacity-40 mb-2">SELECT PLAYER TO SHIELD</div>
        <div className="flex flex-col gap-2">
          {targets.map((p) => (
            <button
              key={p.id}
              onClick={() => !submitted && setSelected(p.id)}
              className="w-full px-4 py-4 text-left text-sm font-black tracking-widest transition-all duration-100 ease-linear flex justify-between"
              style={{
                background: selected === p.id ? "#FFFFFF" : "#262626",
                color: selected === p.id ? "#121212" : "#FFFFFF",
                border: selected === p.id ? "2px solid #FFFFFF" : "1px solid rgba(255,255,255,0.3)",
                opacity: submitted && selected !== p.id ? 0.3 : 1,
              }}
            >
              <span>{p.name}</span>
              {p.id === myPlayer.id && <span className="text-xs opacity-50">YOU</span>}
            </button>
          ))}
        </div>
        <div className="mt-4">
          <Btn onClick={handleSubmit} disabled={!selected || submitted}>
            {submitted ? "SHIELD APPLIED" : "SHIELD PLAYER"}
          </Btn>
        </div>
      </div>
    </FullPage>
  );
}

// ── DETECTIVE ─────────────────────────────────────────────────────────────────
function DetectiveInterface({ room, myPlayer, socket }) {
  const [selected, setSelected] = useState(null);
  const [auditResult, setAuditResult] = useState(null);
  const [auditRequested, setAuditRequested] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [concluded, setConcluded] = useState(false);

  useEffect(() => {
    const handler = (data) => setAuditResult(data);
    socket.on("AUDIT_RESULT", handler);
    return () => socket.off("AUDIT_RESULT", handler);
  }, [socket]);

  const targets = room.players.filter((p) => p.isAlive && p.id !== myPlayer.id);

  const handleAudit = useCallback(() => {
    if (!selected || auditRequested) return;
    setAuditRequested(true);
    socket.emit("REQUEST_AUDIT", { targetId: selected });
  }, [selected, auditRequested, socket]);

  const handleConclude = useCallback(() => {
    if (concluded) return;
    setConcluded(true);
    socket.emit("SUBMIT_DETECTIVE_DONE");
  }, [concluded, socket]);

  const isMafia = auditResult?.alignment === "MAFIA";

  return (
    <FullPage bg="#000000">
      <div className="w-full max-w-sm flex flex-col gap-4">
        <div className="text-center mb-2">
          <div className="text-xs tracking-widest opacity-60">NIGHT PHASE — DETECTIVE TURN</div>
        </div>
        {!auditResult ? (
          <>
            <div className="text-xs tracking-widest opacity-40 mb-2">SELECT PLAYER TO AUDIT</div>
            <div className="flex flex-col gap-2">
              {targets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => !auditRequested && setSelected(p.id)}
                  className="w-full px-4 py-4 text-left text-sm font-black tracking-widest transition-all duration-100 ease-linear"
                  style={{
                    background: selected === p.id ? "#FFFFFF" : "#262626",
                    color: selected === p.id ? "#121212" : "#FFFFFF",
                    border: selected === p.id ? "2px solid #FFFFFF" : "1px solid rgba(255,255,255,0.3)",
                    opacity: auditRequested && selected !== p.id ? 0.3 : 1,
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <Btn onClick={handleAudit} disabled={!selected || auditRequested}>
                {auditRequested ? "AUDITING..." : "AUDIT IDENTITY"}
              </Btn>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="text-xs tracking-widest opacity-40 text-center mb-2">
              AUDIT COMPLETE — {auditResult.targetName}
            </div>
            <button
              onMouseDown={() => setRevealing(true)}
              onMouseUp={() => setRevealing(false)}
              onMouseLeave={() => setRevealing(false)}
              onTouchStart={(e) => { e.preventDefault(); setRevealing(true); }}
              onTouchEnd={(e) => { e.preventDefault(); setRevealing(false); }}
              onTouchCancel={() => setRevealing(false)}
              className="w-full py-8 border text-sm font-black tracking-widest transition-all duration-100 ease-linear select-none"
              style={{
                background: revealing ? (isMafia ? "#FF3333" : "#FFFFFF") : "#262626",
                color: revealing ? "#000000" : "#FFFFFF",
                borderColor: isMafia ? "#FF3333" : "#FFFFFF",
              }}
            >
              {revealing ? (
                <div className="text-xl font-black tracking-widest" style={{ color: "#000000" }}>
                  STATUS: {auditResult.alignment}
                </div>
              ) : (
                "HOLD TO REVEAL AUDIT RESULT"
              )}
            </button>
            <Btn onClick={handleConclude} disabled={concluded}>
              {concluded ? "CONCLUDING..." : "CONCLUDE NIGHT"}
            </Btn>
          </div>
        )}
      </div>
    </FullPage>
  );
}
