// ─────────────────────────────────────────────────────────────
// DB 접근 코드는 전부 이 파일에만 있습니다. (길 B: Supabase + 로그인)
//
// 모든 함수는 첫 번째 인자로 'client'를 받습니다.
// client는 요청마다 만든, '지금 로그인한 사용자'의 Supabase 연결입니다(supabase.js).
// 관리자 키를 쓰지 않으므로 모든 질의에 RLS가 적용되고,
// 코드에 실수가 있어도 다른 사용자의 할 일은 절대 나오지 않습니다.
// ─────────────────────────────────────────────────────────────

export class NotFound extends Error {}

const COLUMNS =
  'id, title, status, date, due_date, moved_from_id, postpone_count, created_at, updated_at, moved_to_date, tags';

function check(error) {
  if (error) throw error;
}

export async function listTodosByDate(client, date) {
  const { data, error } = await client
    .from('todo_view')
    .select(COLUMNS)
    .eq('date', date)
    .order('is_moved', { ascending: true })
    .order('id', { ascending: true });
  check(error);
  return data;
}

export async function getTodo(client, id) {
  const { data, error } = await client.from('todo_view').select(COLUMNS).eq('id', id).maybeSingle();
  check(error);
  return data;
}

export async function createTodo(client, { title, date, dueDate = null, tags = [] }) {
  const { data: id, error } = await client.rpc('create_todo', {
    p_title: title, p_date: date, p_due_date: dueDate, p_tags: tags,
  });
  check(error);
  return getTodo(client, id);
}

// 수정: 내용·마감일·태그를 한 번에 바꿈 (태그는 새 목록으로 통째로 교체)
export async function updateTodo(client, id, { title, dueDate = null, tags = [] }) {
  const { error } = await client.rpc('update_todo', {
    p_id: id, p_title: title, p_due_date: dueDate, p_tags: tags,
  });
  if (error?.code === 'P0002') throw new NotFound();
  check(error);
  return getTodo(client, id);
}

// status는 none / todo / doing / done 중 하나 (moved는 미루기로만 바뀜)
export async function setStatus(client, id, status) {
  const { error } = await client
    .from('todos')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  check(error);
  return getTodo(client, id);
}

// 미루기: DB 함수 하나로 처리 (지나온 날짜로 옮기면 미루기 취소)
export async function moveTodo(client, id, newDate) {
  const { data: newId, error } = await client.rpc('move_todo', { p_id: id, p_date: newDate });
  if (error?.code === 'P0002') throw new NotFound();
  check(error);
  return getTodo(client, newId);
}

// 다시 가져오기: → 기록(id)에서 옮겨 간 끝의 할 일을 이 날로 되돌림
export async function bringBack(client, id) {
  const { data: restoredId, error } = await client.rpc('bring_back_todo', { p_id: id });
  if (error?.code === 'P0002') throw new NotFound();
  check(error);
  return getTodo(client, restoredId);
}

export async function deleteTodo(client, id) {
  const { data, error } = await client.rpc('delete_todo', { p_id: id });
  check(error);
  return data === true;
}
