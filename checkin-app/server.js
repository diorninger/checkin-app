'use strict';
/*
 * 学习打卡表 · 同步服务
 * 零依赖 Node HTTP 服务器：打卡码 + JSON 文件存储
 * API:
 *   POST /api/create            -> {ok, code}
 *   GET  /api/state?code=X      -> {ok, done:[], updatedAt}
 *   POST /api/sync {code,added,removed} -> {ok, done:[], updatedAt}
 * 静态文件：index.html 等
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;           // 去掉易混淆字符 I L O 0 1
const ID_MAX = 80;

let db = { codes: {} };
try {
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === 'object' && parsed.codes) db = parsed;
} catch (e) { /* 首次启动无数据文件 */ }

/* ---------- 持久化（防抖 + 原子写） ---------- */
let saveTimer = null;
let saving = false;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(flushSave, 250);
}
function flushSave() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (saving) { setTimeout(flushSave, 100); return; }
  saving = true;
  const tmp = DATA_FILE + '.tmp';
  fs.writeFile(tmp, JSON.stringify(db), (err) => {
    if (err) { console.error('save failed:', err.message); saving = false; return; }
    fs.rename(tmp, DATA_FILE, (err2) => {
      if (err2) console.error('rename failed:', err2.message);
      saving = false;
    });
  });
}
process.on('exit', () => {
  try { fs.writeFileSync(DATA_FILE + '.tmp', JSON.stringify(db)); fs.renameSync(DATA_FILE + '.tmp', DATA_FILE); } catch (e) {}
});
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { process.exit(0); });
}

/* ---------- 打卡码 ---------- */
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do {
    c = '';
    for (let i = 0; i < 6; i++) c += chars[crypto.randomInt(chars.length)];
  } while (db.codes[c]);
  return c;
}
function getRec(code) {
  if (typeof code !== 'string' || !CODE_RE.test(code)) return null;
  if (!db.codes[code]) db.codes[code] = { done: {}, updatedAt: 0 };
  return db.codes[code];
}

/* ---------- API ---------- */
function json(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(obj));
}
function readBody(req, cb) {
  let body = '';
  req.on('data', (c) => {
    body += c;
    if (body.length > 1e6) { req.destroy(); }
  });
  req.on('end', () => cb(body));
}

function handleCreate(req, res) {
  readBody(req, () => {
    const code = genCode();
    db.codes[code] = { done: {}, updatedAt: Date.now() };
    scheduleSave();
    json(res, 200, { ok: true, code });
  });
}

function handleState(req, res, url) {
  const code = (url.searchParams.get('code') || '').toUpperCase().trim();
  const rec = db.codes[code];
  if (!CODE_RE.test(code) || !rec) {
    json(res, 200, { ok: false, error: 'not_found' });
    return;
  }
  json(res, 200, { ok: true, done: Object.keys(rec.done), updatedAt: rec.updatedAt });
}

function handleSync(req, res) {
  readBody(req, (body) => {
    let payload;
    try { payload = JSON.parse(body || '{}'); } catch (e) { json(res, 400, { ok: false, error: 'bad_request' }); return; }
    const code = String(payload.code || '').toUpperCase().trim();
    const rec = db.codes[code];
    if (!CODE_RE.test(code) || !rec) { json(res, 200, { ok: false, error: 'not_found' }); return; }

    const add = Array.isArray(payload.added) ? payload.added : [];
    const del = Array.isArray(payload.removed) ? payload.removed : [];
    let touched = false;
    for (const id of add) {
      if (typeof id === 'string' && id.length > 0 && id.length <= ID_MAX) { rec.done[id] = 1; touched = true; }
    }
    for (const id of del) {
      if (typeof id === 'string') { delete rec.done[id]; touched = true; }
    }
    if (touched) { rec.updatedAt = Date.now(); scheduleSave(); }
    json(res, 200, { ok: true, done: Object.keys(rec.done), updatedAt: rec.updatedAt });
  });
}

/* ---------- 静态文件 ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  // 逐段过滤，彻底杜绝 .. 穿越（不用 path.normalize，它会把开头 .. 吃掉）
  const segs = p.split(/[\\/]+/).filter((s) => s && s !== '.' && s !== '..');
  const file = path.join(__dirname, ...segs);
  if (!file.startsWith(__dirname + path.sep)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not Found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch (e) { res.writeHead(400); res.end(); return; }
  if (url.pathname === '/api/create' && req.method === 'POST') return handleCreate(req, res);
  if (url.pathname === '/api/state' && req.method === 'GET') return handleState(req, res, url);
  if (url.pathname === '/api/sync' && req.method === 'POST') return handleSync(req, res);
  if (url.pathname.startsWith('/api/')) { json(res, 404, { ok: false, error: 'unknown_api' }); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  serveStatic(req, res, url);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('checkin server listening on 0.0.0.0:' + PORT);
});
