import type { IncomingMessage, ServerResponse } from 'node:http';
import { getUserFromRequest } from './auth';
import { getAllUsers, getGames, getGame, getGameTurns, getGamePlayers, getUserGames } from './db';
import { addRoute, sendJson } from './router';
import { getWaitingRooms } from './game';

function requireAdmin(req: IncomingMessage, res: ServerResponse): boolean {
  const user = getUserFromRequest(req);
  if (!user || !user.is_admin) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return false;
  }
  return true;
}

function requireAuth(req: IncomingMessage, res: ServerResponse): ReturnType<typeof getUserFromRequest> {
  const user = getUserFromRequest(req);
  if (!user) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return null;
  }
  return user;
}

function handleAdminPage(req: IncomingMessage, res: ServerResponse): void {
  if (!requireAdmin(req, res)) return;

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ABAT Admin</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#1a1a2e; color:#eee; font-family:monospace; padding:1rem; }
  h1 { margin-bottom:1rem; }
  .tabs { display:flex; gap:0.5rem; margin-bottom:1rem; }
  .tab { padding:0.5rem 1rem; cursor:pointer; border:1px solid #444; background:#16213e; border-radius:4px; color:#eee; font-family:monospace; font-size:1rem; }
  .tab.active { background:#0f3460; border-color:#e94560; }
  table { width:100%; border-collapse:collapse; }
  th, td { padding:0.5rem; border:1px solid #333; text-align:left; font-size:0.85rem; }
  th { background:#16213e; }
  tr:hover { background:#16213e55; }
  .avatar { width:24px; height:24px; border-radius:50%; vertical-align:middle; margin-right:0.5rem; }
  .badge { display:inline-block; padding:0.15rem 0.5rem; border-radius:4px; font-size:0.75rem; }
  .badge-playing { background:#2A9D8F; }
  .badge-finished { background:#457B9D; }
  .badge-abandoned { background:#E76F51; }
  .pagination { margin-top:1rem; display:flex; gap:0.5rem; }
  .pagination button { padding:0.3rem 0.8rem; background:#16213e; border:1px solid #444; color:#eee; cursor:pointer; border-radius:4px; font-family:monospace; }
  .pagination button:disabled { opacity:0.3; cursor:default; }
  #content { min-height:200px; }
</style>
</head>
<body>
<h1>ABAT Admin</h1>
<div class="tabs">
  <button class="tab active" data-tab="users">Пользователи</button>
  <button class="tab" data-tab="games">Игры</button>
</div>
<div id="content"></div>
<script>
let currentTab = 'users';
let gamesPage = 0;
const PAGE_SIZE = 20;

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.tab;
    gamesPage = 0;
    load();
  });
});

async function load() {
  if (currentTab === 'users') await loadUsers();
  else await loadGames();
}

async function loadUsers() {
  const res = await fetch('/api/admin/users');
  const data = await res.json();
  const rows = data.users.map(u =>
    '<tr>' +
    '<td>' + u.id + '</td>' +
    '<td>' + (u.avatar_url ? '<img class="avatar" src="' + u.avatar_url + '">' : '') + esc(u.name) + '</td>' +
    '<td>' + esc(u.nickname || '-') + '</td>' +
    '<td>' + esc(u.email || '-') + '</td>' +
    '<td>' + (u.is_admin ? 'Да' : 'Нет') + '</td>' +
    '<td>' + u.created_at + '</td>' +
    '<td>' + u.last_login + '</td>' +
    '</tr>'
  ).join('');
  document.getElementById('content').innerHTML =
    '<table><tr><th>ID</th><th>Имя</th><th>Никнейм</th><th>Email</th><th>Админ</th><th>Регистрация</th><th>Последний вход</th></tr>' + rows + '</table>';
}

async function loadGames() {
  const res = await fetch('/api/admin/games?limit=' + PAGE_SIZE + '&offset=' + (gamesPage * PAGE_SIZE));
  const data = await res.json();
  const rows = data.games.map(g =>
    '<tr style="cursor:pointer" onclick="loadGame(' + g.id + ')">' +
    '<td>' + g.id + '</td>' +
    '<td>' + g.room_code + '</td>' +
    '<td><span class="badge badge-' + g.status + '">' + g.status + '</span></td>' +
    '<td>' + g.turn_count + '</td>' +
    '<td>' + (g.winner_id !== null ? g.winner_id : '-') + '</td>' +
    '<td>' + g.started_at + '</td>' +
    '<td>' + (g.ended_at || '-') + '</td>' +
    '</tr>'
  ).join('');
  const totalPages = Math.ceil(data.total / PAGE_SIZE);
  const pag = '<div class="pagination">' +
    '<button ' + (gamesPage <= 0 ? 'disabled' : '') + ' onclick="gamesPage--;loadGames()">Назад</button>' +
    '<span style="padding:0.3rem">' + (gamesPage+1) + '/' + Math.max(totalPages,1) + '</span>' +
    '<button ' + (gamesPage >= totalPages-1 ? 'disabled' : '') + ' onclick="gamesPage++;loadGames()">Вперед</button>' +
    '</div>';
  document.getElementById('content').innerHTML =
    '<table><tr><th>ID</th><th>Код</th><th>Статус</th><th>Ходов</th><th>Победитель</th><th>Начало</th><th>Конец</th></tr>' + rows + '</table>' + pag;
}

async function loadGame(id) {
  const res = await fetch('/api/admin/games/' + id);
  const data = await res.json();
  const g = data.game;
  const players = data.players.map(p =>
    '<tr><td>' + p.player_index + '</td><td>' + esc(p.player_name) + '</td><td>' + (p.user_id || '-') + '</td><td>' + (p.eliminated ? 'Да' : 'Нет') + '</td><td>' + p.final_units + '</td></tr>'
  ).join('');
  const turns = data.turns.map(t =>
    '<tr><td>' + t.turn_number + '</td><td style="max-width:400px;overflow:auto;white-space:nowrap">' + esc(t.orders) + '</td></tr>'
  ).join('');
  document.getElementById('content').innerHTML =
    '<button onclick="loadGames()" style="margin-bottom:1rem;padding:0.3rem 0.8rem;background:#16213e;border:1px solid #444;color:#eee;cursor:pointer;border-radius:4px;font-family:monospace">Назад к списку</button>' +
    '<h2 style="margin:1rem 0">Игра #' + g.id + ' (' + g.room_code + ')</h2>' +
    '<p style="margin-bottom:1rem">Статус: <span class="badge badge-' + g.status + '">' + g.status + '</span> | Ходов: ' + g.turn_count + '</p>' +
    '<h3 style="margin-bottom:0.5rem">Игроки</h3>' +
    '<table><tr><th>#</th><th>Имя</th><th>User ID</th><th>Выбыл</th><th>Юниты</th></tr>' + players + '</table>' +
    '<h3 style="margin:1rem 0 0.5rem">Ходы (' + data.turns.length + ')</h3>' +
    '<table><tr><th>Ход</th><th>Приказы</th></tr>' + turns + '</table>';
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

load();
</script>
</body>
</html>`);
}

function handleAdminUsers(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, { users: getAllUsers() });
}

function handleAdminGames(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url!, 'http://localhost');
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100);
  const offset = Number(url.searchParams.get('offset')) || 0;
  sendJson(res, getGames(limit, offset));
}

function handleAdminGameDetail(req: IncomingMessage, res: ServerResponse, params: Record<string, string>): void {
  const id = Number(params.id);
  const game = getGame(id);
  if (!game) {
    sendJson(res, { error: 'Not found' }, 404);
    return;
  }
  sendJson(res, {
    game,
    players: getGamePlayers(id),
    turns: getGameTurns(id),
  });
}

function handleMyGamesPage(req: IncomingMessage, res: ServerResponse): void {
  const user = requireAuth(req, res);
  if (!user) return;

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Мои игры - ABAT</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#1a1a2e; color:#eee; font-family:monospace; padding:1rem; }
  h1 { margin-bottom:0.5rem; }
  .subtitle { opacity:0.6; margin-bottom:1.5rem; font-size:0.9rem; }
  a { color:#457B9D; text-decoration:none; }
  a:hover { text-decoration:underline; }
  table { width:100%; border-collapse:collapse; }
  th, td { padding:0.5rem; border:1px solid #333; text-align:left; font-size:0.85rem; }
  th { background:#16213e; }
  tr:hover { background:#16213e55; }
  .badge { display:inline-block; padding:0.15rem 0.5rem; border-radius:4px; font-size:0.75rem; }
  .badge-playing { background:#2A9D8F; }
  .badge-finished { background:#457B9D; }
  .badge-abandoned { background:#E76F51; }
  .result-win { color:#2A9D8F; font-weight:bold; }
  .result-lose { color:#E76F51; }
  .result-playing { color:#E9C46A; }
  .pagination { margin-top:1rem; display:flex; gap:0.5rem; }
  .pagination button { padding:0.3rem 0.8rem; background:#16213e; border:1px solid #444; color:#eee; cursor:pointer; border-radius:4px; font-family:monospace; }
  .pagination button:disabled { opacity:0.3; cursor:default; }
  .back-link { display:inline-block; margin-bottom:1rem; }
  .empty { text-align:center; padding:3rem; opacity:0.5; }
</style>
</head>
<body>
<a href="/" class="back-link">← На главную</a>
<h1>Мои игры</h1>
<p class="subtitle">${esc(user.name)}</p>
<div id="content"></div>
<script>
let page = 0;
const PAGE_SIZE = 20;

async function load() {
  const res = await fetch('/api/my-games?limit=' + PAGE_SIZE + '&offset=' + (page * PAGE_SIZE));
  const data = await res.json();
  if (data.games.length === 0 && page === 0) {
    document.getElementById('content').innerHTML = '<div class="empty">Пока нет сетевых игр</div>';
    return;
  }
  const rows = data.games.map(g => {
    let result = '';
    if (g.status === 'playing') {
      result = '<span class="result-playing">В процессе</span>';
    } else if (g.winner_id === null) {
      result = '<span class="result-lose">Ничья</span>';
    } else if (g.winner_id === g.player_index) {
      result = '<span class="result-win">Победа</span>';
    } else {
      result = '<span class="result-lose">Поражение</span>';
    }
    return '<tr>' +
      '<td>' + esc(g.room_code) + '</td>' +
      '<td><span class="badge badge-' + g.status + '">' + g.status + '</span></td>' +
      '<td>' + g.turn_count + '</td>' +
      '<td>' + result + '</td>' +
      '<td>' + g.started_at + '</td>' +
      '</tr>';
  }).join('');
  const totalPages = Math.ceil(data.total / PAGE_SIZE);
  const pag = '<div class="pagination">' +
    '<button ' + (page <= 0 ? 'disabled' : '') + ' onclick="page--;load()">Назад</button>' +
    '<span style="padding:0.3rem">' + (page+1) + '/' + Math.max(totalPages,1) + '</span>' +
    '<button ' + (page >= totalPages-1 ? 'disabled' : '') + ' onclick="page++;load()">Вперед</button>' +
    '</div>';
  document.getElementById('content').innerHTML =
    '<table><tr><th>Комната</th><th>Статус</th><th>Ходов</th><th>Результат</th><th>Дата</th></tr>' + rows + '</table>' + pag;
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

load();
</script>
</body>
</html>`);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function handleMyGamesApi(req: IncomingMessage, res: ServerResponse): void {
  const user = requireAuth(req, res);
  if (!user) return;

  const url = new URL(req.url!, 'http://localhost');
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100);
  const offset = Number(url.searchParams.get('offset')) || 0;
  sendJson(res, getUserGames(user.id, limit, offset));
}

export function registerAdminRoutes(): void {
  addRoute('GET', '/api/rooms', (_req, res) => {
    sendJson(res, { rooms: getWaitingRooms() });
  });
  addRoute('GET', '/my-games', handleMyGamesPage);
  addRoute('GET', '/api/my-games', handleMyGamesApi);
  addRoute('GET', '/admin', handleAdminPage);
  addRoute('GET', '/api/admin/users', (req, res) => {
    if (!requireAdmin(req, res)) return;
    handleAdminUsers(req, res);
  });
  addRoute('GET', '/api/admin/games', (req, res) => {
    if (!requireAdmin(req, res)) return;
    handleAdminGames(req, res);
  });
  addRoute('GET', '/api/admin/games/:id', (req, res, params) => {
    if (!requireAdmin(req, res)) return;
    handleAdminGameDetail(req, res, params);
  });
}
