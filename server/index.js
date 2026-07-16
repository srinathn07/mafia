import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { registerChameleonHandlers } from "./chameleon/index.js";

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const PORT = process.env.PORT || 3001;
const DAY_TIMER_SECONDS = 90;
const DISCONNECT_GRACE_MS = 60_000; // 60 seconds to reconnect

const rooms = new Map();
// Keyed by player pid — keeps Timeout objects off player objects (avoids circular JSON crash)
const disconnectTimers = new Map();

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function getRoleDistribution(count) {
  let mafia = 1;
  if (count >= 9) mafia = 3;
  else if (count >= 7) mafia = 2;
  return { mafia, doctor: 1, detective: 1, villagers: count - mafia - 2 };
}

function assignRoles(players, count) {
  const dist = getRoleDistribution(count);
  const roles = [];
  for (let i = 0; i < dist.mafia; i++) roles.push("MAFIA");
  roles.push("DOCTOR");
  roles.push("DETECTIVE");
  for (let i = 0; i < dist.villagers; i++) roles.push("VILLAGER");

  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }

  return players.map((p, idx) => ({ ...p, role: roles[idx] }));
}

function broadcastRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  io.to(roomCode).emit("ROOM_UPDATE", buildPayload(room));
}

function buildPayload(room) {
  return {
    roomCode: room.code,
    gameState: room.gameState,
    nightSubPhase: room.nightSubPhase,
    players: room.players.map(({ disconnectTimer, ...p }) => p),
    mafiaTarget: room.mafiaTarget,
    mafiaVotes: room.mafiaVotes,
    doctorTarget: room.doctorTarget,
    lastNightEliminated: room.lastNightEliminated,
    lastDayEliminated: room.lastDayEliminated,
    dayTied: room.dayTied,
    timerRemaining: room.timerRemaining,
    winner: room.winner,
    abandonedBy: room.abandonedBy || null,
    playerCount: room.playerCount,
    revealRolesOnElimination: room.revealRolesOnElimination,
    roundRecap: room.roundRecap,
  };
}

function clearTimer(room) {
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }
}

function checkWinCondition(room) {
  const livingMafia = room.players.filter((p) => p.isAlive && p.role === "MAFIA").length;
  const livingTown = room.players.filter((p) => p.isAlive && p.role !== "MAFIA").length;
  if (livingMafia === 0) return "TOWN";
  if (livingMafia >= livingTown) return "MAFIA";
  return null;
}

// ── Bot helpers ────────────────────────────────────────────────────────────────

// Called after bot votes land — auto-confirms if all living mafia are bots and consensus reached
function attemptBotMafiaConfirm(room) {
  if (room.nightSubPhase !== "MAFIA_TURN") return;
  const livingMafia = room.players.filter((p) => p.role === "MAFIA" && p.isAlive);
  if (!livingMafia.every((p) => p.isBot)) return; // humans confirm manually
  const votes = Object.values(room.mafiaVotes);
  if (votes.length < livingMafia.length) return;
  const consensusTarget = votes[0];
  if (!votes.every((v) => v === consensusTarget)) return;
  room.mafiaTarget = consensusTarget;
  advanceNightPhase(room);
}

function triggerBotNightAction(room) {
  if (room.gameState !== "STATE_NIGHT") return;
  const code = room.code;
  const baseDelay = 900 + Math.random() * 1400; // 0.9-2.3s feels natural

  if (room.nightSubPhase === "MAFIA_TURN") {
    const botMafia = room.players.filter((p) => p.isBot && p.isAlive && p.role === "MAFIA");
    if (!botMafia.length) return;
    // Each bot mafia casts a vote with slight stagger
    botMafia.forEach((bot, idx) => {
      setTimeout(() => {
        const r = rooms.get(code);
        if (!r || r.nightSubPhase !== "MAFIA_TURN") return;
        const targets = r.players.filter((p) => p.isAlive && p.role !== "MAFIA");
        if (!targets.length) return;
        // Follow existing votes if any, else pick random
        const existingVotes = Object.values(r.mafiaVotes);
        let targetId;
        if (existingVotes.length > 0) {
          const counts = {};
          for (const v of existingVotes) counts[v] = (counts[v] || 0) + 1;
          targetId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
          // Verify that target is still valid
          if (!targets.find((p) => p.id === targetId)) {
            targetId = targets[Math.floor(Math.random() * targets.length)].id;
          }
        } else {
          targetId = targets[Math.floor(Math.random() * targets.length)].id;
        }
        r.mafiaVotes[bot.id] = targetId;
        broadcastRoom(code);
        attemptBotMafiaConfirm(r);
      }, baseDelay + idx * 400);
    });
    return;
  }

  if (room.nightSubPhase === "DOCTOR_TURN") {
    const botDoctor = room.players.find((p) => p.isBot && p.isAlive && p.role === "DOCTOR");
    if (!botDoctor) return;
    setTimeout(() => {
      const r = rooms.get(code);
      if (!r || r.nightSubPhase !== "DOCTOR_TURN" || r.doctorTarget) return;
      const targets = r.players.filter((p) => p.isAlive);
      if (!targets.length) return;
      r.doctorTarget = targets[Math.floor(Math.random() * targets.length)].id;
      advanceNightPhase(r);
    }, baseDelay);
    return;
  }

  if (room.nightSubPhase === "DETECTIVE_TURN") {
    const botDetective = room.players.find((p) => p.isBot && p.isAlive && p.role === "DETECTIVE");
    if (!botDetective) return;
    setTimeout(() => {
      const r = rooms.get(code);
      if (!r || r.nightSubPhase !== "DETECTIVE_TURN") return;
      advanceNightPhase(r);
    }, baseDelay);
  }
}

function triggerBotDayVotes(room) {
  const code = room.code;
  const botVoters = room.players.filter((p) => p.isBot && p.isAlive);
  for (const bot of botVoters) {
    const delay = 1500 + Math.random() * 4000; // 1.5-5.5s stagger
    setTimeout(() => {
      const r = rooms.get(code);
      if (!r || r.gameState !== "STATE_DAY" || r.timerRemaining <= 0) return;
      const targets = r.players.filter((p) => p.isAlive && p.id !== bot.id);
      if (!targets.length) return;
      r.votes[bot.id] = targets[Math.floor(Math.random() * targets.length)].id;
      broadcastRoom(code);
    }, delay);
  }
}

// ──────────────────────────────────────────────────────────────────────────────

function advanceNightPhase(room) {
  const livingDoctor = room.players.some((p) => p.isAlive && p.role === "DOCTOR");
  const livingDetective = room.players.some((p) => p.isAlive && p.role === "DETECTIVE");

  if (room.nightSubPhase === "NONE") {
    room.nightSubPhase = "MAFIA_TURN";
    room.mafiaTarget = null;
    room.mafiaVotes = {};
    room.doctorTarget = null;
    room.detectiveResult = null;
    broadcastRoom(room.code);
    triggerBotNightAction(room);
    return;
  }

  if (room.nightSubPhase === "MAFIA_TURN") {
    if (livingDoctor) {
      room.nightSubPhase = "DOCTOR_TURN";
    } else if (livingDetective) {
      room.nightSubPhase = "DETECTIVE_TURN";
    } else {
      resolveNight(room);
      return;
    }
    broadcastRoom(room.code);
    triggerBotNightAction(room);
    return;
  }

  if (room.nightSubPhase === "DOCTOR_TURN") {
    if (livingDetective) {
      room.nightSubPhase = "DETECTIVE_TURN";
    } else {
      resolveNight(room);
      return;
    }
    broadcastRoom(room.code);
    triggerBotNightAction(room);
    return;
  }

  if (room.nightSubPhase === "DETECTIVE_TURN") {
    resolveNight(room);
  }
}

function resolveNight(room) {
  let eliminated = "NONE";

  if (room.mafiaTarget && room.mafiaTarget !== room.doctorTarget) {
    const target = room.players.find((p) => p.id === room.mafiaTarget);
    if (target) {
      target.isAlive = false;
      eliminated = target.name;
    }
  }

  room.lastNightEliminated = eliminated;
  room.gameState = "STATE_DAY";
  room.nightSubPhase = "NONE";
  room.votes = {};

  const winner = checkWinCondition(room);
  if (winner) {
    room.gameState = "STATE_GAME_OVER";
    room.winner = winner;
    broadcastRoom(room.code);
    return;
  }

  room.timerRemaining = DAY_TIMER_SECONDS;
  broadcastRoom(room.code);
  triggerBotDayVotes(room);

  room.timerInterval = setInterval(() => {
    room.timerRemaining -= 1;
    if (room.timerRemaining <= 0) {
      clearTimer(room);
      resolveDayVote(room);
    } else {
      broadcastRoom(room.code);
    }
  }, 1000);
}

function resolveDayVote(room) {
  const voteCounts = {};
  const livingPlayers = room.players.filter((p) => p.isAlive);
  const livingIds = livingPlayers.map((p) => p.id);

  for (const votedId of Object.values(room.votes)) {
    if (livingIds.includes(votedId)) {
      if (!voteCounts[votedId]) voteCounts[votedId] = 0;
      voteCounts[votedId]++;
    }
  }

  let maxVotes = 0;
  let executed = null;
  let tied = false;

  for (const [id, count] of Object.entries(voteCounts)) {
    if (count > maxVotes) {
      maxVotes = count;
      executed = id;
      tied = false;
    } else if (count === maxVotes) {
      tied = true;
    }
  }

  if (tied) executed = null;
  room.dayTied = tied;

  // Build recap with vote counts before elimination
  const recapVotes = livingPlayers
    .map((p) => ({ name: p.name, count: voteCounts[p.id] || 0 }))
    .sort((a, b) => b.count - a.count);

  // Eliminate
  let eliminatedName = "NONE";
  if (executed) {
    const target = room.players.find((p) => p.id === executed);
    if (target) {
      target.isAlive = false;
      eliminatedName = target.name;
    }
  }
  room.lastDayEliminated = eliminatedName;

  room.roundRecap = {
    votes: recapVotes,
    eliminated: eliminatedName,
    tied,
  };

  const winner = checkWinCondition(room);
  if (winner) {
    room.gameState = "STATE_GAME_OVER";
    room.winner = winner;
    broadcastRoom(room.code);
    return;
  }

  room.gameState = "STATE_ROUND_RECAP";
  broadcastRoom(room.code);
}

// Remove a player from room, handle host migration and empty room cleanup
function removePlayer(room, playerId) {
  const leaving = room.players.find((p) => p.id === playerId);
  if (leaving && disconnectTimers.has(leaving.pid)) {
    clearTimeout(disconnectTimers.get(leaving.pid));
    disconnectTimers.delete(leaving.pid);
  }
  room.players = room.players.filter((p) => p.id !== playerId);

  if (room.players.length === 0) {
    clearTimer(room);
    rooms.delete(room.code);
    return;
  }


  if (!room.players.some((p) => p.isHost)) {
    room.players[0].isHost = true;
  }

  broadcastRoom(room.code);
}

io.on("connection", (socket) => {
  console.log("CONNECT", socket.id);
  registerChameleonHandlers(io, socket);

  // ── Create room ────────────────────────────────────────────────────────────
  socket.on("CREATE_ROOM_REQUEST", ({ name, pid } = {}) => {
    let code;
    do { code = generateRoomCode(); } while (rooms.has(code));

    const hostName = name?.trim().toUpperCase().slice(0, 12) || "HOST";

    const room = {
      code,
      gameState: "STATE_LOBBY",
      nightSubPhase: "NONE",
      players: [{
        id: socket.id,
        pid: pid || socket.id,
        name: hostName,
        role: null,
        isAlive: true,
        isHost: true,
        connected: true,
        disconnectTimer: null,
      }],
      playerCount: 5,
      mafiaTarget: null,
      mafiaVotes: {},
      doctorTarget: null,
      detectiveResult: null,
      lastNightEliminated: "NONE",
      lastDayEliminated: "NONE",
      dayTied: false,
      timerRemaining: 0,
      winner: null,
      abandonedBy: null,
      votes: {},
      roundRecap: null,
      revealRolesOnElimination: false,
      readySet: new Set(),
      timerInterval: null,
    };

    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    socket.emit("ROOM_CREATED", { roomCode: code });
    broadcastRoom(code);
  });

  // ── Join room ──────────────────────────────────────────────────────────────
  socket.on("JOIN_ROOM_REQUEST", ({ code, name, pid }) => {
    const roomCode = code?.toUpperCase();
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit("JOIN_ERROR", { message: "ROOM NOT FOUND" });
      return;
    }
    if (room.gameState !== "STATE_LOBBY") {
      socket.emit("JOIN_ERROR", { message: "GAME ALREADY IN PROGRESS" });
      return;
    }
    const trimmedName = name?.trim().toUpperCase().slice(0, 12);
    if (!trimmedName) {
      socket.emit("JOIN_ERROR", { message: "INVALID NAME" });
      return;
    }

    const player = {
      id: socket.id,
      pid: pid || socket.id,
      name: trimmedName,
      role: null,
      isAlive: true,
      isHost: false,
      connected: true,
      disconnectTimer: null,
    };
    room.players.push(player);
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    broadcastRoom(roomCode);
  });

  // ── Reconnect ──────────────────────────────────────────────────────────────
  socket.on("RECONNECT_REQUEST", ({ pid, roomCode }) => {
    const room = rooms.get(roomCode?.toUpperCase());
    if (!room) {
      socket.emit("RECONNECT_FAILED");
      return;
    }

    const player = room.players.find((p) => p.pid === pid);
    if (!player) {
      socket.emit("RECONNECT_FAILED");
      return;
    }

    // Cancel pending removal timer
    if (disconnectTimers.has(player.pid)) {
      clearTimeout(disconnectTimers.get(player.pid));
      disconnectTimers.delete(player.pid);
    }

    // If readySet tracked old socket id, migrate it
    if (room.readySet.has(player.id)) {
      room.readySet.delete(player.id);
      room.readySet.add(socket.id);
    }

    // If votes tracked old socket id, migrate
    if (room.votes[player.id] !== undefined) {
      room.votes[socket.id] = room.votes[player.id];
      delete room.votes[player.id];
    }
    if (room.mafiaVotes[player.id] !== undefined) {
      room.mafiaVotes[socket.id] = room.mafiaVotes[player.id];
      delete room.mafiaVotes[player.id];
    }

    // Update socket binding
    player.id = socket.id;
    player.connected = true;

    socket.join(room.code);
    socket.data.roomCode = room.code;

    // Send current state back to the reconnected client
    socket.emit("ROOM_UPDATE", buildPayload(room));
    broadcastRoom(room.code);
  });

  // ── Host sets player count ─────────────────────────────────────────────────
  socket.on("SET_PLAYER_COUNT", ({ count }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const host = room.players.find((p) => p.id === socket.id && p.isHost);
    if (!host) return;
    const clamped = Math.max(5, Math.min(16, parseInt(count, 10) || 5));
    room.playerCount = clamped;
    broadcastRoom(room.code);
  });

  // ── Start game ─────────────────────────────────────────────────────────────
  socket.on("GAME_START_REQUEST", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const host = room.players.find((p) => p.id === socket.id && p.isHost);
    if (!host) return;
    if (room.players.length !== room.playerCount) return;

    room.players = assignRoles(room.players, room.playerCount);
    room.gameState = "STATE_ROLE_REVEAL";
    room.readySet = new Set();
    // Bots skip role reveal — mark them ready immediately
    room.players.filter((p) => p.isBot).forEach((p) => room.readySet.add(p.id));
    broadcastRoom(room.code);
  });

  // ── Role confirmed ─────────────────────────────────────────────────────────
  socket.on("PLAYER_READY", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.gameState !== "STATE_ROLE_REVEAL") return;
    room.readySet.add(socket.id);

    const allReady = room.players.every((p) => room.readySet.has(p.id));
    if (allReady) {
      room.gameState = "STATE_NIGHT";
      room.nightSubPhase = "NONE";
      room.mafiaTarget = null;
      room.mafiaVotes = {};
      room.doctorTarget = null;
      room.votes = {};
      advanceNightPhase(room);
    } else {
      broadcastRoom(room.code);
    }
  });

  // ── Night actions ──────────────────────────────────────────────────────────
  socket.on("SUBMIT_MAFIA_VOTE", ({ targetId }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.nightSubPhase !== "MAFIA_TURN") return;
    const actor = room.players.find((p) => p.id === socket.id && p.role === "MAFIA" && p.isAlive);
    if (!actor) return;
    const target = room.players.find((p) => p.id === targetId && p.isAlive && p.role !== "MAFIA");
    if (!target) return;
    room.mafiaVotes[socket.id] = targetId;
    broadcastRoom(room.code);
  });

  socket.on("CONFIRM_MAFIA_TARGET", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.nightSubPhase !== "MAFIA_TURN") return;
    const actor = room.players.find((p) => p.id === socket.id && p.role === "MAFIA" && p.isAlive);
    if (!actor) return;
    // Require full consensus before confirming
    const livingMafia = room.players.filter((p) => p.role === "MAFIA" && p.isAlive);
    const votes = Object.values(room.mafiaVotes);
    if (votes.length < livingMafia.length) return;
    const consensusTarget = votes[0];
    if (!votes.every((v) => v === consensusTarget)) return;
    room.mafiaTarget = consensusTarget;
    advanceNightPhase(room);
  });

  socket.on("SUBMIT_DOCTOR_TARGET", ({ targetId }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.nightSubPhase !== "DOCTOR_TURN") return;
    const actor = room.players.find((p) => p.id === socket.id && p.role === "DOCTOR" && p.isAlive);
    if (!actor) return;
    const target = room.players.find((p) => p.id === targetId && p.isAlive);
    if (!target) return;
    room.doctorTarget = targetId;
    advanceNightPhase(room);
  });

  socket.on("REQUEST_AUDIT", ({ targetId }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.nightSubPhase !== "DETECTIVE_TURN") return;
    const actor = room.players.find((p) => p.id === socket.id && p.role === "DETECTIVE" && p.isAlive);
    if (!actor) return;
    const target = room.players.find((p) => p.id === targetId && p.isAlive && p.id !== socket.id);
    if (!target) return;
    const alignment = target.role === "MAFIA" ? "MAFIA" : "TOWN";
    socket.emit("AUDIT_RESULT", { alignment, targetName: target.name });
  });

  socket.on("SUBMIT_DETECTIVE_DONE", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.nightSubPhase !== "DETECTIVE_TURN") return;
    const actor = room.players.find((p) => p.id === socket.id && p.role === "DETECTIVE" && p.isAlive);
    if (!actor) return;
    advanceNightPhase(room);
  });

  // ── Day vote ───────────────────────────────────────────────────────────────
  socket.on("CAST_VOTE", ({ suspectId }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.gameState !== "STATE_DAY") return;
    const voter = room.players.find((p) => p.id === socket.id && p.isAlive);
    if (!voter) return;
    const suspect = room.players.find((p) => p.id === suspectId && p.isAlive);
    if (!suspect) return;
    room.votes[socket.id] = suspectId;
    broadcastRoom(room.code);
  });

  // ── Bot fill / remove (dev mode) ──────────────────────────────────────────
  socket.on("FILL_BOTS_REQUEST", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.gameState !== "STATE_LOBBY") return;
    const host = room.players.find((p) => p.id === socket.id && p.isHost);
    if (!host) return;

    const needed = room.playerCount - room.players.length;
    if (needed <= 0) return;

    const existingBotCount = room.players.filter((p) => p.isBot).length;
    for (let i = 0; i < needed; i++) {
      const num = existingBotCount + i + 1;
      const botId = `bot_${Date.now()}_${num}`;
      room.players.push({
        id: botId,
        pid: `pid_${botId}`,
        name: `BOT-${num}`,
        role: null,
        isAlive: true,
        isHost: false,
        connected: true,
        isBot: true,
      });
    }
    broadcastRoom(room.code);
  });

  socket.on("REMOVE_BOTS_REQUEST", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.gameState !== "STATE_LOBBY") return;
    const host = room.players.find((p) => p.id === socket.id && p.isHost);
    if (!host) return;
    room.players = room.players.filter((p) => !p.isBot);
    broadcastRoom(room.code);
  });

  // ── Host room option toggle ────────────────────────────────────────────────
  socket.on("SET_ROOM_OPTION", ({ revealRolesOnElimination }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.gameState !== "STATE_LOBBY") return;
    const host = room.players.find((p) => p.id === socket.id && p.isHost);
    if (!host) return;
    if (typeof revealRolesOnElimination === "boolean") {
      room.revealRolesOnElimination = revealRolesOnElimination;
    }
    broadcastRoom(room.code);
  });

  // ── Host advances from recap to night ─────────────────────────────────────
  socket.on("BEGIN_NIGHT_REQUEST", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.gameState !== "STATE_ROUND_RECAP") return;
    const host = room.players.find((p) => p.id === socket.id && p.isHost);
    if (!host) return;
    room.gameState = "STATE_NIGHT";
    room.nightSubPhase = "NONE";
    room.mafiaTarget = null;
    room.mafiaVotes = {};
    room.doctorTarget = null;
    room.detectiveResult = null;
    room.votes = {};
    advanceNightPhase(room);
  });

  // ── Host ends deliberation early ──────────────────────────────────────────
  socket.on("END_DELIBERATION_REQUEST", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.gameState !== "STATE_DAY") return;
    const host = room.players.find((p) => p.id === socket.id && p.isHost);
    if (!host) return;
    clearTimer(room);
    resolveDayVote(room);
  });

  // ── Reset room ─────────────────────────────────────────────────────────────
  socket.on("RESET_ROOM_REQUEST", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const host = room.players.find((p) => p.id === socket.id && p.isHost);
    if (!host) return;

    clearTimer(room);
    room.gameState = "STATE_LOBBY";
    room.nightSubPhase = "NONE";
    room.players = room.players.map((p) => ({ ...p, role: null, isAlive: true }));
    room.mafiaTarget = null;
    room.mafiaVotes = {};
    room.doctorTarget = null;
    room.detectiveResult = null;
    room.lastNightEliminated = "NONE";
    room.lastDayEliminated = "NONE";
    room.dayTied = false;
    room.timerRemaining = 0;
    room.winner = null;
    room.abandonedBy = null;
    room.votes = {};
    room.roundRecap = null;
    room.readySet = new Set();
    broadcastRoom(room.code);
  });

  // ── Explicit leave ─────────────────────────────────────────────────────────
  socket.on("LEAVE_ROOM_REQUEST", () => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    // Cancel any pending disconnect timer for this player
    if (disconnectTimers.has(player.pid)) {
      clearTimeout(disconnectTimers.get(player.pid));
      disconnectTimers.delete(player.pid);
    }

    const wasInGame =
      room.gameState !== "STATE_LOBBY" && room.gameState !== "STATE_GAME_OVER";

    // Immediately leave the socket.io room so no future broadcasts reach this socket
    socket.leave(roomCode);
    socket.data.roomCode = null;

    // Remove the player
    room.players = room.players.filter((p) => p.id !== socket.id);

    if (room.players.length === 0) {
      clearTimer(room);
      rooms.delete(roomCode);
      return;
    }

    if (!room.players.some((p) => p.isHost)) room.players[0].isHost = true;

    if (wasInGame) {
      clearTimer(room);
      room.gameState = "STATE_GAME_OVER";
      room.winner = "ABANDONED";
      room.abandonedBy = player.name;
    }

    broadcastRoom(roomCode);
  });

  // ── Disconnect ─────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    player.connected = false;

    // Give the player 60 seconds to reconnect before removing them
    const removalTimer = setTimeout(() => {
      disconnectTimers.delete(player.pid);
      const r = rooms.get(roomCode);
      if (!r) return;
      removePlayer(r, player.id);
    }, DISCONNECT_GRACE_MS);
    disconnectTimers.set(player.pid, removalTimer);

    // Still broadcast so others can see the disconnected state if desired
    broadcastRoom(roomCode);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Mafia server running on port ${PORT}`);
});
