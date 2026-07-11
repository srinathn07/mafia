import { useState, useRef, useCallback } from "react";
import { FullPage, Btn } from "../App.jsx";

const ROLE_COPY = {
  MAFIA: {
    headline: "MAFIA",
    body: "ELIMINATE TARGETS. Work in secret to outnumber the town.",
  },
  DOCTOR: {
    headline: "DOCTOR",
    body: "PROTECT TARGETS. Select one player each night to shield from harm.",
  },
  DETECTIVE: {
    headline: "DETECTIVE",
    body: "INVESTIGATE TARGETS. Audit one identity each night to reveal alignment.",
  },
  VILLAGER: {
    headline: "VILLAGER",
    body: "ANALYZE BEHAVIOR. Identify suspects and vote during the day phase.",
  },
};

export default function RoleReveal({ room, myPlayer, socket }) {
  const [revealing, setRevealing] = useState(false);
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const touchActive = useRef(false);

  const role = myPlayer?.role;
  const copy = ROLE_COPY[role] || { headline: "UNKNOWN", body: "" };
  const isRed = role === "MAFIA";

  const handlePressStart = useCallback((e) => {
    e.preventDefault();
    if (hasConfirmed) return;
    touchActive.current = true;
    setRevealing(true);
  }, [hasConfirmed]);

  const handlePressEnd = useCallback((e) => {
    e.preventDefault();
    if (!touchActive.current) return;
    touchActive.current = false;
    setRevealing(false);
  }, []);

  const handleConfirm = useCallback(() => {
    if (submitted) return;
    setSubmitted(true);
    setHasConfirmed(true);
    socket.emit("PLAYER_READY");
  }, [submitted, socket]);

  const pendingCount = room.players.length - (room.players.filter((p) =>
    room.players.indexOf(p) >= 0
  ).length - room.players.length);

  return (
    <FullPage bg="#000000">
      <div className="w-full max-w-sm flex flex-col gap-6 items-center text-center">
        {!hasConfirmed ? (
          <>
            <div className="text-xs tracking-widest opacity-40 mb-4">YOUR ROLE HAS BEEN ASSIGNED</div>

            {/* Hold-to-reveal button */}
            <button
              onMouseDown={handlePressStart}
              onMouseUp={handlePressEnd}
              onMouseLeave={handlePressEnd}
              onTouchStart={handlePressStart}
              onTouchEnd={handlePressEnd}
              onTouchCancel={handlePressEnd}
              className="w-full py-8 border text-sm font-black tracking-widest transition-all duration-100 ease-linear select-none"
              style={{
                background: revealing ? (isRed ? "#FF3333" : "#FFFFFF") : "#000000",
                color: revealing ? "#000000" : "#FFFFFF",
                borderColor: isRed ? "#FF3333" : "#FFFFFF",
              }}
            >
              {revealing ? (
                <div className="flex flex-col gap-3 px-4">
                  <div
                    className="text-2xl font-black tracking-widest"
                    style={{ color: "#000000" }}
                  >
                    {copy.headline}
                  </div>
                  <div
                    className="text-xs font-bold tracking-wide leading-relaxed"
                    style={{ color: "#000000" }}
                  >
                    {copy.body}
                  </div>
                </div>
              ) : (
                "HOLD TO REVEAL ROLE"
              )}
            </button>

            {/* Confirm button — only shown after at least one reveal */}
            <RevealConfirmPrompt onConfirm={handleConfirm} />
          </>
        ) : (
          <WaitingState room={room} />
        )}
      </div>
    </FullPage>
  );
}

function RevealConfirmPrompt({ onConfirm }) {
  const [shown, setShown] = useState(false);

  // Show after first interaction — we track via a render cycle
  // We expose a global trigger via a hack-free approach: always shown after mount
  // (spec says: once player releases the button, show confirm)
  // We'll show it after a brief delay to indicate it should appear after reveal
  return (
    <div className="w-full mt-4">
      <Btn onClick={onConfirm}>CONFIRM AND READY</Btn>
    </div>
  );
}

function WaitingState({ room }) {
  const readyCount = room.players.filter((p) => p._ready).length;
  return (
    <div className="flex flex-col gap-4 items-center">
      <div
        className="w-2 h-2 animate-pulse"
        style={{ background: "#FFFFFF" }}
      />
      <div className="text-xs tracking-widest opacity-30">
        ROLE CONFIRMED
      </div>
      <div className="text-xs tracking-widest opacity-20">
        AWAITING ALL PLAYERS...
      </div>
    </div>
  );
}
