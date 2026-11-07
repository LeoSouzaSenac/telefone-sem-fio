import express from 'express';
import cors from 'cors';
import http from 'node:http';
import crypto from 'node:crypto';
import { Server } from 'socket.io';

const PORT = process.env.PORT || 3001;
const allowed = (process.env.CLIENT_ORIGIN || '*').split(',').map(s => s.trim());
const corsOrigin = allowed.includes('*') ? true : allowed;
const app = express();
app.use(cors({ origin: corsOrigin }));
app.get('/health', (_, res) => res.json({ ok: true, rooms: rooms.size }));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: corsOrigin }, maxHttpBufferSize: 850_000 });
const rooms = new Map();
const MAX_PLAYERS = 10;
const STEP_SECONDS = 150;
const roomCode = () => {
  let code;
  do { code = crypto.randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(code));
  return code;
};
const fail = (ack, message) => ack?.({ ok: false, error: message });
const ok = (ack, extra = {}) => ack?.({ ok: true, ...extra });
const sanitize = (v, max) => String(v ?? '').trim().slice(0, max);
const current = socket => {
  const code = socket.data.code;
  const room = rooms.get(code);
  const player = room?.players.find(p => p.id === socket.data.playerId);
  return { room, player };
};
const snapshot = room => ({
  code: room.code, phase: room.phase, hostId: room.hostId,
  players: room.players.map(({ id, name, connected }) => ({ id, name, connected })),
  step: room.step, totalSteps: room.players.length,
  submittedCount: Object.keys(room.submissions).length,
  deadline: room.deadline,
});
const broadcast = room => io.to(room.code).emit('room:state', snapshot(room));
function submitForPlayer(room, playerId, item) {
  if (room.phase !== 'playing' || Object.hasOwn(room.submissions, playerId)) return;
  const count = room.players.length;
  const index = room.players.findIndex(p => p.id === playerId);
  if (index === -1) return;
  const albumIndex = (index - room.step + count) % count;
  const album = room.albums[albumIndex];
  album.entries.push({ playerId, name: room.players[index].name, type: room.step % 2 === 0 ? 'text' : 'drawing', value: item });
  room.submissions[playerId] = true;
}
function dispatchTurns(room) {
  const count = room.players.length;
  for (let i = 0; i < count; i++) {
    const player = room.players[i];
    if (!player.connected) continue;
    const albumIndex = (i - room.step + count) % count;
    const album = room.albums[albumIndex];
    const previous = album.entries.at(-1) || null;
    io.to(player.socketId).emit('game:turn', {
      step: room.step, totalSteps: count,
      type: room.step % 2 === 0 ? 'text' : 'drawing',
      previous: room.step === 0 ? null : (previous ? { type: previous.type, value: previous.value } : null),
      submitted: Boolean(room.submissions[player.id]),
      deadline: room.deadline,
    });
  }
}
function advance(room) {
  clearTimeout(room.timer);
  if (room.step + 1 >= room.players.length) {
    room.phase = 'reveal';
    room.deadline = null;
    io.to(room.code).emit('game:reveal', room.albums);
    broadcast(room);
    return;
  }
  room.step++;
  room.submissions = {};
  room.deadline = Date.now() + STEP_SECONDS * 1000;
  dispatchTurns(room);
  broadcast(room);
  for (const p of room.players) {
    if (!p.connected) submitForPlayer(room, p.id, room.step % 2 === 0 ? '(jogador ausente)' : '');
  }
  if (Object.keys(room.submissions).length === room.players.length) advance(room);
  else { broadcast(room); room.timer = setTimeout(() => expireStep(room), STEP_SECONDS * 1000); }
}
function expireStep(room) {
  if (room.phase !== 'playing') return;
  for (const p of room.players) {
    if (!room.submissions[p.id]) submitForPlayer(room, p.id, room.step % 2 === 0 ? '(sem resposta)' : '');
  }
  advance(room);
}
function leaveSocket(socket) {
  const { room, player } = current(socket);
  if (!room || !player || player.socketId !== socket.id) return;
  socket.leave(room.code);
  player.connected = false;
  player.socketId = null;
  if (room.phase === 'lobby') {
    room.players = room.players.filter(p => p.id !== player.id);
    if (!room.players.length) {
      clearTimeout(room.timer);
      rooms.delete(room.code);
      return;
    }
    if (room.hostId === player.id) room.hostId = room.players[0].id;
  } else if (room.phase === 'playing') {
    if (!room.submissions[player.id]) {
      submitForPlayer(room, player.id, room.step % 2 === 0 ? '(jogador saiu)' : '');
      if (Object.keys(room.submissions).length === room.players.length) { advance(room); return; }
    }
  }
  broadcast(room);
}

io.on('connection', socket => {
  socket.on('room:create', ({ name, token } = {}, ack) => {
    if (socket.data.code) return fail(ack, 'Você já está em uma sala.');
    name = sanitize(name, 22);
    if (!name) return fail(ack, 'Informe seu apelido.');
    const code = roomCode();
    const playerId = crypto.randomUUID();
    const room = { code, phase: 'lobby', players: [{ id: playerId, name, token: sanitize(token, 100) || crypto.randomUUID(), connected: true, socketId: socket.id }], hostId: playerId, step: 0, submissions: {}, albums: [], deadline: null, timer: null };
    rooms.set(code, room);
    socket.join(code);
    socket.data = { code, playerId };
    ok(ack, { code, playerId, token: room.players[0].token });
    broadcast(room);
  });
  socket.on('room:join', ({ code, name, token } = {}, ack) => {
    if (socket.data.code) return fail(ack, 'Você já está em uma sala.');
    code = sanitize(code, 6).toUpperCase();
    name = sanitize(name, 22);
    const room = rooms.get(code);
    if (!room) return fail(ack, 'Sala não encontrada.');
    const known = token && room.players.find(p => p.token === token);
    if (!known && room.phase !== 'lobby') return fail(ack, 'Essa partida já começou.');
    if (!known && room.players.length >= MAX_PLAYERS) return fail(ack, 'Sala lotada.');
    if (!known && !name) return fail(ack, 'Informe seu apelido.');
    const player = known || { id: crypto.randomUUID(), name, token: crypto.randomUUID() };
    if (!known) room.players.push(player);
    if (known?.socketId) {
      const old = io.sockets.sockets.get(known.socketId);
      if (old) { old.data = {}; old.disconnect(true); }
    }
    player.connected = true;
    player.socketId = socket.id;
    socket.join(code);
    socket.data = { code, playerId: player.id };
    ok(ack, { code, playerId: player.id, token: player.token });
    if (room.phase === 'playing') dispatchTurns(room);
    if (room.phase === 'reveal') socket.emit('game:reveal', room.albums);
    broadcast(room);
  });
  socket.on('game:start', (_, ack) => {
    const { room, player } = current(socket);
    if (!room || !player) return fail(ack, 'Entre em uma sala primeiro.');
    if (room.hostId !== player.id) return fail(ack, 'Apenas o anfitrião inicia.');
    if (room.phase !== 'lobby' && room.phase !== 'reveal') return fail(ack, 'Partida em andamento.');
    if (room.players.length < 2) return fail(ack, 'São necessários pelo menos 2 jogadores.');
    if (room.players.some(p => !p.connected)) return fail(ack, 'Espere todos voltarem para iniciar outra partida.');
    clearTimeout(room.timer);
    room.phase = 'playing'; room.step = 0; room.submissions = {};
    room.albums = room.players.map(p => ({ creatorId: p.id, creatorName: p.name, entries: [] }));
    room.deadline = Date.now() + STEP_SECONDS * 1000;
    ok(ack);
    dispatchTurns(room);
    broadcast(room);
    room.timer = setTimeout(() => expireStep(room), STEP_SECONDS * 1000);
  });
  socket.on('game:submit', ({ value } = {}, ack) => {
    const { room, player } = current(socket);
    if (!room || !player || room.phase !== 'playing') return fail(ack, 'Partida indisponível.');
    if (room.submissions[player.id]) return fail(ack, 'Você já enviou sua resposta.');
    if (room.step % 2 === 0) {
      value = sanitize(value, 160);
      if (!value) return fail(ack, 'Escreva uma frase.');
    } else {
      if (typeof value !== 'string' || !/^data:image\/jpeg;base64,[a-zA-Z0-9+/=]+$/.test(value) || value.length > 700_000) return fail(ack, 'Desenho inválido ou muito grande.');
    }
    submitForPlayer(room, player.id, value);
    ok(ack);
    if (Object.keys(room.submissions).length === room.players.length) advance(room);
    else broadcast(room);
  });
  socket.on('room:leave', (_, ack) => { leaveSocket(socket); socket.data = {}; ok(ack); });
  socket.on('disconnect', () => leaveSocket(socket));
});
setInterval(() => {
  for (const [code, room] of rooms) {
    if (room.players.every(p => !p.connected)) {
      if (!room.emptySince) room.emptySince = Date.now();
      if (Date.now() - room.emptySince > 30 * 60 * 1000) { clearTimeout(room.timer); rooms.delete(code); }
    } else room.emptySince = null;
  }
}, 60_000).unref();
server.listen(PORT, '0.0.0.0', () => console.log(`Servidor na porta ${PORT}`));
