import { useCallback, useState } from "react";
import { FullPage, Btn } from "../App.jsx";

export default function RoundRecap({ room, myPlayer, socket }) {
  const [sent, setSent] = useState(false);
  const isHost = myPlayer?.isHost;
  const recap = room.roundRecap;

  const handleBeginNight = useCallback(() => {
    if (sent) return;
    setSent(true);
    socket.emit("BEGIN_NIGHT_REQUEST");
  }, [sent, socket]);

  if (!recap) return null;

  const maxVotes = Math.max(...recap.votes.map((v) => v.count), 1);

  return (
    <FullPage>
      <div className="w-full max-w-sm flex flex-col gap-5 overflow-y-auto max-h-screen py-10">

        {/* Header */}
        <div className="text-center">
          <div className="text-xs tracking-widest opacity-40 mb-1">DELIBERATION CLOSED</div>
          <div className="text-2xl font-black tracking-widest">ROUND RECAP</div>
        </div>

        {/* Vote tally */}
        <div className="flex flex-col gap-1">
          {recap.votes.map((entry, i) => (
            <VoteRow
              key={entry.name}
              name={entry.name}
              count={entry.count}
              maxVotes={maxVotes}
              eliminated={entry.name === recap.eliminated}
            />
          ))}
        </div>

        {/* Result banner */}
        <div
          className="w-full px-4 py-4 border text-center"
          style={{
            borderColor: recap.eliminated !== "NONE" ? "#FF3333" : "rgba(255,255,255,0.2)",
            background: recap.eliminated !== "NONE" ? "rgba(255,51,51,0.08)" : "rgba(255,255,255,0.03)",
          }}
        >
          {recap.tied ? (
            <div className="text-xs font-black tracking-widest" style={{ color: "rgba(255,255,255,0.7)" }}>
              THE TOWN WAS DIVIDED. NO EXECUTION.
            </div>
          ) : recap.eliminated !== "NONE" ? (
            <div className="text-xs font-black tracking-widest" style={{ color: "#FF3333" }}>
              {recap.eliminated} WAS EXECUTED BY THE TOWN.
            </div>
          ) : (
            <div className="text-xs font-black tracking-widest" style={{ color: "rgba(255,255,255,0.7)" }}>
              NO VOTES CAST. NO EXECUTION.
            </div>
          )}
        </div>

        {/* Advance */}
        {isHost ? (
          <Btn onClick={handleBeginNight} disabled={sent}>
            {sent ? "STARTING NIGHT..." : "BEGIN NIGHT"}
          </Btn>
        ) : (
          <div className="text-center py-2">
            <div className="text-xs tracking-widest opacity-30 animate-pulse">
              WAITING FOR HOST TO BEGIN NIGHT...
            </div>
          </div>
        )}
      </div>
    </FullPage>
  );
}

function VoteRow({ name, count, maxVotes, eliminated }) {
  const barWidth = maxVotes > 0 ? (count / maxVotes) * 100 : 0;

  return (
    <div
      className="px-4 py-3 flex items-center gap-3"
      style={{
        background: eliminated ? "rgba(255,51,51,0.08)" : "#1A1A1A",
        border: eliminated ? "1px solid rgba(255,51,51,0.4)" : "1px solid transparent",
        opacity: count === 0 ? 0.5 : 1,
      }}
    >
      {/* Name */}
      <div
        className="text-xs font-black tracking-widest w-24 shrink-0"
        style={{ color: eliminated ? "#FF3333" : "#FFFFFF" }}
      >
        {name}
      </div>

      {/* Bar */}
      <div className="flex-1 h-px relative" style={{ background: "rgba(255,255,255,0.1)" }}>
        <div
          style={{
            position: "absolute",
            top: -2,
            left: 0,
            width: `${barWidth}%`,
            height: 5,
            background: eliminated ? "#FF3333" : "#FFFFFF",
            transition: "width 300ms ease-out",
          }}
        />
      </div>

      {/* Count */}
      <div
        className="text-sm font-black tracking-widest w-6 text-right shrink-0"
        style={{ color: eliminated ? "#FF3333" : "rgba(255,255,255,0.7)" }}
      >
        {count}
      </div>
    </div>
  );
}
