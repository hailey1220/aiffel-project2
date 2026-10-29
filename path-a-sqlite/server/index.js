// 백엔드 서버: 화면(public/)을 보여 주고, /api 요청을 받아 db.js에 일을 맡깁니다.
// 이 파일은 DB를 직접 만지지 않습니다. 들어온 값을 검사하고 응답만 합니다.
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from './db.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

app.use(express.json({ limit: '10kb' }));
app.use(express.static(publicDir));

// ── 입력값 검사 도우미 ──────────────────────────────────────
class BadRequest extends Error {}

function checkDate(value, label = '날짜') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequest(`${label}는 YYYY-MM-DD 형식이어야 합니다.`);
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw new BadRequest(`${label}가 실제로 없는 날짜입니다: ${value}`);
  }
  return value;
}

function checkId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new BadRequest('할 일 번호가 올바르지 않습니다.');
  return id;
}

function checkTags(value) {
  if (value == null || value === '') return [];
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const tags = [...new Set(
    raw.map((t) => String(t).trim().replace(/^#/, '')).filter(Boolean),
  )];
  if (tags.length > 5) throw new BadRequest('태그는 5개까지 붙일 수 있습니다.');
  if (tags.some((t) => t.length > 30)) throw new BadRequest('태그는 30자 이내로 적어 주세요.');
  return tags;
}

// async 함수의 에러를 아래 에러 처리기로 넘겨 줌
const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

async function findOr404(id, res) {
  const todo = await store.getTodo(id);
  if (!todo) res.status(404).json({ error: '그 할 일을 찾을 수 없습니다.' });
  return todo;
}

// ── API ─────────────────────────────────────────────────────

// 목록 보기: GET /api/todos?date=2026-10-29
app.get('/api/todos', handle(async (req, res) => {
  const date = checkDate(req.query.date);
  res.json(await store.listTodosByDate(date));
}));

function checkTitle(value) {
  const title = typeof value === 'string' ? value.trim() : '';
  if (!title) throw new BadRequest('할 일 내용을 적어 주세요.');
  if (title.length > 200) throw new BadRequest('할 일은 200자 이내로 적어 주세요.');
  return title;
}

// 추가: POST /api/todos  { title, date, dueDate?, tags? }
app.post('/api/todos', handle(async (req, res) => {
  const title = checkTitle(req.body.title);
  const date = checkDate(req.body.date);
  const dueDate = req.body.dueDate ? checkDate(req.body.dueDate, '마감일') : null;
  const tags = checkTags(req.body.tags);
  res.status(201).json(await store.createTodo({ title, date, dueDate, tags }));
}));

// 수정: PATCH /api/todos/:id  { title, dueDate, tags }
app.patch('/api/todos/:id', handle(async (req, res) => {
  const id = checkId(req.params.id);
  const title = checkTitle(req.body.title);
  const dueDate = req.body.dueDate ? checkDate(req.body.dueDate, '마감일') : null;
  const tags = checkTags(req.body.tags);
  const todo = await findOr404(id, res);
  if (!todo) return;
  if (todo.status === 'moved') throw new BadRequest('다른 날로 옮긴 기록은 수정할 수 없습니다. 옮겨 간 날짜에서 수정해 주세요.');
  res.json(await store.updateTodo(id, { title, dueDate, tags }));
}));

// 상태 바꾸기: PATCH /api/todos/:id/status  { status: 'none' | 'todo' | 'doing' | 'done' }
app.patch('/api/todos/:id/status', handle(async (req, res) => {
  const id = checkId(req.params.id);
  const { status } = req.body;
  if (!['none', 'todo', 'doing', 'done'].includes(status)) {
    throw new BadRequest('상태는 none, todo, doing, done 중 하나여야 합니다.');
  }
  const todo = await findOr404(id, res);
  if (!todo) return;
  if (todo.status === 'moved') throw new BadRequest('이미 다른 날로 옮긴 할 일은 상태를 바꿀 수 없습니다.');
  res.json(await store.setStatus(id, status));
}));

// 미루기: POST /api/todos/:id/move  { date }
app.post('/api/todos/:id/move', handle(async (req, res) => {
  const id = checkId(req.params.id);
  const date = checkDate(req.body.date);
  const todo = await findOr404(id, res);
  if (!todo) return;
  if (todo.status === 'moved') throw new BadRequest('이미 옮긴 할 일입니다. 옮겨 간 날짜에서 다시 미뤄 주세요.');
  if (todo.status === 'done') throw new BadRequest('완료한 할 일은 옮길 수 없습니다. 표시를 먼저 해제해 주세요.');
  if (todo.date === date) throw new BadRequest('지금과 다른 날짜를 골라 주세요.');
  res.status(201).json(await store.moveTodo(id, date));
}));

// 다시 가져오기: POST /api/todos/:id/bring-back  (id는 → 기록)
app.post('/api/todos/:id/bring-back', handle(async (req, res) => {
  const id = checkId(req.params.id);
  const todo = await findOr404(id, res);
  if (!todo) return;
  if (todo.status !== 'moved') throw new BadRequest('다른 날로 옮긴 기록(→)만 다시 가져올 수 있습니다.');
  res.json(await store.bringBack(id));
}));

// 삭제: DELETE /api/todos/:id
app.delete('/api/todos/:id', handle(async (req, res) => {
  const id = checkId(req.params.id);
  const deleted = await store.deleteTodo(id);
  if (!deleted) return res.status(404).json({ error: '그 할 일을 찾을 수 없습니다.' });
  res.status(204).end();
}));

// 없는 API 주소
app.use('/api', (req, res) => res.status(404).json({ error: '없는 API 주소입니다.' }));

// 에러 처리기
app.use((err, req, res, next) => {
  if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: '요청 형식(JSON)이 올바르지 않습니다.' });
  console.error(err);
  res.status(500).json({ error: '서버에서 문제가 생겼습니다. 터미널 로그를 확인하세요.' });
});

// 127.0.0.1로만 열어 내 컴퓨터에서만 접속되게 합니다
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`Todo 앱이 열렸습니다: http://localhost:${PORT}`);
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[포트 사용 중] ${PORT}번 포트를 이미 다른 프로그램이 쓰고 있습니다.`);
    console.error('앞에서 켜 둔 Todo 앱 터미널 창을 닫거나, .env의 PORT를 3001 등으로 바꿔 주세요.\n');
    process.exit(1);
  }
  throw err;
});
