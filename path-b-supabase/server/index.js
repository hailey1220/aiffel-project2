// 백엔드 서버: 화면(public/)을 보여 주고, /api 요청을 받아 일을 맡깁니다.
// - 회원가입·로그인: supabase.js (Supabase Auth, 직접 만들지 않음)
// - DB 읽기·쓰기: db.js (로그인한 사용자 권한으로, RLS 적용)
// 이 파일은 DB를 직접 만지지 않습니다. 들어온 값을 검사하고 응답만 합니다.
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabaseFor, requireUser } from './supabase.js';
import * as store from './db.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
// 내 컴퓨터: 127.0.0.1(나만 접속) / Render 같은 클라우드: 0.0.0.0
const HOST = process.env.HOST || '127.0.0.1';
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));
app.use(express.static(publicDir));

// 로그인 정보가 담긴 API 응답은 어디에도 캐시되지 않게
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

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

function checkCredentials(body) {
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequest('이메일 형식을 확인해 주세요.');
  if (password.length < 8) throw new BadRequest('비밀번호는 8자 이상이어야 합니다.');
  if (password.length > 72) throw new BadRequest('비밀번호는 72자 이하로 정해 주세요.');
  return { email, password };
}

// Supabase 로그인 에러를 알아듣기 쉬운 말로
const AUTH_MESSAGES = {
  invalid_credentials: '이메일 또는 비밀번호가 맞지 않습니다.',
  email_not_confirmed: '이메일 인증을 아직 하지 않았습니다. 받은 메일의 링크를 눌러 주세요.',
  user_already_exists: '이미 가입된 이메일입니다. 로그인해 주세요.',
  weak_password: '비밀번호가 너무 약합니다. 더 길고 복잡하게 정해 주세요.',
  over_email_send_rate_limit: '인증 메일을 너무 자주 보냈습니다. 잠시 후 다시 시도해 주세요.',
  over_request_rate_limit: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  signup_disabled: '지금은 회원가입이 꺼져 있습니다.',
};
function authError(res, error) {
  const status = error.status && error.status < 500 ? 400 : 502;
  res.status(status).json({ error: AUTH_MESSAGES[error.code] || `로그인 처리 중 문제가 생겼습니다. (${error.message})` });
}

// async 함수의 에러를 아래 에러 처리기로 넘겨 줌
const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

async function findOr404(req, res, id) {
  const todo = await store.getTodo(req.supabase, id);
  if (!todo) res.status(404).json({ error: '그 할 일을 찾을 수 없습니다.' });
  return todo;
}

// ── 로그인 API ──────────────────────────────────────────────

app.post('/api/auth/signup', handle(async (req, res) => {
  const { email, password } = checkCredentials(req.body);
  const supabase = supabaseFor(req, res);
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return authError(res, error);
  // 이메일 인증을 켜 둔 프로젝트는 session이 없음 → 메일 확인 안내
  if (!data.session) return res.status(201).json({ needsConfirmation: true });
  res.status(201).json({ email: data.user.email });
}));

app.post('/api/auth/login', handle(async (req, res) => {
  const { email, password } = checkCredentials(req.body);
  const supabase = supabaseFor(req, res);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return authError(res, error);
  res.json({ email: data.user.email });
}));

app.post('/api/auth/logout', handle(async (req, res) => {
  const supabase = supabaseFor(req, res);
  await supabase.auth.signOut({ scope: 'local' }); // 쿠키 삭제
  res.status(204).end();
}));

app.get('/api/auth/me', requireUser, (req, res) => {
  res.json({ email: req.user.email });
});

// ── 할 일 API (전부 로그인 필요) ────────────────────────────
const todos = express.Router();
todos.use(requireUser);

// 목록 보기: GET /api/todos?date=2026-10-29
todos.get('/', handle(async (req, res) => {
  const date = checkDate(req.query.date);
  res.json(await store.listTodosByDate(req.supabase, date));
}));

function checkTitle(value) {
  const title = typeof value === 'string' ? value.trim() : '';
  if (!title) throw new BadRequest('할 일 내용을 적어 주세요.');
  if (title.length > 200) throw new BadRequest('할 일은 200자 이내로 적어 주세요.');
  return title;
}

// 추가: POST /api/todos  { title, date, dueDate?, tags? }
todos.post('/', handle(async (req, res) => {
  const title = checkTitle(req.body.title);
  const date = checkDate(req.body.date);
  const dueDate = req.body.dueDate ? checkDate(req.body.dueDate, '마감일') : null;
  const tags = checkTags(req.body.tags);
  res.status(201).json(await store.createTodo(req.supabase, { title, date, dueDate, tags }));
}));

// 수정: PATCH /api/todos/:id  { title, dueDate, tags }
todos.patch('/:id', handle(async (req, res) => {
  const id = checkId(req.params.id);
  const title = checkTitle(req.body.title);
  const dueDate = req.body.dueDate ? checkDate(req.body.dueDate, '마감일') : null;
  const tags = checkTags(req.body.tags);
  const todo = await findOr404(req, res, id);
  if (!todo) return;
  if (todo.status === 'moved') throw new BadRequest('다른 날로 옮긴 기록은 수정할 수 없습니다. 옮겨 간 날짜에서 수정해 주세요.');
  res.json(await store.updateTodo(req.supabase, id, { title, dueDate, tags }));
}));

// 상태 바꾸기: PATCH /api/todos/:id/status  { status: 'none' | 'todo' | 'doing' | 'done' }
todos.patch('/:id/status', handle(async (req, res) => {
  const id = checkId(req.params.id);
  const { status } = req.body;
  if (!['none', 'todo', 'doing', 'done'].includes(status)) {
    throw new BadRequest('상태는 none, todo, doing, done 중 하나여야 합니다.');
  }
  const todo = await findOr404(req, res, id);
  if (!todo) return;
  if (todo.status === 'moved') throw new BadRequest('이미 다른 날로 옮긴 할 일은 상태를 바꿀 수 없습니다.');
  res.json(await store.setStatus(req.supabase, id, status));
}));

// 미루기: POST /api/todos/:id/move  { date }
todos.post('/:id/move', handle(async (req, res) => {
  const id = checkId(req.params.id);
  const date = checkDate(req.body.date);
  const todo = await findOr404(req, res, id);
  if (!todo) return;
  if (todo.status === 'moved') throw new BadRequest('이미 옮긴 할 일입니다. 옮겨 간 날짜에서 다시 미뤄 주세요.');
  if (todo.status === 'done') throw new BadRequest('완료한 할 일은 옮길 수 없습니다. 표시를 먼저 해제해 주세요.');
  if (todo.date === date) throw new BadRequest('지금과 다른 날짜를 골라 주세요.');
  res.status(201).json(await store.moveTodo(req.supabase, id, date));
}));

// 다시 가져오기: POST /api/todos/:id/bring-back  (id는 → 기록)
todos.post('/:id/bring-back', handle(async (req, res) => {
  const id = checkId(req.params.id);
  const todo = await findOr404(req, res, id);
  if (!todo) return;
  if (todo.status !== 'moved') throw new BadRequest('다른 날로 옮긴 기록(→)만 다시 가져올 수 있습니다.');
  res.json(await store.bringBack(req.supabase, id));
}));

// 삭제: DELETE /api/todos/:id
todos.delete('/:id', handle(async (req, res) => {
  const id = checkId(req.params.id);
  const deleted = await store.deleteTodo(req.supabase, id);
  if (!deleted) return res.status(404).json({ error: '그 할 일을 찾을 수 없습니다.' });
  res.status(204).end();
}));

app.use('/api/todos', todos);

// 배포 서비스가 "살아 있나?" 확인하는 주소
app.get('/healthz', (req, res) => res.json({ ok: true }));

// 없는 API 주소
app.use('/api', (req, res) => res.status(404).json({ error: '없는 API 주소입니다.' }));

// 에러 처리기
app.use((err, req, res, next) => {
  if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: '요청 형식(JSON)이 올바르지 않습니다.' });
  if (err instanceof store.NotFound) return res.status(404).json({ error: '그 할 일을 찾을 수 없습니다.' });
  if (err.code === '42501') {
    console.error('[권한 오류] supabase/schema.sql 을 실행했는지 확인하세요.', err.message);
    return res.status(500).json({ error: 'DB 권한이 없습니다. 터미널 안내를 확인하세요.' });
  }
  if (['42P01', 'PGRST202', 'PGRST205'].includes(err.code)) {
    console.error('[표/함수 없음] Supabase SQL Editor 에서 supabase/schema.sql 을 실행했는지 확인하세요.', err.message);
    return res.status(500).json({ error: 'DB 준비가 안 됐습니다. schema.sql 을 먼저 실행하세요.' });
  }
  if (err.message?.includes('fetch failed')) {
    console.error('[연결 실패] Supabase에 접속하지 못했습니다. .env 의 SUPABASE_URL 과 인터넷 연결을 확인하세요.');
    return res.status(502).json({ error: 'Supabase에 연결하지 못했습니다. 터미널 안내를 확인하세요.' });
  }
  console.error(err);
  res.status(500).json({ error: '서버에서 문제가 생겼습니다. 터미널 로그를 확인하세요.' });
});

// 127.0.0.1로만 열어 내 컴퓨터에서만 접속되게 합니다
const server = app.listen(PORT, HOST, () => {
  const where = HOST === '0.0.0.0' ? `포트 ${PORT}` : `http://localhost:${PORT}`;
  console.log(`Todo 앱이 열렸습니다 (Supabase 저장): ${where}`);
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[포트 사용 중] ${PORT}번 포트를 이미 다른 프로그램이 쓰고 있습니다.`);
    console.error('앞에서 켜 둔 Todo 앱 터미널 창을 닫거나, .env의 PORT를 3001 등으로 바꿔 주세요.\n');
    process.exit(1);
  }
  throw err;
});
