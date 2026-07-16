import { GRIDS, pickRandomCoord, coordToWord, coordToRowHint } from "./grids.js";

const chameleonRooms = new Map();
const chameleonDisconnectTimers = new Map();

const DEBATE_MS = 120_000;
const DISCONNECT_GRACE_MS = 60_000;
const ROW_LABELS = ["A", "B", "C", "D"];

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function roomKey(code) {
  return `chameleon:${code}`;
}

function broadcast(io, room) {
  io.to(roomKey(room.code)).emit("CHAMELEON_ROOM_UPDATE", buildPayload(room));
}

function buildPayload(room) {
  const grid = GRIDS[room.settings.gridKey];
  const showVotes = room.phase === "TIE_BREAK" || room.phase === "CHAMELEON_GUESS" || room.phase === "REVEAL";
  const showChameleonId = room.phase === "CHAMELEON_GUESS" || room.phase === "REVEAL";
  const showSecretCoord = room.phase === "REVEAL";

  return {
    roomCode: room.code,
    phase: room.phase,
    players: room.players.map(({ id, pid, name, isHost, connected }) => ({ id, pid, name, isHost, connected })),
    settings: room.settings,
    gridRows: grid ? grid.rows : [],
    turnOrder: room.turnOrder,
    currentTurnIdx: room.currentTurnIdx,
    clues: room.clues,
    clueOrder: room.clueOrder,
    voteCount: Object.keys(room.votes).length,
    votes: showVotes ? room.votes : {},
    tiedPlayerIds: room.tiedPlayerIds,
    revealedPlayerId: room.revealedPlayerId,
    chameleonId: showChameleonId ? room.chameleonSocketId : null,
    secretCoord: showSecretCoord ? room.secretCoord : null,
    chameleonGuess: room.chameleonGuess,
    winner: room.winner,
    abandonedBy: room.abandonedBy || null,
    debateEndTime: room.debateEndTime,
  };
}

function sendPrivateInfo(socket, room) {
  const player = room.players.find((p) => p.id === socket.id);
  if (!player) return;
  const info = room.privateInfo[player.pid];
  if (!info) return;
  socket.emit("CHAMELEON_PRIVATE_INFO", info);
}

function resolveVotes(io, room) {
  const voteCounts = {};
  for (const targetId of Object.values(room.votes)) {
    voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
  }

  let maxVotes = 0;
  let topPlayers = [];
  for (const [id, count] of Object.entries(voteCounts)) {
    if (count > maxVotes) { maxVotes = count; topPlayers = [id]; }
    else if (count === maxVotes) topPlayers.push(id);
  }

  if (topPlayers.length > 1) {
    // Tie — host decides
    room.tiedPlayerIds = topPlayers;
    room.phase = "TIE_BREAK";
    broadcast(io, room);
    return;
  }

  room.revealedPlayerId = topPlayers[0] || null;
  advanceAfterReveal(io, room);
}

function advanceAfterReveal(io, room) {
  if (!room.revealedPlayerId) {
    // No votes at all — Chameleon wins by default
    room.phase = "REVEAL";
    room.winner = "CHAMELEON";
    broadcast(io, room);
    return;
  }

  const revealedPlayer = room.players.find((p) => p.id === room.revealedPlayerId);
  if (!revealedPlayer) {
    room.phase = "REVEAL";
    room.winner = "CHAMELEON";
    broadcast(io, room);
    return;
  }

  if (revealedPlayer.pid !== room.chameleonPid) {
    // Wrong person voted out — Chameleon wins instantly
    room.phase = "REVEAL";
    room.winner = "CHAMELEON";
    broadcast(io, room);
    return;
  }

  // Correct — Chameleon gets a guess
  room.phase = "CHAMELEON_GUESS";
  broadcast(io, room);
}

function resetRoom(room) {
  if (room.debateTimer) { clearTimeout(room.debateTimer); room.debateTimer = null; }
  room.phase = "LOBBY";
  room.chameleonPid = null;
  room.chameleonSocketId = null;
  room.secretCoord = null;
  room.turnOrder = [];
  room.currentTurnIdx = 0;
  room.clues = {};
  room.clueOrder = [];
  room.votes = {};
  room.tiedPlayerIds = [];
  room.revealedPlayerId = null;
  room.chameleonGuess = null;
  room.winner = null;
  room.abandonedBy = null;
  room.debateEndTime = null;
  room.readySet = new Set();
  room.privateInfo = {};
}

function removePlayer(io, room, socketId) {
  const player = room.players.find((p) => p.id === socketId);
  if (!player) return;

  if (chameleonDisconnectTimers.has(player.pid)) {
    clearTimeout(chameleonDisconnectTimers.get(player.pid));
    chameleonDisconnectTimers.delete(player.pid);
  }

  room.players = room.players.filter((p) => p.id !== socketId);
  if (room.players.length === 0) {
    if (room.debateTimer) clearTimeout(room.debateTimer);
    chameleonRooms.delete(room.code);
    return;
  }
  if (!room.players.some((p) => p.isHost)) room.players[0].isHost = true;
  broadcast(io, room);
}

export function registerChameleonHandlers(io, socket) {
  // ── Create room ──────────────────────────────────────────────────────────────
  socket.on("CHAMELEON_CREATE_ROOM", ({ name, pid } = {}) => {
    let code;
    do { code = generateCode(); } while (chameleonRooms.has(code));

    const hostName = name?.trim().toUpperCase().slice(0, 12) || "HOST";
    const room = {
      code,
      phase: "LOBBY",
      players: [{ id: socket.id, pid: pid || socket.id, name: hostName, isHost: true, connected: true }],
      settings: { playerCount: 5, gridKey: "fastFood", hintsEnabled: false },
      chameleonPid: null,
      chameleonSocketId: null,
      secretCoord: null,
      turnOrder: [],
      currentTurnIdx: 0,
      clues: {},
      clueOrder: [],
      votes: {},
      tiedPlayerIds: [],
      revealedPlayerId: null,
      chameleonGuess: null,
      winner: null,
      debateEndTime: null,
      debateTimer: null,
      readySet: new Set(),
      privateInfo: {},
    };

    chameleonRooms.set(code, room);
    socket.join(roomKey(code));
    socket.data.chameleonRoomCode = code;
    socket.emit("CHAMELEON_ROOM_CREATED", { roomCode: code });
    broadcast(io, room);
  });

  // ── Join room ────────────────────────────────────────────────────────────────
  socket.on("CHAMELEON_JOIN_ROOM", ({ code, name, pid } = {}) => {
    const roomCode = code?.toUpperCase();
    const room = chameleonRooms.get(roomCode);
    if (!room) { socket.emit("CHAMELEON_JOIN_ERROR", { message: "ROOM NOT FOUND" }); return; }
    if (room.phase !== "LOBBY") { socket.emit("CHAMELEON_JOIN_ERROR", { message: "GAME ALREADY IN PROGRESS" }); return; }
    if (room.players.length >= room.settings.playerCount) { socket.emit("CHAMELEON_JOIN_ERROR", { message: "ROOM IS FULL" }); return; }

    const trimmedName = name?.trim().toUpperCase().slice(0, 12);
    if (!trimmedName) { socket.emit("CHAMELEON_JOIN_ERROR", { message: "INVALID NAME" }); return; }

    room.players.push({ id: socket.id, pid: pid || socket.id, name: trimmedName, isHost: false, connected: true });
    socket.join(roomKey(roomCode));
    socket.data.chameleonRoomCode = roomCode;
    broadcast(io, room);
  });

  // ── Reconnect ────────────────────────────────────────────────────────────────
  socket.on("CHAMELEON_RECONNECT", ({ pid, roomCode } = {}) => {
    const room = chameleonRooms.get(roomCode?.toUpperCase());
    if (!room) { socket.emit("CHAMELEON_RECONNECT_FAILED"); return; }

    const player = room.players.find((p) => p.pid === pid);
    if (!player) { socket.emit("CHAMELEON_RECONNECT_FAILED"); return; }

    if (chameleonDisconnectTimers.has(pid)) {
      clearTimeout(chameleonDisconnectTimers.get(pid));
      chameleonDisconnectTimers.delete(pid);
    }

    // Migrate vote and ready references from old socket.id → new socket.id
    if (room.readySet.has(player.id)) { room.readySet.delete(player.id); room.readySet.add(socket.id); }
    if (room.votes[player.id] !== undefined) { room.votes[socket.id] = room.votes[player.id]; delete room.votes[player.id]; }
    if (room.tiedPlayerIds.includes(player.id)) {
      room.tiedPlayerIds = room.tiedPlayerIds.map((id) => id === player.id ? socket.id : id);
    }
    if (room.revealedPlayerId === player.id) room.revealedPlayerId = socket.id;
    if (room.chameleonSocketId === player.id) room.chameleonSocketId = socket.id;

    player.id = socket.id;
    player.connected = true;

    socket.join(roomKey(room.code));
    socket.data.chameleonRoomCode = room.code;

    socket.emit("CHAMELEON_ROOM_UPDATE", buildPayload(room));
    if (room.phase !== "LOBBY") sendPrivateInfo(socket, room);
    broadcast(io, room);
  });

  // ── Update settings ──────────────────────────────────────────────────────────
  socket.on("CHAMELEON_UPDATE_SETTINGS", ({ playerCount, gridKey, hintsEnabled } = {}) => {
    const room = chameleonRooms.get(socket.data.chameleonRoomCode);
    if (!room || room.phase !== "LOBBY") return;
    if (!room.players.find((p) => p.id === socket.id && p.isHost)) return;

    if (playerCount != null) room.settings.playerCount = Math.max(3, Math.min(8, parseInt(playerCount, 10) || 5));
    if (gridKey != null && GRIDS[gridKey]) room.settings.gridKey = gridKey;
    if (hintsEnabled != null) room.settings.hintsEnabled = !!hintsEnabled;
    broadcast(io, room);
  });

  // ── Start game ───────────────────────────────────────────────────────────────
  socket.on("CHAMELEON_START_GAME", () => {
    const room = chameleonRooms.get(socket.data.chameleonRoomCode);
    if (!room || room.phase !== "LOBBY") return;
    if (!room.players.find((p) => p.id === socket.id && p.isHost)) return;
    if (room.players.length !== room.settings.playerCount) return;

    // Assign Chameleon
    const chameleonPlayer = room.players[Math.floor(Math.random() * room.players.length)];
    room.chameleonPid = chameleonPlayer.pid;
    room.chameleonSocketId = chameleonPlayer.id;

    // Pick secret coordinate
    room.secretCoord = pickRandomCoord();

    // Build per-player private info
    room.privateInfo = {};
    for (const player of room.players) {
      const isChameleon = player.pid === room.chameleonPid;
      room.privateInfo[player.pid] = {
        isChameleon,
        secretCoord: isChameleon ? null : room.secretCoord,
        rowHint: (!isChameleon && room.settings.hintsEnabled)
          ? coordToRowHint(room.settings.gridKey, room.secretCoord)
          : null,
      };
    }

    // Randomize turn order (pids)
    room.turnOrder = shuffle(room.players.map((p) => p.pid));
    room.currentTurnIdx = 0;
    room.clues = {};
    room.clueOrder = [];
    room.readySet = new Set();
    room.phase = "ROLE_REVEAL";

    // Send private info to each player individually
    for (const player of room.players) {
      const playerSocket = io.sockets.sockets.get(player.id);
      if (playerSocket) sendPrivateInfo(playerSocket, room);
    }

    broadcast(io, room);
  });

  // ── Player ready (role reveal → clue round) ──────────────────────────────────
  socket.on("CHAMELEON_PLAYER_READY", () => {
    const room = chameleonRooms.get(socket.data.chameleonRoomCode);
    if (!room || room.phase !== "ROLE_REVEAL") return;
    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    room.readySet.add(player.pid);
    const allReady = room.players.every((p) => room.readySet.has(p.pid));
    if (allReady) {
      room.phase = "CLUE_ROUND";
    }
    broadcast(io, room);
  });

  // ── Submit clue ──────────────────────────────────────────────────────────────
  socket.on("CHAMELEON_SUBMIT_CLUE", ({ word } = {}) => {
    const room = chameleonRooms.get(socket.data.chameleonRoomCode);
    if (!room || room.phase !== "CLUE_ROUND") return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    const expectedPid = room.turnOrder[room.currentTurnIdx];
    if (player.pid !== expectedPid) return;

    const cleanWord = word?.trim().toUpperCase();
    if (!cleanWord || /\s/.test(cleanWord)) return; // must be one word

    room.clues[player.pid] = cleanWord;
    room.clueOrder.push(player.pid);
    room.currentTurnIdx++;

    if (room.currentTurnIdx >= room.turnOrder.length) {
      room.phase = "DEBATE";
      room.debateEndTime = Date.now() + DEBATE_MS;
      room.debateTimer = setTimeout(() => {
        const r = chameleonRooms.get(room.code);
        if (r && r.phase === "DEBATE") {
          r.phase = "VOTE";
          r.debateTimer = null;
          broadcast(io, r);
        }
      }, DEBATE_MS);
    }

    broadcast(io, room);
  });

  // ── End debate early (host) ───────────────────────────────────────────────────
  socket.on("CHAMELEON_END_DEBATE_EARLY", () => {
    const room = chameleonRooms.get(socket.data.chameleonRoomCode);
    if (!room || room.phase !== "DEBATE") return;
    if (!room.players.find((p) => p.id === socket.id && p.isHost)) return;

    if (room.debateTimer) { clearTimeout(room.debateTimer); room.debateTimer = null; }
    room.phase = "VOTE";
    broadcast(io, room);
  });

  // ── Submit vote ───────────────────────────────────────────────────────────────
  socket.on("CHAMELEON_SUBMIT_VOTE", ({ targetId } = {}) => {
    const room = chameleonRooms.get(socket.data.chameleonRoomCode);
    if (!room || room.phase !== "VOTE") return;
    if (room.votes[socket.id] !== undefined) return; // already voted

    const voter = room.players.find((p) => p.id === socket.id);
    const target = room.players.find((p) => p.id === targetId);
    if (!voter || !target || voter.id === target.id) return;

    room.votes[socket.id] = targetId;

    if (Object.keys(room.votes).length >= room.players.length) {
      resolveVotes(io, room);
    } else {
      broadcast(io, room);
    }
  });

  // ── Host breaks tie ───────────────────────────────────────────────────────────
  socket.on("CHAMELEON_BREAK_TIE", ({ targetId } = {}) => {
    const room = chameleonRooms.get(socket.data.chameleonRoomCode);
    if (!room || room.phase !== "TIE_BREAK") return;
    if (!room.players.find((p) => p.id === socket.id && p.isHost)) return;
    if (!room.tiedPlayerIds.includes(targetId)) return;

    room.revealedPlayerId = targetId;
    room.tiedPlayerIds = [];
    advanceAfterReveal(io, room);
  });

  // ── Chameleon submits guess ───────────────────────────────────────────────────
  socket.on("CHAMELEON_SUBMIT_GUESS", ({ word } = {}) => {
    const room = chameleonRooms.get(socket.data.chameleonRoomCode);
    if (!room || room.phase !== "CHAMELEON_GUESS") return;
    if (socket.id !== room.chameleonSocketId) return;

    const cleanWord = word?.trim().toUpperCase();
    if (!cleanWord) return;

    room.chameleonGuess = cleanWord;
    const secretWord = coordToWord(room.settings.gridKey, room.secretCoord)?.toUpperCase();
    room.winner = cleanWord === secretWord ? "CHAMELEON" : "CREW";
    room.phase = "REVEAL";
    broadcast(io, room);
  });

  // ── Play again ────────────────────────────────────────────────────────────────
  socket.on("CHAMELEON_PLAY_AGAIN", () => {
    const room = chameleonRooms.get(socket.data.chameleonRoomCode);
    if (!room || room.phase !== "REVEAL") return;
    if (!room.players.find((p) => p.id === socket.id && p.isHost)) return;
    resetRoom(room);
    broadcast(io, room);
  });

  // ── Leave ─────────────────────────────────────────────────────────────────────
  socket.on("CHAMELEON_LEAVE", () => {
    const roomCode = socket.data.chameleonRoomCode;
    if (!roomCode) return;
    const room = chameleonRooms.get(roomCode);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.id);
    const wasInGame = room.phase !== "LOBBY" && room.phase !== "REVEAL";

    socket.data.chameleonRoomCode = null;
    socket.leave(roomKey(roomCode));

    if (player && wasInGame) {
      // End the game for remaining players
      if (room.debateTimer) { clearTimeout(room.debateTimer); room.debateTimer = null; }
      room.players = room.players.filter((p) => p.id !== socket.id);
      if (room.players.length === 0) { chameleonRooms.delete(roomCode); return; }
      if (!room.players.some((p) => p.isHost)) room.players[0].isHost = true;
      room.phase = "REVEAL";
      room.winner = "ABANDONED";
      room.abandonedBy = player.name;
      broadcast(io, room);
    } else {
      removePlayer(io, room, socket.id);
    }
  });

  // ── Disconnect ────────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const roomCode = socket.data.chameleonRoomCode;
    if (!roomCode) return;
    const room = chameleonRooms.get(roomCode);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;
    player.connected = false;

    const timer = setTimeout(() => {
      chameleonDisconnectTimers.delete(player.pid);
      const r = chameleonRooms.get(roomCode);
      if (!r) return;
      removePlayer(io, r, player.id);
    }, DISCONNECT_GRACE_MS);
    chameleonDisconnectTimers.set(player.pid, timer);

    broadcast(io, room);
  });
}
