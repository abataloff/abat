import { WebSocketServer } from 'ws';
import { setupWebSocket } from './game';

const PORT = Number(process.env.PORT) || 8051;

const wss = new WebSocketServer({ port: PORT });
setupWebSocket(wss);

console.log(`Game server listening on ws://localhost:${PORT}`);
