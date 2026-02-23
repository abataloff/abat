import { WebSocketServer, WebSocket } from 'ws';
import { Room } from './room';
import { ClientMessage } from '../net/protocol';

const PORT = 8051;
const ROOM_CLEANUP_INTERVAL = 60_000;

const rooms = new Map<string, Room>();
const clientRooms = new Map<WebSocket, { room: Room; playerId: number }>();

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let code: string;
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));
  return code;
}

function sendError(ws: WebSocket, message: string, code: string): void {
  ws.send(JSON.stringify({ type: 'error', message, code }));
}

function handleMessage(ws: WebSocket, data: string): void {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(data);
  } catch {
    sendError(ws, 'Invalid JSON', 'PARSE_ERROR');
    return;
  }

  switch (msg.type) {
    case 'create-room': {
      const code = generateCode();
      const room = new Room(code, msg.config);
      rooms.set(code, room);

      const playerId = room.addPlayer(ws, msg.playerName);
      if (playerId === null) {
        sendError(ws, 'Failed to create room', 'CREATE_FAILED');
        return;
      }

      clientRooms.set(ws, { room, playerId });

      ws.send(JSON.stringify({
        type: 'room-created',
        roomCode: code,
        playerId,
        config: msg.config,
      }));
      break;
    }

    case 'join-room': {
      const code = msg.roomCode.toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        sendError(ws, 'Комната не найдена', 'ROOM_NOT_FOUND');
        return;
      }
      if (room.isStarted) {
        sendError(ws, 'Игра уже началась', 'GAME_STARTED');
        return;
      }

      const playerId = room.addPlayer(ws, msg.playerName);
      if (playerId === null) {
        sendError(ws, 'Комната заполнена', 'ROOM_FULL');
        return;
      }

      clientRooms.set(ws, { room, playerId });

      ws.send(JSON.stringify({
        type: 'room-joined',
        roomCode: code,
        playerId,
        config: room.config,
        players: room.getPlayerInfoList(),
      }));

      // Notify others
      for (const [otherWs, info] of clientRooms) {
        if (otherWs !== ws && info.room === room) {
          otherWs.send(JSON.stringify({
            type: 'player-joined',
            players: room.getPlayerInfoList(),
          }));
        }
      }

      // Auto-start when full
      room.tryStart();
      break;
    }

    case 'submit-orders': {
      const info = clientRooms.get(ws);
      if (!info) {
        sendError(ws, 'Not in a room', 'NOT_IN_ROOM');
        return;
      }
      info.room.submitOrders(info.playerId, msg.moves);
      break;
    }

    default:
      sendError(ws, 'Unknown message type', 'UNKNOWN_TYPE');
  }
}

function handleDisconnect(ws: WebSocket): void {
  const info = clientRooms.get(ws);
  if (!info) return;

  info.room.handleDisconnect(info.playerId);
  clientRooms.delete(ws);
}

// Cleanup empty rooms periodically
setInterval(() => {
  for (const [code, room] of rooms) {
    if (room.isEmpty) {
      rooms.delete(code);
    }
  }
}, ROOM_CLEANUP_INTERVAL);

// Start server
const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    handleMessage(ws, data.toString());
  });

  ws.on('close', () => {
    handleDisconnect(ws);
  });

  ws.on('error', () => {
    handleDisconnect(ws);
  });
});

console.log(`Game server listening on ws://localhost:${PORT}`);
