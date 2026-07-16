// ── Two Rooms and a Boom — server module ─────────────────────────────────────
// Mirrors the structure of server/chameleon/index.js.
// Uses socket.data.trRoomCode to namespace from Mafia / Chameleon.
// Socket.IO room key: "tr:XXXX"

const DISCONNECT_GRACE_MS = 60_000;
const trRooms = new Map();            // code → room
const trDisconnectTimers = new Map(); // pid → Timeout

// ── Constants ─────────────────────────────────────────────────────────────────

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genCode() {
  let s = "";
  for (let i = 0; i < 4; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
  return s;
}

// Hostage count for a given round.
// 3-round base: 6-10→1, 11-21→2, 22+→3
// 5-round: add 2 to base, then drop by 1 each round (floor 1)
function hostageCount(playerCount, roundNum, totalRounds) {
  let base = playerCount >= 22 ? 3 : playerCount >= 11 ? 2 : 1;
  if (totalRounds === 5) base += 2;
  return Math.max(1, base - (roundNum - 1));
}

// Round timer in seconds
function roundDuration(roundNum, totalRounds) {
  const durations3 = [180, 120, 60];
  const durations5 = [300, 240, 180, 120, 60];
  return (totalRounds === 5 ? durations5 : durations3)[roundNum - 1] ?? 60;
}

// Strict majority threshold for overthrow
function overthrowThreshold(roomSize) {
  return Math.floor(roomSize / 2) + 1;
}

// ── Room factory ──────────────────────────────────────────────────────────────

function createRoom(code) {
  return {
    code,
    state: "LOBBY",
    // players: Map pid → player object
    players: new Map(),
    // pid lookup by current socket id
    socketToPid: new Map(),
    settings: { rounds: 3, playerCount: 6 },
    currentRound: 0,
    // Timer
    timerEnd: null,
    timerInterval: null,
    // Room membership: Set of pids
    roomA: new Set(),
    roomB: new Set(),
    // Leaders (pids)
    roomALeader: null,
    roomBLeader: null,
    // Previous leader (for abdication "no hand-back" rule): { A: pid|null, B: pid|null }
    prevLeader: { A: null, B: null },
    // Set of pids who abdicated this round
    abdicatedThisRound: new Set(),
    // Overthrow pointing: Map pid → target pid
    pointingAt: new Map(),
    // Share requests: key `${pid1}-${pid2}` → { requesterId, targetId, level }
    shareRequests: new Map(),
    // Hostage selection
    hostagePicksA: [],
    hostagePicksB: [],
    hostageSubmittedA: false,
    hostageSubmittedB: false,
    // Parlay
    parlayReadyA: false,
    parlayReadyB: false,
    // Migration info (revealed at start of next round in payload)
    lastArrivalsA: [], // pids who just arrived in Room A
    lastArrivalsB: [], // pids who just arrived in Room B
    winner: null,
    abandonedBy: null,
  };
}

function createPlayer(id, pid, name, isHost) {
  return {
    id,        // socket id
    pid,
    name,
    isHost,
    connected: true,
    // Set during game start
    team: null,       // "BLUE" | "RED"
    role: null,       // "PRESIDENT" | "BOMBER" | null
    currentRoom: null, // "A" | "B"
    // Per-player share knowledge: Map targetPid → { team?, role? }
    knownInfo: new Map(),
  };
}

// ── Payload helpers ───────────────────────────────────────────────────────────

function buildPublicPayload(room) {
  const isBoom = room.state === "BOOM";
  const players = [];
  for (const p of room.players.values()) {
    players.push({
      pid: p.pid,
      name: p.name,
      isHost: p.isHost,
      connected: p.connected,
      currentRoom: p.currentRoom,
      // Reveal identities only on the Boom screen
      team: isBoom ? p.team : undefined,
      role: isBoom ? p.role : undefined,
    });
  }

  // Overthrow points as plain object { pid: targetPid }
  const pointing = {};
  for (const [pid, tgt] of room.pointingAt) pointing[pid] = tgt;

  return {
    roomCode: room.code,
    state: room.state,
    currentRound: room.currentRound,
    settings: room.settings,
    timerEnd: room.timerEnd,
    players,
    roomA: [...room.roomA],
    roomB: [...room.roomB],
    roomALeader: room.roomALeader,
    roomBLeader: room.roomBLeader,
    pointing,
    hostageSubmittedA: room.hostageSubmittedA,
    hostageSubmittedB: room.hostageSubmittedB,
    parlayReadyA: room.parlayReadyA,
    parlayReadyB: room.parlayReadyB,
    lastArrivalsA: room.lastArrivalsA,
    lastArrivalsB: room.lastArrivalsB,
    winner: room.winner,
    abandonedBy: room.abandonedBy,
  };
}

function buildPrivateInfo(room, pid) {
  const p = room.players.get(pid);
  if (!p) return null;

  // What does this player know about others (via shares)?
  const knownPlayers = {};
  for (const [tgt, info] of p.knownInfo) knownPlayers[tgt] = info;

  // Hostage picks visible to own room (once submitted, during PARLAY or HOSTAGE_SELECT for leader)
  let myRoomPicks = null;
  const myRoom = p.currentRoom;
  if (myRoom === "A" && room.hostageSubmittedA) myRoomPicks = room.hostagePicksA;
  if (myRoom === "B" && room.hostageSubmittedB) myRoomPicks = room.hostagePicksB;
  // During HOSTAGE_SELECT, only the leader sees the picks UI (not submitted yet)
  if (room.state === "HOSTAGE_SELECT") {
    if (myRoom === "A" && room.roomALeader === pid) myRoomPicks = room.hostagePicksA;
    if (myRoom === "B" && room.roomBLeader === pid) myRoomPicks = room.hostagePicksB;
  }

  // Abdicated this round?
  const abdicatedThisRound = room.abdicatedThisRound.has(pid);

  return {
    team: p.team,
    role: p.role,
    knownPlayers,
    myRoomPicks,
    abdicatedThisRound,
  };
}

// ── Broadcast ─────────────────────────────────────────────────────────────────

function broadcast(io, room) {
  io.to(`tr:${room.code}`).emit("TR_ROOM_UPDATE", buildPublicPayload(room));
}

function broadcastPrivate(io, room) {
  for (const p of room.players.values()) {
    if (!p.connected) continue;
    const info = buildPrivateInfo(room, p.pid);
    if (info) io.to(p.id).emit("TR_PRIVATE_INFO", info);
  }
}

function broadcastAll(io, room) {
  broadcast(io, room);
  broadcastPrivate(io, room);
}

// ── Game logic ────────────────────────────────────────────────────────────────

function assignTeamsAndRoles(room) {
  const pids = [...room.players.keys()];
  // Shuffle
  for (let i = pids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pids[i], pids[j]] = [pids[j], pids[i]];
  }
  const half = Math.floor(pids.length / 2);
  const bluePids = pids.slice(0, half + (pids.length % 2)); // blue gets extra if odd
  const redPids = pids.slice(bluePids.length);

  for (const pid of bluePids) room.players.get(pid).team = "BLUE";
  for (const pid of redPids) room.players.get(pid).team = "RED";

  // Assign special roles
  const shuffledBlue = [...bluePids].sort(() => Math.random() - 0.5);
  const shuffledRed = [...redPids].sort(() => Math.random() - 0.5);
  room.players.get(shuffledBlue[0]).role = "PRESIDENT";
  room.players.get(shuffledRed[0]).role = "BOMBER";
}

function splitRooms(room) {
  const pids = [...room.players.keys()].sort(() => Math.random() - 0.5);
  const half = Math.ceil(pids.length / 2); // Room A gets the extra if odd
  room.roomA = new Set(pids.slice(0, half));
  room.roomB = new Set(pids.slice(half));
  for (const pid of room.roomA) room.players.get(pid).currentRoom = "A";
  for (const pid of room.roomB) room.players.get(pid).currentRoom = "B";
}

function startRound(io, room) {
  room.state = "ROUND";
  room.pointingAt = new Map();
  room.abdicatedThisRound = new Set();
  room.prevLeader = { A: null, B: null };
  room.hostagePicksA = [];
  room.hostagePicksB = [];
  room.hostageSubmittedA = false;
  room.hostageSubmittedB = false;
  room.parlayReadyA = false;
  room.parlayReadyB = false;

  const durationMs = roundDuration(room.currentRound, room.settings.rounds) * 1000;
  room.timerEnd = Date.now() + durationMs;

  // Clear any existing interval
  if (room.timerInterval) { clearInterval(room.timerInterval); room.timerInterval = null; }

  room.timerInterval = setInterval(() => {
    const r = trRooms.get(room.code);
    if (!r || r.state !== "ROUND") { clearInterval(r?.timerInterval); return; }
    if (Date.now() >= r.timerEnd) {
      clearInterval(r.timerInterval);
      r.timerInterval = null;
      endRound(io, r);
    }
  }, 1000);

  broadcastAll(io, room);
}

function endRound(io, room) {
  room.state = "HOSTAGE_SELECT";
  // Final round: no hostage selection — go straight to parlay
  if (room.currentRound === room.settings.rounds) {
    room.state = "PARLAY";
    room.hostageSubmittedA = true;
    room.hostageSubmittedB = true;
    room.hostagePicksA = [];
    room.hostagePicksB = [];
    broadcastAll(io, room);
    return;
  }
  broadcastAll(io, room);
}

function checkAllSubmitted(io, room) {
  if (!room.hostageSubmittedA || !room.hostageSubmittedB) return;
  room.state = "PARLAY";
  broadcastAll(io, room);
}

function doMigration(room) {
  const toB = [...room.hostagePicksA]; // Room A's hostages go to Room B
  const toA = [...room.hostagePicksB]; // Room B's hostages go to Room A

  for (const pid of toB) {
    room.roomA.delete(pid);
    room.roomB.add(pid);
    room.players.get(pid).currentRoom = "B";
  }
  for (const pid of toA) {
    room.roomB.delete(pid);
    room.roomA.add(pid);
    room.players.get(pid).currentRoom = "A";
  }

  // If a migrating player was a leader, depose them
  if (toB.includes(room.roomALeader)) room.roomALeader = null;
  if (toA.includes(room.roomBLeader)) room.roomBLeader = null;

  room.lastArrivalsA = toA;
  room.lastArrivalsB = toB;
}

function checkParlay(io, room) {
  if (!room.parlayReadyA || !room.parlayReadyB) return;

  const isFinalRound = room.currentRound === room.settings.rounds;

  doMigration(room);

  if (isFinalRound) {
    // Endgame: check if President and Bomber are in same room
    let presidentRoom = null;
    let bomberRoom = null;
    for (const p of room.players.values()) {
      if (p.role === "PRESIDENT") presidentRoom = p.currentRoom;
      if (p.role === "BOMBER") bomberRoom = p.currentRoom;
    }
    room.winner = presidentRoom === bomberRoom ? "RED" : "BLUE";
    room.state = "BOOM";
    if (room.timerInterval) { clearInterval(room.timerInterval); room.timerInterval = null; }
    broadcastAll(io, room);
  } else {
    room.currentRound++;
    startRound(io, room);
  }
}

function checkOverthrow(io, room, roomKey) {
  const inRoom = roomKey === "A" ? [...room.roomA] : [...room.roomB];
  const n = inRoom.length;
  if (n === 0) return;

  // Tally points from players currently in this room
  const tally = {};
  for (const pid of inRoom) {
    const target = room.pointingAt.get(pid);
    if (target && inRoom.includes(target)) {
      tally[target] = (tally[target] || 0) + 1;
    }
  }

  const threshold = overthrowThreshold(n);
  for (const [target, count] of Object.entries(tally)) {
    if (count >= threshold) {
      // Overthrow!
      if (roomKey === "A") room.roomALeader = target;
      else room.roomBLeader = target;
      room.pointingAt = new Map(); // clear all points
      return true;
    }
  }
  return false;
}

// ── Handler registration ──────────────────────────────────────────────────────

export function registerTwoRoomsHandlers(io, socket) {

  // ── Create room ─────────────────────────────────────────────────────────────
  socket.on("TR_CREATE", ({ name, pid } = {}) => {
    if (!name || !pid) return;
    let code;
    do { code = genCode(); } while (trRooms.has(code));

    const room = createRoom(code);
    const player = createPlayer(socket.id, pid, name.toUpperCase().slice(0, 12), true);
    room.players.set(pid, player);
    room.socketToPid.set(socket.id, pid);
    trRooms.set(code, room);

    socket.data.trRoomCode = code;
    socket.join(`tr:${code}`);
    socket.emit("TR_CREATED", { roomCode: code });
    broadcastAll(io, room);
  });

  // ── Join room ───────────────────────────────────────────────────────────────
  socket.on("TR_JOIN", ({ code, name, pid } = {}) => {
    if (!code || !name || !pid) return;
    const room = trRooms.get(code.toUpperCase());
    if (!room) return socket.emit("TR_JOIN_ERROR", { message: "ROOM NOT FOUND" });
    if (room.state !== "LOBBY") return socket.emit("TR_JOIN_ERROR", { message: "GAME IN PROGRESS" });
    if (room.players.size >= room.settings.playerCount)
      return socket.emit("TR_JOIN_ERROR", { message: "ROOM FULL" });
    if ([...room.players.values()].some(p => p.name === name.toUpperCase().slice(0, 12)))
      return socket.emit("TR_JOIN_ERROR", { message: "NAME TAKEN" });

    const player = createPlayer(socket.id, pid, name.toUpperCase().slice(0, 12), false);
    room.players.set(pid, player);
    room.socketToPid.set(socket.id, pid);

    socket.data.trRoomCode = code.toUpperCase();
    socket.join(`tr:${code.toUpperCase()}`);
    broadcastAll(io, room);
  });

  // ── Reconnect ───────────────────────────────────────────────────────────────
  socket.on("TR_RECONNECT", ({ roomCode, pid } = {}) => {
    const room = trRooms.get(roomCode);
    if (!room) return socket.emit("TR_RECONNECT_FAILED");
    const player = room.players.get(pid);
    if (!player) return socket.emit("TR_RECONNECT_FAILED");

    // Cancel pending removal timer
    if (trDisconnectTimers.has(pid)) {
      clearTimeout(trDisconnectTimers.get(pid));
      trDisconnectTimers.delete(pid);
    }

    // Update socket id
    room.socketToPid.delete(player.id);
    player.id = socket.id;
    player.connected = true;
    room.socketToPid.set(socket.id, pid);

    socket.data.trRoomCode = roomCode;
    socket.join(`tr:${roomCode}`);
    socket.emit("TR_CREATED", { roomCode }); // reuse CREATED to trigger client session save
    broadcastAll(io, room);
    // Send this player's private info immediately
    const info = buildPrivateInfo(room, pid);
    if (info) socket.emit("TR_PRIVATE_INFO", info);
  });

  // ── Leave ───────────────────────────────────────────────────────────────────
  socket.on("TR_LEAVE", () => {
    const code = socket.data.trRoomCode;
    if (!code) return;
    const room = trRooms.get(code);
    if (!room) return;
    const pid = room.socketToPid.get(socket.id);
    if (!pid) return;

    socket.leave(`tr:${code}`);
    socket.data.trRoomCode = null;

    if (room.state === "LOBBY") {
      room.players.delete(pid);
      room.socketToPid.delete(socket.id);
      if (room.players.size === 0) { trRooms.delete(code); return; }
      // Transfer host if needed
      if (![...room.players.values()].some(p => p.isHost)) {
        const first = room.players.values().next().value;
        if (first) first.isHost = true;
      }
      broadcastAll(io, room);
    } else {
      // Mid-game: end game for everyone
      const p = room.players.get(pid);
      room.abandonedBy = p?.name ?? "SOMEONE";
      room.winner = "ABANDONED";
      room.state = "BOOM";
      if (room.timerInterval) { clearInterval(room.timerInterval); room.timerInterval = null; }
      broadcastAll(io, room);
    }
  });

  // ── Update settings (host only) ─────────────────────────────────────────────
  socket.on("TR_UPDATE_SETTINGS", (patch = {}) => {
    const code = socket.data.trRoomCode;
    const room = trRooms.get(code);
    if (!room || room.state !== "LOBBY") return;
    const pid = room.socketToPid.get(socket.id);
    const player = room.players.get(pid);
    if (!player?.isHost) return;

    if (patch.rounds && [3, 5].includes(patch.rounds)) room.settings.rounds = patch.rounds;
    if (patch.playerCount) {
      room.settings.playerCount = Math.max(6, Math.min(30, patch.playerCount));
    }
    broadcastAll(io, room);
  });

  // ── Start game (host only) ──────────────────────────────────────────────────
  socket.on("TR_START_GAME", () => {
    const code = socket.data.trRoomCode;
    const room = trRooms.get(code);
    if (!room || room.state !== "LOBBY") return;
    const pid = room.socketToPid.get(socket.id);
    if (!room.players.get(pid)?.isHost) return;
    if (room.players.size !== room.settings.playerCount) return;

    assignTeamsAndRoles(room);
    splitRooms(room);
    room.state = "ROOM_ASSIGNMENT";
    room.currentRound = 1;
    room.lastArrivalsA = [];
    room.lastArrivalsB = [];
    broadcastAll(io, room);
  });

  // ── Host starts Round 1 (from ROOM_ASSIGNMENT) ──────────────────────────────
  socket.on("TR_START_ROUND_ONE", () => {
    const code = socket.data.trRoomCode;
    const room = trRooms.get(code);
    if (!room || room.state !== "ROOM_ASSIGNMENT") return;
    const pid = room.socketToPid.get(socket.id);
    if (!room.players.get(pid)?.isHost) return;
    startRound(io, room);
  });

  // ── Appoint initial leader ───────────────────────────────────────────────────
  socket.on("TR_APPOINT_LEADER", ({ targetPid } = {}) => {
    const code = socket.data.trRoomCode;
    const room = trRooms.get(code);
    if (!room || (room.state !== "ROUND" && room.state !== "ROOM_ASSIGNMENT")) return;
    const pid = room.socketToPid.get(socket.id);
    const player = room.players.get(pid);
    if (!player) return;
    if (targetPid === pid) return; // self-appointment not allowed

    const myRoom = player.currentRoom;
    const targetPlayer = room.players.get(targetPid);
    if (!targetPlayer || targetPlayer.currentRoom !== myRoom) return;

    // Only works if no leader yet in this room
    const currentLeader = myRoom === "A" ? room.roomALeader : room.roomBLeader;
    if (currentLeader) return;

    if (myRoom === "A") room.roomALeader = targetPid;
    else room.roomBLeader = targetPid;

    broadcastAll(io, room);
  });

  // ── Point (overthrow mechanism) ─────────────────────────────────────────────
  socket.on("TR_POINT", ({ targetPid } = {}) => {
    const code = socket.data.trRoomCode;
    const room = trRooms.get(code);
    if (!room || room.state !== "ROUND") return;
    const pid = room.socketToPid.get(socket.id);
    const player = room.players.get(pid);
    if (!player) return;

    const target = room.players.get(targetPid);
    if (!target || target.currentRoom !== player.currentRoom) return;

    // Toggle: if already pointing at same target, unpoint
    if (room.pointingAt.get(pid) === targetPid) {
      room.pointingAt.delete(pid);
    } else {
      room.pointingAt.set(pid, targetPid);
    }

    const overthrown = checkOverthrow(io, room, player.currentRoom);
    if (overthrown) broadcastAll(io, room);
    else broadcast(io, room);
  });

  // ── Abdicate ─────────────────────────────────────────────────────────────────
  socket.on("TR_ABDICATE", ({ targetPid } = {}) => {
    const code = socket.data.trRoomCode;
    const room = trRooms.get(code);
    if (!room || room.state !== "ROUND") return;
    const pid = room.socketToPid.get(socket.id);
    const player = room.players.get(pid);
    if (!player) return;

    const myRoom = player.currentRoom;
    const currentLeader = myRoom === "A" ? room.roomALeader : room.roomBLeader;
    if (currentLeader !== pid) return; // must be current leader

    const target = room.players.get(targetPid);
    if (!target || target.currentRoom !== myRoom) return;
    if (targetPid === pid) return;

    // Can't hand back to whoever gave it to you (prevLeader for this room)
    if (room.prevLeader[myRoom] === targetPid) return;

    // Record abdication
    room.abdicatedThisRound.add(pid);
    room.prevLeader[myRoom] = pid;

    if (myRoom === "A") room.roomALeader = targetPid;
    else room.roomBLeader = targetPid;

    broadcast(io, room);
    broadcastPrivate(io, room); // update abdicatedThisRound in private info
  });

  // ── Request share ─────────────────────────────────────────────────────────────
  socket.on("TR_REQUEST_SHARE", ({ targetPid, level } = {}) => {
    // level: "COLOR" | "CARD"
    const code = socket.data.trRoomCode;
    const room = trRooms.get(code);
    if (!room || room.state !== "ROUND") return;
    const pid = room.socketToPid.get(socket.id);
    const player = room.players.get(pid);
    if (!player || !["COLOR", "CARD"].includes(level)) return;

    const target = room.players.get(targetPid);
    if (!target || target.currentRoom !== player.currentRoom || targetPid === pid) return;

    // Key is canonical (sorted) so both sides see same entry
    const key = [pid, targetPid].sort().join("-");
    const existing = room.shareRequests.get(key);

    if (!existing) {
      // Create new request
      room.shareRequests.set(key, { requesterId: pid, targetId: targetPid, level });
    } else if (existing.requesterId !== pid) {
      // Other side already requested — check if levels match
      if (existing.level === level) {
        // Resolve the share!
        room.shareRequests.delete(key);
        resolveShare(io, room, existing.requesterId, pid, level);
        return;
      } else {
        // Levels don't match — update to this player's request (overwrite)
        room.shareRequests.set(key, { requesterId: pid, targetId: targetPid, level });
      }
    } else {
      // Same requester updating their level — update
      existing.level = level;
    }

    // Notify both players of pending share
    notifySharePending(io, room, pid, targetPid, key);
  });

  // ── Cancel share request ─────────────────────────────────────────────────────
  socket.on("TR_CANCEL_SHARE", ({ targetPid } = {}) => {
    const code = socket.data.trRoomCode;
    const room = trRooms.get(code);
    if (!room) return;
    const pid = room.socketToPid.get(socket.id);
    const key = [pid, targetPid].sort().join("-");
    if (room.shareRequests.get(key)?.requesterId === pid) {
      room.shareRequests.delete(key);
    }
  });

  // ── Submit hostage picks (leader only) ───────────────────────────────────────
  socket.on("TR_SUBMIT_HOSTAGES", ({ picks } = {}) => {
    const code = socket.data.trRoomCode;
    const room = trRooms.get(code);
    if (!room || room.state !== "HOSTAGE_SELECT") return;
    const pid = room.socketToPid.get(socket.id);
    const player = room.players.get(pid);
    if (!player) return;

    const myRoom = player.currentRoom;
    const currentLeader = myRoom === "A" ? room.roomALeader : room.roomBLeader;
    if (currentLeader !== pid) return;

    // Validate picks
    const required = hostageCount(room.players.size, room.currentRound, room.settings.rounds);
    if (!Array.isArray(picks) || picks.length !== required) return;

    // Picks must be valid pids in this room, not the leader
    const roomSet = myRoom === "A" ? room.roomA : room.roomB;
    for (const p of picks) {
      if (!roomSet.has(p) || p === pid) return;
    }

    if (myRoom === "A") {
      room.hostagePicksA = picks;
      room.hostageSubmittedA = true;
    } else {
      room.hostagePicksB = picks;
      room.hostageSubmittedB = true;
    }

    broadcastAll(io, room);
    checkAllSubmitted(io, room);
  });

  // ── Parlay ready (leader only) ───────────────────────────────────────────────
  socket.on("TR_PARLAY_READY", () => {
    const code = socket.data.trRoomCode;
    const room = trRooms.get(code);
    if (!room || room.state !== "PARLAY") return;
    const pid = room.socketToPid.get(socket.id);

    if (room.roomALeader === pid) room.parlayReadyA = true;
    else if (room.roomBLeader === pid) room.parlayReadyB = true;
    else return;

    broadcast(io, room);
    checkParlay(io, room);
  });

  // ── Play again ───────────────────────────────────────────────────────────────
  socket.on("TR_PLAY_AGAIN", () => {
    const code = socket.data.trRoomCode;
    const room = trRooms.get(code);
    if (!room || room.state !== "BOOM") return;
    const pid = room.socketToPid.get(socket.id);
    if (!room.players.get(pid)?.isHost) return;

    // Reset to lobby
    room.state = "LOBBY";
    room.currentRound = 0;
    room.timerEnd = null;
    room.roomA = new Set();
    room.roomB = new Set();
    room.roomALeader = null;
    room.roomBLeader = null;
    room.pointingAt = new Map();
    room.shareRequests = new Map();
    room.hostagePicksA = [];
    room.hostagePicksB = [];
    room.hostageSubmittedA = false;
    room.hostageSubmittedB = false;
    room.parlayReadyA = false;
    room.parlayReadyB = false;
    room.lastArrivalsA = [];
    room.lastArrivalsB = [];
    room.winner = null;
    room.abandonedBy = null;
    room.abdicatedThisRound = new Set();
    room.prevLeader = { A: null, B: null };
    for (const p of room.players.values()) {
      p.team = null;
      p.role = null;
      p.currentRoom = null;
      p.knownInfo = new Map();
    }
    broadcastAll(io, room);
  });

  // ── Disconnect ───────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const code = socket.data.trRoomCode;
    if (!code) return;
    const room = trRooms.get(code);
    if (!room) return;

    const pid = room.socketToPid.get(socket.id);
    if (!pid) return;
    const player = room.players.get(pid);
    if (!player) return;

    player.connected = false;

    if (room.state === "LOBBY") {
      // In lobby: immediate removal
      room.players.delete(pid);
      room.socketToPid.delete(socket.id);
      if (room.players.size === 0) { trRooms.delete(code); return; }
      if (![...room.players.values()].some(p => p.isHost)) {
        const first = room.players.values().next().value;
        if (first) first.isHost = true;
      }
      broadcastAll(io, room);
      return;
    }

    // In game: 60s grace period (per spec — same as Mafia host disconnect handling)
    broadcast(io, room); // show disconnected state

    const timer = setTimeout(() => {
      trDisconnectTimers.delete(pid);
      const r = trRooms.get(code);
      if (!r) return;
      // If leader disconnected and timed out, clear their leader status
      if (r.roomALeader === pid) r.roomALeader = null;
      if (r.roomBLeader === pid) r.roomBLeader = null;
      r.players.delete(pid);
      r.socketToPid.delete(socket.id);
      r.roomA.delete(pid);
      r.roomB.delete(pid);
      if (r.players.size === 0) { trRooms.delete(code); return; }
      broadcastAll(io, r);
    }, DISCONNECT_GRACE_MS);
    trDisconnectTimers.set(pid, timer);
  });
}

// ── Share helpers (private) ───────────────────────────────────────────────────

function resolveShare(io, room, pid1, pid2, level) {
  const p1 = room.players.get(pid1);
  const p2 = room.players.get(pid2);
  if (!p1 || !p2) return;

  const info1 = { team: p2.team };
  const info2 = { team: p1.team };
  if (level === "CARD") {
    info1.role = p2.role;
    info2.role = p1.role;
  }

  // Merge into existing known info
  const existing1 = p1.knownInfo.get(pid2) || {};
  p1.knownInfo.set(pid2, { ...existing1, ...info1 });
  const existing2 = p2.knownInfo.get(pid1) || {};
  p2.knownInfo.set(pid1, { ...existing2, ...info2 });

  // Send private share result to each participant
  const sock1 = [...room.socketToPid.entries()].find(([, p]) => p === pid1)?.[0];
  const sock2 = [...room.socketToPid.entries()].find(([, p]) => p === pid2)?.[0];
  if (sock1) io.to(sock1).emit("TR_SHARE_RESOLVED", { withPid: pid2, level, info: info1 });
  if (sock2) io.to(sock2).emit("TR_SHARE_RESOLVED", { withPid: pid1, level, info: info2 });

  // Update their private info
  const priv1 = buildPrivateInfo(room, pid1);
  const priv2 = buildPrivateInfo(room, pid2);
  if (sock1 && priv1) io.to(sock1).emit("TR_PRIVATE_INFO", priv1);
  if (sock2 && priv2) io.to(sock2).emit("TR_PRIVATE_INFO", priv2);
}

function notifySharePending(io, room, pid1, pid2, key) {
  const request = room.shareRequests.get(key);
  const sock1 = [...room.socketToPid.entries()].find(([, p]) => p === pid1)?.[0];
  const sock2 = [...room.socketToPid.entries()].find(([, p]) => p === pid2)?.[0];
  // Notify both sides of the pending request so the UI can show "waiting" state
  if (sock1) io.to(sock1).emit("TR_SHARE_PENDING", { withPid: pid2, yourLevel: request.requesterId === pid1 ? request.level : null });
  if (sock2) io.to(sock2).emit("TR_SHARE_PENDING", { withPid: pid1, yourLevel: request.requesterId === pid2 ? request.level : null });
}
