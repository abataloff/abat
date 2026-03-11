import type { IncomingMessage, ServerResponse } from 'node:http';
import { getUserFromRequest } from './auth';
import {
  createFeedback, getFeedbackList, getFeedbackById,
  voteFeedback, getUserVotedIds, updateFeedbackStatus, deleteFeedback,
} from './db';
import { addRoute, sendJson } from './router';

function readBody(req: IncomingMessage, maxSize = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > maxSize) { req.destroy(); reject(new Error('Body too large')); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function handleFeedbackPage(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Обратная связь - ABAT</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg-deep: #080c14;
    --bg-surface: #0f1624;
    --bg-elevated: #151d2e;
    --border-dim: rgba(255,255,255,0.07);
    --border-glow: rgba(100,180,255,0.12);
    --text: #d4dae3;
    --text-muted: rgba(255,255,255,0.4);
    --font: 'Chakra Petch', system-ui, sans-serif;
    --radius: 6px;
    --radius-lg: 10px;
    --transition: 0.2s cubic-bezier(0.4,0,0.2,1);
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    background:
      radial-gradient(ellipse at 50% 0%, rgba(79,172,254,0.04) 0%, transparent 50%),
      linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px),
      var(--bg-deep);
    background-size: 100%, 48px 48px, 48px 48px, 100%;
    color:var(--text); font-family:var(--font);
    min-height:100vh;
  }
  .page { max-width:720px; margin:0 auto; padding:2rem 1rem 3rem; }

  @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }

  a { color:#457B9D; text-decoration:none; transition:color var(--transition); }
  a:hover { color:#6bb3d9; }

  .header {
    display:flex; align-items:center; gap:1rem; margin-bottom:2rem; flex-wrap:wrap;
    animation: fadeIn 0.4s ease;
  }
  .header h1 {
    font-size:1.8rem; font-weight:700; letter-spacing:0.08em;
    text-shadow: 0 0 30px rgba(79,172,254,0.15);
  }
  .back-link {
    font-size:0.85rem; font-weight:600; letter-spacing:0.03em;
    padding:0.35rem 0.8rem; border:1px solid var(--border-dim); border-radius:var(--radius);
    transition:all var(--transition);
  }
  .back-link:hover { border-color:var(--border-glow); background:rgba(255,255,255,0.03); }

  .form-card {
    background: linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.008) 100%);
    border:1px solid color-mix(in srgb, #457B9D 20%, transparent);
    border-radius:var(--radius-lg); padding:1.25rem; margin-bottom:2rem;
    backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);
    animation: fadeIn 0.5s ease 0.1s both;
  }
  .form-row { display:flex; gap:0.5rem; margin-bottom:0.75rem; align-items:center; flex-wrap:wrap; }
  .form-row label { font-size:0.85rem; color:var(--text-muted); min-width:50px; font-weight:600; letter-spacing:0.02em; }
  input[type="text"], textarea, select {
    background:var(--bg-surface); border:1px solid var(--border-dim); color:var(--text);
    border-radius:var(--radius); padding:0.55rem 0.75rem; font-family:var(--font); font-size:0.9rem;
    font-weight:600; outline:none; width:100%; transition:all var(--transition);
  }
  input[type="text"]:hover, textarea:hover, select:hover { border-color:rgba(255,255,255,0.12); background:var(--bg-elevated); }
  input[type="text"]:focus, textarea:focus, select:focus {
    border-color:color-mix(in srgb, #457B9D 60%, transparent);
    box-shadow:0 0 0 3px color-mix(in srgb, #457B9D 12%, transparent), 0 0 12px color-mix(in srgb, #457B9D 8%, transparent);
    background:var(--bg-elevated);
  }
  textarea { resize:vertical; min-height:60px; }
  select {
    cursor:pointer; max-width:200px;
    -webkit-appearance:none; -moz-appearance:none; appearance:none;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23667' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat:no-repeat; background-position:right 10px center; padding-right:30px;
  }
  select option { background:var(--bg-surface); color:var(--text); }

  .btn {
    padding:0.6rem 1.4rem; font-size:0.9rem; font-weight:600;
    border:1px solid var(--border-dim); border-radius:var(--radius);
    background:var(--bg-elevated); color:var(--text); cursor:pointer;
    font-family:var(--font); letter-spacing:0.03em;
    transition:all var(--transition); outline:none; position:relative;
  }
  .btn:hover:not(:disabled) { background:rgba(255,255,255,0.08); border-color:rgba(255,255,255,0.15); transform:translateY(-1px); }
  .btn:active:not(:disabled) { transform:scale(0.97) translateY(0); }
  .btn-primary {
    border-color:color-mix(in srgb, #457B9D 50%, transparent);
    background:linear-gradient(135deg, color-mix(in srgb, #457B9D 15%, transparent), color-mix(in srgb, #457B9D 8%, transparent));
    font-weight:700;
  }
  .btn-primary:hover:not(:disabled) {
    border-color:color-mix(in srgb, #457B9D 70%, transparent);
    background:linear-gradient(135deg, color-mix(in srgb, #457B9D 22%, transparent), color-mix(in srgb, #457B9D 12%, transparent));
    box-shadow:0 0 24px color-mix(in srgb, #457B9D 20%, transparent);
  }
  .btn-sm { padding:0.25rem 0.6rem; font-size:0.8rem; letter-spacing:0; }
  .btn-danger { color:#ff4757; border-color:rgba(255,71,87,0.4); }
  .btn-danger:hover { background:rgba(255,71,87,0.12); border-color:rgba(255,71,87,0.6); }

  .items { display:flex; flex-direction:column; gap:0.75rem; }
  .item {
    background: linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.005) 100%);
    border:1px solid var(--border-dim); border-radius:var(--radius-lg);
    padding:1rem 1.1rem; display:flex; gap:0.85rem; align-items:flex-start;
    transition:all var(--transition);
    animation: fadeIn 0.4s ease both;
  }
  .item:hover { border-color:rgba(255,255,255,0.12); box-shadow:0 0 20px rgba(79,172,254,0.04); }

  .vote-btn {
    display:flex; flex-direction:column; align-items:center; gap:2px;
    background:none; border:1px solid var(--border-dim); border-radius:var(--radius);
    color:var(--text-muted); cursor:pointer; padding:0.4rem 0.55rem; min-width:44px;
    font-family:var(--font); font-size:0.85rem; font-weight:600;
    transition:all var(--transition);
  }
  .vote-btn:hover { border-color:color-mix(in srgb, #457B9D 50%, transparent); color:var(--text); background:rgba(69,123,157,0.06); }
  .vote-btn.voted {
    border-color:#457B9D; color:#457B9D;
    background:rgba(69,123,157,0.1);
    box-shadow:0 0 10px rgba(69,123,157,0.15);
  }
  .vote-arrow { font-size:0.9rem; line-height:1; }
  .item-body { flex:1; min-width:0; }
  .item-header { display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.3rem; }
  .item-title { font-weight:700; font-size:1rem; letter-spacing:0.01em; }
  .item-desc {
    font-size:0.85rem; color:rgba(255,255,255,0.55); line-height:1.6;
    margin-top:0.3rem; white-space:pre-wrap; word-break:break-word;
  }
  .item-meta { font-size:0.75rem; color:var(--text-muted); margin-top:0.5rem; letter-spacing:0.02em; }

  .badge {
    display:inline-block; padding:0.15rem 0.55rem; border-radius:4px;
    font-size:0.7rem; font-weight:700; letter-spacing:0.06em; text-transform:uppercase;
    border:1px solid transparent;
  }
  .badge-bug { background:rgba(255,71,87,0.12); color:#ff6b7a; border-color:rgba(255,71,87,0.25); }
  .badge-feature { background:rgba(69,123,157,0.12); color:#6bb3d9; border-color:rgba(69,123,157,0.25); }
  .badge-new { background:rgba(255,255,255,0.04); color:var(--text-muted); border-color:rgba(255,255,255,0.08); }
  .badge-planned { background:rgba(233,196,106,0.12); color:#E9C46A; border-color:rgba(233,196,106,0.25); }
  .badge-done { background:rgba(42,157,143,0.12); color:#2A9D8F; border-color:rgba(42,157,143,0.25); }
  .badge-rejected { background:rgba(255,71,87,0.08); color:rgba(255,107,122,0.7); border-color:rgba(255,71,87,0.15); }

  .admin-response {
    margin-top:0.5rem; padding:0.5rem 0.75rem;
    background:rgba(42,157,143,0.05); border-left:2px solid rgba(42,157,143,0.5);
    font-size:0.8rem; color:rgba(255,255,255,0.65); border-radius:0 var(--radius) var(--radius) 0;
    font-style:italic;
  }
  .admin-controls {
    margin-top:0.5rem; padding-top:0.5rem; border-top:1px solid var(--border-dim);
    display:flex; gap:0.4rem; align-items:center; flex-wrap:wrap;
  }
  .admin-controls select, .admin-controls input { width:auto; font-size:0.8rem; padding:0.25rem 0.5rem; }
  .admin-controls input { flex:1; min-width:120px; }

  .pagination { margin-top:1.5rem; display:flex; gap:0.5rem; align-items:center; justify-content:center; }
  .empty { text-align:center; padding:3rem 1rem; opacity:0.4; font-size:1.05rem; letter-spacing:0.03em; }
  .login-hint { font-size:0.8rem; color:var(--text-muted); font-weight:400; }
  #form-msg { font-size:0.85rem; margin-top:0.5rem; font-weight:600; }
  .msg-ok { color:#2A9D8F; }
  .msg-err { color:#ff4757; }

  @media (max-width:600px) {
    .page { padding:1rem 0.75rem 2rem; }
    .header h1 { font-size:1.4rem; }
    .item { padding:0.75rem; gap:0.6rem; }
    .vote-btn { min-width:38px; padding:0.3rem 0.4rem; }
  }
</style>
</head>
<body>
<div class="page">
<div class="header">
  <a href="/" class="back-link">&larr; На главную</a>
  <h1>Обратная связь</h1>
</div>

<div class="form-card">
  <div class="form-row">
    <label>Тип</label>
    <select id="f-type">
      <option value="feature">Предложение</option>
      <option value="bug">Баг</option>
    </select>
  </div>
  <div class="form-row">
    <input id="f-title" type="text" placeholder="Заголовок" maxlength="200">
  </div>
  <div class="form-row">
    <textarea id="f-desc" placeholder="Описание (необязательно)" maxlength="2000" rows="3"></textarea>
  </div>
  <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
    <button id="f-submit" class="btn btn-primary" onclick="submitFeedback()">Отправить</button>
    <span id="f-user" class="login-hint"></span>
  </div>
  <div id="form-msg"></div>
</div>

<div id="items" class="items"></div>
<div id="pagination" class="pagination"></div>
</div>

<script>
let currentUser = null;
let isAdmin = false;
let votedIds = [];
let page = 0;
const PAGE_SIZE = 20;

async function init() {
  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    currentUser = data.user;
    isAdmin = currentUser?.isAdmin || false;
  } catch {}
  const hint = document.getElementById('f-user');
  if (currentUser) {
    hint.textContent = currentUser.nickname || currentUser.name;
  } else {
    hint.textContent = 'Отправить как гость';
  }
  await load();
}

async function load() {
  const res = await fetch('/api/feedback?limit=' + PAGE_SIZE + '&offset=' + (page * PAGE_SIZE));
  const data = await res.json();
  votedIds = data.votedIds || [];
  renderItems(data.items, data.total);
}

function renderItems(items, total) {
  const c = document.getElementById('items');
  if (items.length === 0 && page === 0) {
    c.innerHTML = '<div class="empty">Пока нет записей. Будь первым!</div>';
    document.getElementById('pagination').innerHTML = '';
    return;
  }
  c.innerHTML = items.map((it, i) => {
    const voted = votedIds.includes(it.id);
    const voteCls = voted ? 'vote-btn voted' : 'vote-btn';
    const voteDisabled = !currentUser ? 'title="Войдите чтобы голосовать"' : '';
    let html = '<div class="item" style="animation-delay:' + (i * 0.06) + 's">';
    html += '<button class="' + voteCls + '" onclick="vote(' + it.id + ')" ' + voteDisabled + '>';
    html += '<span class="vote-arrow">&#9650;</span><span>' + it.vote_count + '</span></button>';
    html += '<div class="item-body">';
    html += '<div class="item-header">';
    html += '<span class="badge badge-' + it.type + '">' + (it.type === 'bug' ? 'Баг' : 'Фича') + '</span>';
    html += '<span class="badge badge-' + it.status + '">' + statusLabel(it.status) + '</span>';
    html += '<span class="item-title">' + esc(it.title) + '</span>';
    html += '</div>';
    if (it.description) html += '<div class="item-desc">' + esc(it.description) + '</div>';
    if (it.admin_response) html += '<div class="admin-response">' + esc(it.admin_response) + '</div>';
    html += '<div class="item-meta">' + esc(it.author_name) + ' &middot; ' + it.created_at + '</div>';
    if (isAdmin) {
      html += '<div class="admin-controls">';
      html += '<select onchange="setStatus(' + it.id + ',this.value)">';
      ['new','planned','done','rejected'].forEach(s => {
        html += '<option value="' + s + '"' + (it.status===s?' selected':'') + '>' + statusLabel(s) + '</option>';
      });
      html += '</select>';
      html += '<input type="text" placeholder="Ответ" value="' + esc(it.admin_response||'') + '" onchange="setResponse(' + it.id + ',this.value)">';
      html += '<button class="btn btn-sm btn-danger" onclick="del(' + it.id + ')">x</button>';
      html += '</div>';
    }
    html += '</div></div>';
    return html;
  }).join('');

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const pg = document.getElementById('pagination');
  if (totalPages <= 1) { pg.innerHTML = ''; return; }
  pg.innerHTML =
    '<button class="btn btn-sm"' + (page<=0?' disabled':'') + ' onclick="page--;load()">Назад</button>' +
    '<span style="font-size:0.85rem;">' + (page+1) + '/' + totalPages + '</span>' +
    '<button class="btn btn-sm"' + (page>=totalPages-1?' disabled':'') + ' onclick="page++;load()">Вперед</button>';
}

function statusLabel(s) {
  return {new:'Новое',planned:'Запланировано',done:'Готово',rejected:'Отклонено'}[s]||s;
}

async function submitFeedback() {
  const type = document.getElementById('f-type').value;
  const title = document.getElementById('f-title').value.trim();
  const desc = document.getElementById('f-desc').value.trim();
  const msg = document.getElementById('form-msg');
  if (!title) { msg.className='msg-err'; msg.textContent='Введите заголовок'; return; }
  try {
    const res = await fetch('/api/feedback', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({type,title,description:desc})
    });
    const data = await res.json();
    if (data.error) { msg.className='msg-err'; msg.textContent=data.error; return; }
    msg.className='msg-ok'; msg.textContent='Отправлено!';
    document.getElementById('f-title').value='';
    document.getElementById('f-desc').value='';
    setTimeout(() => { msg.textContent=''; }, 2000);
    page=0; await load();
  } catch(e) { msg.className='msg-err'; msg.textContent='Ошибка отправки'; }
}

async function vote(id) {
  if (!currentUser) return;
  await fetch('/api/feedback/'+id+'/vote',{method:'POST'});
  await load();
}

async function setStatus(id, status) {
  await fetch('/api/feedback/'+id+'/status',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({status})
  });
}

async function setResponse(id, response) {
  const item = document.querySelector('.admin-controls select')?.closest('.item-body');
  await fetch('/api/feedback/'+id+'/status',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({admin_response:response})
  });
}

async function del(id) {
  if (!confirm('Удалить?')) return;
  await fetch('/api/feedback/'+id,{method:'DELETE'});
  await load();
}

function esc(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

init();
</script>
</body>
</html>`);
}

function handleFeedbackApi(req: IncomingMessage, res: ServerResponse): void {
  const user = getUserFromRequest(req);
  const url = new URL(req.url!, 'http://localhost');
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100);
  const offset = Number(url.searchParams.get('offset')) || 0;
  const data = getFeedbackList(limit, offset);
  const votedIds = user ? getUserVotedIds(user.id) : [];
  sendJson(res, { ...data, votedIds });
}

async function handleFeedbackSubmit(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: string;
  try { body = await readBody(req); } catch {
    sendJson(res, { error: 'Body too large' }, 400);
    return;
  }

  let parsed: { type?: string; title?: string; description?: string };
  try { parsed = JSON.parse(body); } catch {
    sendJson(res, { error: 'Invalid JSON' }, 400);
    return;
  }

  const type = parsed.type;
  if (type !== 'bug' && type !== 'feature') {
    sendJson(res, { error: 'Invalid type' }, 400);
    return;
  }

  const title = (parsed.title || '').trim().slice(0, 200);
  if (!title) {
    sendJson(res, { error: 'Title is required' }, 400);
    return;
  }

  const description = (parsed.description || '').trim().slice(0, 2000);
  const user = getUserFromRequest(req);
  const userId = user ? user.id : null;
  const authorName = user ? (user.nickname || user.name) : 'Гость';

  const id = createFeedback(userId, authorName, type, title, description);
  sendJson(res, { ok: true, id });
}

async function handleVote(req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
  const user = getUserFromRequest(req);
  if (!user) {
    sendJson(res, { error: 'Auth required' }, 401);
    return;
  }
  const id = Number(params.id);
  const item = getFeedbackById(id);
  if (!item) {
    sendJson(res, { error: 'Not found' }, 404);
    return;
  }
  const added = voteFeedback(id, user.id);
  sendJson(res, { ok: true, voted: added });
}

async function handleStatusUpdate(req: IncomingMessage, res: ServerResponse, params: Record<string, string>): Promise<void> {
  const user = getUserFromRequest(req);
  if (!user || !user.is_admin) {
    sendJson(res, { error: 'Forbidden' }, 403);
    return;
  }

  let body: string;
  try { body = await readBody(req); } catch {
    sendJson(res, { error: 'Body too large' }, 400);
    return;
  }

  let parsed: { status?: string; admin_response?: string };
  try { parsed = JSON.parse(body); } catch {
    sendJson(res, { error: 'Invalid JSON' }, 400);
    return;
  }

  const id = Number(params.id);
  const item = getFeedbackById(id);
  if (!item) {
    sendJson(res, { error: 'Not found' }, 404);
    return;
  }

  const status = parsed.status || item.status;
  const validStatuses = ['new', 'planned', 'done', 'rejected'];
  if (!validStatuses.includes(status)) {
    sendJson(res, { error: 'Invalid status' }, 400);
    return;
  }

  const adminResponse = parsed.admin_response !== undefined ? parsed.admin_response : item.admin_response;
  updateFeedbackStatus(id, status, adminResponse);
  sendJson(res, { ok: true });
}

function handleDelete(req: IncomingMessage, res: ServerResponse, params: Record<string, string>): void {
  const user = getUserFromRequest(req);
  if (!user || !user.is_admin) {
    sendJson(res, { error: 'Forbidden' }, 403);
    return;
  }
  const id = Number(params.id);
  deleteFeedback(id);
  sendJson(res, { ok: true });
}

export function registerFeedbackRoutes(): void {
  addRoute('GET', '/feedback', handleFeedbackPage);
  addRoute('GET', '/api/feedback', handleFeedbackApi);
  addRoute('POST', '/api/feedback', handleFeedbackSubmit);
  addRoute('POST', '/api/feedback/:id/vote', handleVote);
  addRoute('POST', '/api/feedback/:id/status', handleStatusUpdate);
  addRoute('DELETE', '/api/feedback/:id', handleDelete);
}
