// AXdea 백엔드 — Express가 앱(정적파일) + /api(MySQL)를 함께 서빙.
// 실행: cd server && npm install && (환경변수 세팅 후) npm start
'use strict';
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// ── .env(선택) 로드: server/.env 의 KEY=VALUE 를 process.env로 (의존성 없이) ──
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const PORT = Number(process.env.PORT || 8080);
// ※ 웹서버와 DB서버는 서로 다른 위치(호스트)에 있습니다.
//    이 서버(웹)는 아래 주소의 원격 MySQL(DB서버)로 네트워크 접속합니다.
const pool = mysql.createPool({
  host: process.env.DB_HOST || '192.168.100.76',   // DB 서버 (웹서버와 다른 위치)
  port: Number(process.env.DB_PORT || 5114),        // DB 포트
  user: process.env.DB_USER || 'axdea',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'axdea',
  charset: 'utf8mb4',
  timezone: 'Z',              // DB의 datetime을 UTC로 취급 → JSON은 ISO Z로 직렬화
  flags: ['FOUND_ROWS'],      // UPDATE affectedRows = 매칭된 행 수(변경 여부 무관)
  waitForConnections: true,
  connectionLimit: 8,
});
const q = async (sql, p = []) => (await pool.query(sql, p))[0];
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const app = express();
app.use(express.json());
const api = express.Router();

api.get('/health', h(async (req, res) => { await q('select 1'); res.json({ ok: true }); }));

// 앱 상태 (active_round 등)
api.get('/state/:key', h(async (req, res) => {
  const r = await q('select `value` from app_state where `key`=?', [req.params.key]);
  res.json({ value: r[0] ? r[0].value : null });
}));
api.put('/state/:key', h(async (req, res) => {
  await q('insert into app_state (`key`,`value`) values (?,?) on duplicate key update `value`=values(`value`)',
    [req.params.key, req.body.value]);
  res.json({ ok: true });
}));

// 라운드 목록/이름변경
api.get('/rounds', h(async (req, res) => {
  const r = await q("select coalesce(round,'lab-day') round, count(*) count, max(created_at) last from ideas group by coalesce(round,'lab-day')");
  res.json(r);
}));
api.post('/rounds/rename', h(async (req, res) => {
  const { from, to } = req.body || {};
  if (!from || !to) return res.status(400).json({ error: 'from/to required' });
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    await c.query("update ideas set round=? where coalesce(round,'lab-day')=?", [to, from]);
    await c.query("update app_state set `value`=? where `key`='active_round' and `value`=?", [to, from]);
    await c.commit();
  } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
  res.json({ ok: true });
}));

// 아이디어
api.get('/ideas', h(async (req, res) => {
  if (req.query.rounds) {
    const arr = String(req.query.rounds).split(',').filter(Boolean);
    if (!arr.length) return res.json([]);
    return res.json(await q(`select * from ideas where coalesce(round,'lab-day') in (${arr.map(() => '?').join(',')}) order by created_at`, arr));
  }
  if (req.query.round) return res.json(await q("select * from ideas where coalesce(round,'lab-day')=? order by created_at", [req.query.round]));
  res.json(await q('select * from ideas order by created_at'));
}));
api.post('/ideas', h(async (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.author) return res.status(400).json({ error: 'title/author required' });
  const id = crypto.randomUUID();
  await q('insert into ideas (id,title,body,category,color,avatar_style,avatar_seed,author,created_at,round,status) values (?,?,?,?,?,?,?,?,UTC_TIMESTAMP(6),?,?)',
    [id, b.title, b.body || '', b.category || 'etc', b.color || '#22e3ff', b.avatar_style || 'bottts', b.avatar_seed || id, b.author, b.round || 'lab-day', b.status || 'open']);
  const r = await q('select * from ideas where id=?', [id]);
  res.json(r[0]);
}));
api.patch('/ideas/:id', h(async (req, res) => {
  const allow = ['title', 'body', 'category', 'color', 'author', 'round', 'status'];
  const b = req.body || {};
  const cols = Object.keys(b).filter((k) => allow.includes(k));
  if (!cols.length) return res.json({ updated: 0 });
  const r = await q(`update ideas set ${cols.map((c) => `\`${c}\`=?`).join(',')} where id=?`, [...cols.map((c) => b[c]), req.params.id]);
  res.json({ updated: r.affectedRows });
}));
api.delete('/ideas/:id', h(async (req, res) => {
  const r = await q('delete from ideas where id=?', [req.params.id]);
  res.json({ ok: true, deleted: r.affectedRows });
}));

// 댓글
api.get('/comments', h(async (req, res) => {
  res.json(await q('select * from comments where idea_id=? order by created_at', [req.query.idea_id]));
}));
api.post('/comments', h(async (req, res) => {
  const b = req.body || {};
  if (!b.idea_id || !b.author || !b.body) return res.status(400).json({ error: 'idea_id/author/body required' });
  const id = crypto.randomUUID();
  await q('insert into comments (id,idea_id,author,body,created_at) values (?,?,?,?,UTC_TIMESTAMP(6))', [id, b.idea_id, b.author, b.body]);
  const r = await q('select * from comments where id=?', [id]);
  res.json(r[0]);
}));
api.patch('/comments/:id', h(async (req, res) => {
  const r = await q('update comments set body=? where id=?', [req.body.body, req.params.id]);
  res.json({ updated: r.affectedRows });
}));
api.delete('/comments/:id', h(async (req, res) => {
  const r = await q('delete from comments where id=?', [req.params.id]);
  res.json({ ok: true, deleted: r.affectedRows });
}));

// 좋아요 + 집계
api.get('/counts', h(async (req, res) => {
  const me = req.query.me || null;
  const cc = await q('select idea_id, count(*) c from comments group by idea_id');
  const lc = await q('select idea_id, count(*) c from likes group by idea_id');
  const mine = me ? await q('select idea_id from likes where voter=?', [me]) : [];
  res.json({
    commentCounts: Object.fromEntries(cc.map((r) => [r.idea_id, Number(r.c)])),
    likeCounts: Object.fromEntries(lc.map((r) => [r.idea_id, Number(r.c)])),
    myLikes: mine.map((r) => r.idea_id),
  });
}));
api.post('/likes', h(async (req, res) => {
  const b = req.body || {};
  if (!b.idea_id || !b.voter) return res.status(400).json({ error: 'idea_id/voter required' });
  await q('insert into likes (idea_id,voter,created_at) values (?,?,UTC_TIMESTAMP(6)) on duplicate key update created_at=created_at', [b.idea_id, b.voter]);
  res.json({ ok: true });
}));
api.delete('/likes', h(async (req, res) => {
  await q('delete from likes where idea_id=? and voter=?', [req.query.idea_id, req.query.voter]);
  res.json({ ok: true });
}));

app.use('/api', api);
// API 에러 핸들러
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('[API error]', err.message);
  res.status(500).json({ error: String(err.message || err) });
});
// 앱 정적 파일 (레포 루트 = 상위 폴더)
app.use(express.static(path.resolve(__dirname, '..')));

app.listen(PORT, '0.0.0.0', () => {
  const dbHost = process.env.DB_HOST || '192.168.100.76';
  const dbPort = process.env.DB_PORT || 5114;
  console.log(`AXdea 웹서버 실행: http://0.0.0.0:${PORT}  →  DB(원격) ${dbHost}:${dbPort}/${process.env.DB_NAME || 'axdea'}`);
});
