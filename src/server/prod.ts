import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { WebSocketServer } from 'ws';
import { setupWebSocket } from './game';

const STATIC_DIR = join(__dirname, '../../dist');
const PORT = Number(process.env.PORT) || 8051;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

const server = createServer((req, res) => {
  let filePath = join(STATIC_DIR, req.url === '/' ? 'index.html' : req.url!);

  if (!existsSync(filePath)) {
    // SPA fallback: serve index.html for non-file paths
    filePath = join(STATIC_DIR, 'index.html');
  }

  try {
    const data = readFileSync(filePath);
    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

const wss = new WebSocketServer({ noServer: true });
setupWebSocket(wss);

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`Production server listening on http://localhost:${PORT}`);
});
