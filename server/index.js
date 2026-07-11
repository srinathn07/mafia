import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const PORT = process.env.PORT || 3001;
const DAY_TIMER_SECONDS = 90;

// rooms: Map<roomCode, RoomState>
const rooms = new Map();

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

  // Fisher-Yates shuffle
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
    players: room.players,
    mafiaTarget: room.mafiaTarget,
    doctorTarget: room.doctorTarget,
    lastNightEliminated: room.lastNightEliminated,
    timerRemaining: room.timerRemaining,
    winner: room.winner,
    playerCount: room.playerCount,
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

function advanceNightPhase(room) {
  const livingMafia = room.players.some((p) => p.isAlive && p.role === "MAFIA");
  const livingDoctor = room.players.some((p) => p.isAlive && p.role === "DOCTOR");
  const livingDetective = room.players.some((p) => p.isAlive && p.role === "DETECTIVE");

  if (room.nightSubPhase === "NONE") {
    room.nightSubPhase = "MAFIA_TURN";
    room.mafiaTarget = null;
    room.doctorTarget = null;
    room.detectiveResult = null;
    broadcastRoom(room.code);
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
  const livingIds = room.players.filter((p) => p.isAlive).map((p) => p.id);

  for (const votedId of Object.values(room.votes)) {
    if (!voteCounts[votedId]) voteCounts[votedId] = 0;
    voteCounts[votedId]++;
  }

  let maxVotes = 0;
  let executed = null;
  for (const [id, count] of Object.entries(voteCounts)) {
    if (count > maxVotes && livingIds.includes(id)) {
      maxVotes = count;
      executed = id;
    }
  }

  if (executed) {
    const target = room.players.find((p) => p.id === executed);
    if (target) target.isAlive = false;
  }

  const winner = checkWinCondition(room);
  if (winner) {
    room.gameState = "STATE_GAME_OVER";
    room.winner = winner;
    broadcastRoom(room.code);
    return;
  }

  // Next night
  room.gameState = "STATE_NIGHT";
  room.nightSubPhase = "NONE";
  room.mafiaTarget = null;
  room.doctorTarget = null;
  room.detectiveResult = null;
  room.votes = {};
  advanceNightPhase(room);
}

io.on("connection", (socket) => {
  console.log("CONNECT", socket.id);

  // Host creates room
  socket.on("CREATE_ROOM_REQUEST", ({ name } = {}) => {
    let code;
    do { code = generateRoomCode(); } while (rooms.has(code));

    const hostName = name?.trim().toUpperCase().slice(0, 12) || "HOST";

    const room = {
      code,
      gameState: "STATE_LOBBY",
      nightSubPhase: "NONE",
      players: [{
        id: socket.id,
        name: hostName,
        role: null,
        isAlive: true,
        isHost: true,
      }],
      playerCount: 5,
      mafiaTarget: null,
      doctorTarget: null,
      detectiveResult: null,
      lastNightEliminated: "NONE",
      timerRemaining: 0,
      winner: null,
      votes: {},
      readySet: new Set(),
      timerInterval: null,
    };

    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    socket.emit("ROOM_CREATED", { roomCode: code });
    broadcastRoom(code);
  });

  // Guest joins room
  socket.on("JOIN_ROOM_REQUEST", ({ code, name }) => {
    const room = rooms.get(code?.toUpperCase());
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

    const player = { id: socket.id, name: trimmedName, role: null, isAlive: true, isHost: false };
    room.players.push(player);
    socket.join(code.toUpperCase());
    socket.data.roomCode = code.toUpperCase();
    broadcastRoom(code.toUpperCase());
  });

  // Host updates player count config
  socket.on("SET_PLAYER_COUNT", ({ count }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const host = room.players.find((p) => p.id === socket.id && p.isHost);
    if (!host) return;
    const clamped = Math.max(5, Math.min(16, parseInt(count, 10) || 5));
    room.playerCount = clamped;
    broadcastRoom(room.code);
  });

  // Host updates their own display name
  socket.on("SET_HOST_NAME", ({ name }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const host = room.players.find((p) => p.id === socket.id && p.isHost);
    if (!host) return;
    host.name = name?.trim().toUpperCase().slice(0, 12) || "HOST";
    broadcastRoom(room.code);
  });

  // Host starts game
  socket.on("GAME_START_REQUEST", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const host = room.players.find((p) => p.id === socket.id && p.isHost);
    if (!host) return;
    if (room.players.length !== room.playerCount) return;

    room.players = assignRoles(room.players, room.playerCount);
    room.gameState = "STATE_ROLE_REVEAL";
    room.readySet = new Set();
    broadcastRoom(room.code);
  });

  // Player confirms role
  socket.on("PLAYER_READY", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.gameState !== "STATE_ROLE_REVEAL") return;
    room.readySet.add(socket.id);

    const allReady = room.players.every((p) => room.readySet.has(p.id));
    if (allReady) {
      room.gameState = "STATE_NIGHT";
      room.nightSubPhase = "NONE";
      room.mafiaTarget = null;
      room.doctorTarget = null;
      room.votes = {};
      advanceNightPhase(room);
    } else {
      broadcastRoom(room.code);
    }
  });

  // Mafia submits target
  socket.on("SUBMIT_MAFIA_TARGET", ({ targetId }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.nightSubPhase !== "MAFIA_TURN") return;
    const actor = room.players.find((p) => p.id === socket.id && p.role === "MAFIA" && p.isAlive);
    if (!actor) return;
    const target = room.players.find((p) => p.id === targetId && p.isAlive && p.role !== "MAFIA");
    if (!target) return;

    room.mafiaTarget = targetId;
    advanceNightPhase(room);
  });

  // Doctor submits target
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

  // Detective requests audit
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

  // Detective concludes night
  socket.on("SUBMIT_DETECTIVE_DONE", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.nightSubPhase !== "DETECTIVE_TURN") return;
    const actor = room.players.find((p) => p.id === socket.id && p.role === "DETECTIVE" && p.isAlive);
    if (!actor) return;
    advanceNightPhase(room);
  });

  // Day vote
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

  // Host resets room
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
    room.doctorTarget = null;
    room.detectiveResult = null;
    room.lastNightEliminated = "NONE";
    room.timerRemaining = 0;
    room.winner = null;
    room.votes = {};
    room.readySet = new Set();
    broadcastRoom(room.code);
  });

  socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;

    room.players = room.players.filter((p) => p.id !== socket.id);
    if (room.players.length === 0) {
      clearTimer(room);
      rooms.delete(roomCode);
      return;
    }

    // If host left, assign new host
    if (!room.players.some((p) => p.isHost)) {
      room.players[0].isHost = true;
    }

    broadcastRoom(roomCode);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Mafia server running on port ${PORT}`);
});
