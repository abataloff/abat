import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { setupWebSocket, setWsUser } from './game';
import { initDb } from './db';
import { matchRoute, sendJson } from './router';
import { registerAuthRoutes, getUserFromRequest } from './auth';
import { registerAdminRoutes } from './admin';

const PORT = Number(process.env.PORT) || 8051;

initDb();
registerAuthRoutes();
registerAdminRoutes();

const server = createServer((req, res) => {
  const method = req.method || 'GET';
  const url = req.url || '/';

  const route = matchRoute(method, url);
  if (route) {
    route.handler(req, res, route.params);
    return;
  }

  sendJson(res, { error: 'Not found' }, 404);
});

const wss = new WebSocketServer({ noServer: true });
setupWebSocket(wss);

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') {
    const user = getUserFromRequest(req);
    const userId = user ? user.id : null;

    wss.handleUpgrade(req, socket, head, (ws) => {
      setWsUser(ws, userId);
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`Dev server listening on http://localhost:${PORT}`);
});
