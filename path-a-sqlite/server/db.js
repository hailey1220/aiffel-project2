// ─────────────────────────────────────────────────────────────
// DB 접근 코드는 전부 이 파일에만 있습니다.
// 길 B(Supabase)로 옮길 때는 이 파일의 함수 내용만 바꾸면 되고,
// 서버(index.js)와 화면(public/)은 그대로 둘 수 있습니다.
// 그래서 지금은 즉시 끝나는 SQLite 함수도 async로 만들어 두었습니다.
// ─────────────────────────────────────────────────────────────
// Node.js에 기본으로 들어 있는 SQLite를 사용합니다 (따로 설치·컴파일 필요 없음)
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = path.resolve(projectRoot, process.env.DB_PATH || 'todo.db');

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON'); // SQLite는 이걸 켜야 FK 규칙을 지킵니다

// 여러 작업을 '전부 되거나 전부 안 되거나'로 묶는 도우미
function transaction(fn) {
  return (...args) => {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
}

// ── 표 정의 ─────────────────────────────────────────────────
// status: none(아직 표시 안 함) / done(○) / doing(△) / todo(✕) / moved(→)
const todosTable = (name) => `
  CREATE TABLE IF NOT EXISTS ${name} (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    title          TEXT    NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
    status         TEXT    NOT NULL DEFAULT 'none'
                           CHECK (status IN ('none', 'todo', 'doing', 'done', 'moved')),
    date           TEXT    NOT NULL,              -- 할 날짜 (YYYY-MM-DD)
    due_date       TEXT,                          -- 마감일, 비워 둘 수 있음
    moved_from_id  INTEGER REFERENCES todos(id) ON DELETE SET NULL,
    postpone_count INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );`;

// ── 예전 todo.db 고치기: 'none' 상태가 없던 표를 새 규칙으로 옮김 ──
const existing = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'todos'").get();
if (existing && !existing.sql.includes("'none'")) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec(todosTable('todos_new'));
    db.exec(`INSERT INTO todos_new (id, title, status, date, due_date, moved_from_id,
                                    postpone_count, created_at, updated_at)
             SELECT id, title, status, date, due_date, moved_from_id,
                    postpone_count, created_at, updated_at FROM todos`);
    db.exec('DROP TABLE todos');
    db.exec('ALTER TABLE todos_new RENAME TO todos');
    db.exec('COMMIT');
    console.log('[DB] 할 일 표를 새 규칙(표시 없음 상태)으로 업데이트했습니다.');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

// ── 표 만들기 (이미 있으면 건너뜀) ──────────────────────────
db.exec(`
  ${todosTable('todos')}
  CREATE INDEX IF NOT EXISTS idx_todos_date ON todos(date);
  CREATE INDEX IF NOT EXISTS idx_todos_moved_from ON todos(moved_from_id);

  CREATE TABLE IF NOT EXISTS tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 30)
  );

  CREATE TABLE IF NOT EXISTS todo_tags (
    todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (todo_id, tag_id)
  );
`);

// ── 자주 쓰는 질의 (? 자리에 값이 안전하게 들어갑니다) ─────
const sql = {
  listByDate: db.prepare(`
    SELECT t.*,
           (SELECT c.date FROM todos c WHERE c.moved_from_id = t.id) AS moved_to_date,
           (SELECT group_concat(g.name, ',')
              FROM todo_tags tt JOIN tags g ON g.id = tt.tag_id
             WHERE tt.todo_id = t.id) AS tag_list
      FROM todos t
     WHERE t.date = ?
     ORDER BY CASE WHEN t.status = 'moved' THEN 1 ELSE 0 END, t.id
  `),
  getById: db.prepare(`
    SELECT t.*,
           (SELECT c.date FROM todos c WHERE c.moved_from_id = t.id) AS moved_to_date,
           (SELECT group_concat(g.name, ',')
              FROM todo_tags tt JOIN tags g ON g.id = tt.tag_id
             WHERE tt.todo_id = t.id) AS tag_list
      FROM todos t WHERE t.id = ?
  `),
  insertTodo: db.prepare(`
    INSERT INTO todos (title, status, date, due_date, moved_from_id, postpone_count)
    VALUES (@title, 'none', @date, @due_date, @moved_from_id, @postpone_count)
  `),
  updateStatus: db.prepare(`
    UPDATE todos SET status = ?, updated_at = datetime('now') WHERE id = ?
  `),
  firstChild: db.prepare(`
    SELECT id, status, date FROM todos WHERE moved_from_id = ? ORDER BY id LIMIT 1
  `),
  updateTodo: db.prepare(`
    UPDATE todos SET title = ?, due_date = ?, updated_at = datetime('now') WHERE id = ?
  `),
  clearTags: db.prepare(`DELETE FROM todo_tags WHERE todo_id = ?`),
  insertTag: db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`),
  getTagId: db.prepare(`SELECT id FROM tags WHERE name = ?`),
  linkTag: db.prepare(`INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)`),
  deleteTodo: db.prepare(`DELETE FROM todos WHERE id = ?`),
  deleteUnusedTags: db.prepare(`
    DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM todo_tags)
  `),
};

// DB 한 줄을 화면에 보내기 좋은 모양으로 바꿈
function toTodo(row) {
  if (!row) return null;
  const { tag_list, ...rest } = { ...row };
  return { ...rest, tags: tag_list ? tag_list.split(',') : [] };
}

function attachTags(todoId, tags) {
  for (const name of tags) {
    sql.insertTag.run(name);
    sql.linkTag.run(todoId, sql.getTagId.get(name).id);
  }
}

// ── 바깥(서버)에서 쓰는 함수들 ───────────────────────────────

export async function listTodosByDate(date) {
  return sql.listByDate.all(date).map(toTodo);
}

export async function getTodo(id) {
  return toTodo(sql.getById.get(id));
}

export async function createTodo({ title, date, dueDate = null, tags = [] }) {
  const run = transaction(() => {
    const { lastInsertRowid } = sql.insertTodo.run({
      title, date, due_date: dueDate, moved_from_id: null, postpone_count: 0,
    });
    attachTags(Number(lastInsertRowid), tags);
    return Number(lastInsertRowid);
  });
  return getTodo(run());
}

// 수정: 내용·마감일·태그를 한 번에 바꿈 (태그는 새 목록으로 통째로 교체)
export async function updateTodo(id, { title, dueDate = null, tags = [] }) {
  const run = transaction(() => {
    sql.updateTodo.run(title, dueDate, id);
    sql.clearTags.run(id);
    attachTags(id, tags);
    sql.deleteUnusedTags.run();
  });
  run();
  return getTodo(id);
}

// status는 none / todo / doing / done 중 하나 (moved는 미루기로만 바뀜)
export async function setStatus(id, status) {
  sql.updateStatus.run(status, id);
  return getTodo(id);
}

// 미루기: 원래 줄은 'moved'로 남기고, 이어지는 새 줄을 만든다
// 단, 이 할 일이 거쳐 온 날짜로 다시 옮기면 '미루기 취소'로 처리한다.
//   → 그날의 → 기록을 다시 살리고, 그 뒤에 생긴 줄들은 지운다 (미룬 횟수도 원래대로)
export async function moveTodo(id, newDate) {
  const run = transaction(() => {
    const current = toTodo(sql.getById.get(id));

    const passed = [];   // 지금 줄부터 거슬러 올라가며 지나온 줄들
    let node = current;
    for (let guard = 0; node.moved_from_id != null && guard < 1000; guard++) {
      const parent = sql.getById.get(node.moved_from_id);
      if (!parent) break;
      passed.push(node.id);
      if (parent.date === newDate && parent.status === 'moved') {
        sql.updateStatus.run(current.status, parent.id);
        for (const passedId of passed) sql.deleteTodo.run(passedId);
        sql.deleteUnusedTags.run();
        return parent.id;
      }
      node = parent;
    }

    sql.updateStatus.run('moved', id);
    const { lastInsertRowid } = sql.insertTodo.run({
      title: current.title,
      date: newDate,
      due_date: current.due_date,
      moved_from_id: id,
      postpone_count: current.postpone_count + 1,
    });
    attachTags(Number(lastInsertRowid), current.tags); // 태그도 따라감
    return Number(lastInsertRowid);
  });
  return getTodo(run());
}

// 다시 가져오기: → 기록(id)을 기준으로, 옮겨 간 끝의 할 일을 찾아 이 날로 되돌린다
export async function bringBack(id) {
  const record = toTodo(sql.getById.get(id));
  let tip = record;
  for (let guard = 0; tip.status === 'moved' && guard < 1000; guard++) {
    const child = sql.firstChild.get(tip.id);
    if (!child) break;
    tip = child;
  }
  if (tip.id === record.id) {
    // 옮겨 간 할 일이 이미 지워진 경우: 이 기록만 다시 살림
    sql.updateStatus.run('none', record.id);
    return getTodo(record.id);
  }
  return moveTodo(tip.id, record.date);
}

export async function deleteTodo(id) {
  const run = transaction(() => {
    const { changes } = sql.deleteTodo.run(id);
    sql.deleteUnusedTags.run(); // 아무 할 일에도 안 붙은 태그 정리
    return changes > 0;
  });
  return run();
}
