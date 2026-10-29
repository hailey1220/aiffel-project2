// 화면 코드: DB도, Supabase도, 키도 전혀 모르고 백엔드 API(/api/...)에만 요청합니다.
// 로그인 정보는 서버가 httpOnly 쿠키로 관리하므로 여기서는 손대지 않습니다.

// ── 날짜 도우미 (내 컴퓨터 시간대 기준) ──────────────────────
function toKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}
function shortDate(key) {
  const d = fromKey(key);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function daysBetween(fromK, toK) {
  return Math.round((fromKey(toK) - fromKey(fromK)) / 86400000);
}
const WEEK = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

// ── 상태 ─────────────────────────────────────────────────────
let current = toKey(new Date());
let todos = [];

// ── API 요청 ─────────────────────────────────────────────────
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith('/api/auth/')) {
    showAuth('로그인이 풀렸어요. 다시 로그인해 주세요.');
  }
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}

// ── 화면 그리기 ──────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const tpl = $('item-tpl');

function showMessage(text) {
  const box = $('message');
  box.textContent = text;
  box.hidden = !text;
}

function renderHeader() {
  const d = fromKey(current);
  const today = toKey(new Date());
  $('day-num').textContent = d.getDate();
  $('day-month').textContent = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
  $('day-week').textContent = current === today ? `${WEEK[d.getDay()]}, 오늘` : WEEK[d.getDay()];
  document.querySelector('.day').classList.toggle('is-today', current === today);
  document.title = `To do list ${d.getMonth() + 1}/${d.getDate()}`;
}

function renderTally() {
  const count = (s) => todos.filter((t) => t.status === s).length;
  const tally = $('tally');
  tally.replaceChildren();
  if (!todos.length) return;
  const parts = [
    ['t-done', '○ 완료', count('done')],
    ['t-doing', '△ 진행 중', count('doing')],
    ['t-todo', '✕ 못 함', count('todo')],
    ['', '표시 전', count('none')],
    ['', '→ 옮김', count('moved')],
  ];
  for (const [cls, label, n] of parts) {
    if (!n && !cls) continue; // '표시 전', '옮김'은 있을 때만 보여 줌
    const span = document.createElement('span');
    if (cls) span.className = cls;
    span.append(`${label} `);
    const b = document.createElement('b');
    b.textContent = n;
    span.append(b);
    tally.append(span);
  }
}

function infoBits(t) {
  const bits = [];
  const today = toKey(new Date());

  if (t.status === 'moved') {
    bits.push({ text: t.moved_to_date ? `옮긴 날: ${shortDate(t.moved_to_date)}` : '옮긴 할 일이 삭제됨' });
  }
  for (const tag of t.tags) bits.push({ text: `#${tag}`, cls: 'tag' });
  if (t.due_date) {
    const left = daysBetween(today, t.due_date);
    const dday = left === 0 ? 'D-day' : left > 0 ? `D-${left}` : `${-left}일 지남`;
    const overdue = left < 0 && t.status !== 'done';
    bits.push({ text: `마감 ${shortDate(t.due_date)} (${dday})`, cls: overdue ? 'overdue' : '' });
  }
  if (t.postpone_count > 0) {
    bits.push({
      text: `${t.postpone_count}번 미룸`,
      cls: t.postpone_count >= 3 ? 'delayed-many' : '',
    });
  }
  return bits;
}

function renderItem(t) {
  const li = tpl.content.firstElementChild.cloneNode(true);
  li.dataset.id = t.id;
  li.classList.toggle('moved', t.status === 'moved');
  li.classList.toggle('is-done', t.status === 'done');
  li.querySelector('.title').textContent = t.title; // textContent라서 HTML이 끼어들 수 없음

  const info = li.querySelector('.info');
  for (const bit of infoBits(t)) {
    const span = document.createElement('span');
    span.textContent = bit.text;
    if (bit.cls) span.className = bit.cls;
    info.append(span);
  }

  const marks = li.querySelector('.marks');
  if (t.status === 'moved') {
    marks.replaceChildren();
    const arrow = document.createElement('span');
    arrow.className = 'mark arrow';
    arrow.textContent = '→';
    arrow.setAttribute('aria-label', '다른 날로 옮김');
    marks.append(arrow);
    li.querySelector('[data-act="tomorrow"]').remove();
    li.querySelector('[data-act="pick"]').remove();
    li.querySelector('.pick-date').remove();
    li.querySelector('[data-act="edit"]').remove();
    li.querySelector('.edit').remove();
    li.querySelector('[data-act="bring-back"]').textContent =
      current === toKey(new Date()) ? '오늘로 다시 가져오기' : '이 날로 다시 가져오기';
  } else {
    li.querySelector('[data-act="bring-back"]').remove();
    for (const btn of marks.querySelectorAll('.mark')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.status === t.status));
    }
    if (t.status === 'done') {
      li.querySelector('[data-act="tomorrow"]').remove();
      li.querySelector('[data-act="pick"]').remove();
      li.querySelector('.pick-date').remove();
    }
  }
  return li;
}

function renderList() {
  $('list').replaceChildren(...todos.map(renderItem));
  $('empty').hidden = todos.length > 0;
  renderTally();
}

async function load() {
  renderHeader();
  try {
    todos = await api('GET', `/api/todos?date=${current}`);
    showMessage('');
  } catch (err) {
    todos = [];
    showMessage(`목록을 불러오지 못했어요. 서버가 켜져 있는지 확인하세요. (${err.message})`);
  }
  renderList();
}

// ── 사용자 동작 ──────────────────────────────────────────────
async function run(action) {
  try {
    showMessage('');
    await action();
    await load();
  } catch (err) {
    showMessage(err.message);
  }
}

$('add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('title').value.trim();
  if (!title) return;
  run(async () => {
    await api('POST', '/api/todos', {
      title,
      date: current,
      dueDate: $('due').value || null,
      tags: $('tags').value,
    });
    $('title').value = '';
    $('due').value = '';
    $('tags').value = '';
    $('title').focus();
  });
});

$('list').addEventListener('click', (e) => {
  const li = e.target.closest('.item');
  if (!li) return;
  const id = li.dataset.id;

  const mark = e.target.closest('button.mark');
  if (mark) {
    // 이미 선택된 표시를 다시 누르면 '표시 없음'으로 되돌림
    const status = mark.getAttribute('aria-pressed') === 'true' ? 'none' : mark.dataset.status;
    run(() => api('PATCH', `/api/todos/${id}/status`, { status }));
    return;
  }

  const act = e.target.closest('.act')?.dataset.act;
  if (act === 'tomorrow') {
    run(() => api('POST', `/api/todos/${id}/move`, { date: addDays(current, 1) }));
  } else if (act === 'pick') {
    const picker = li.querySelector('.pick-date');
    picker.hidden = false;
    picker.focus();
    picker.showPicker?.();
  } else if (act === 'edit') {
    openEdit(li);
  } else if (act === 'cancel-edit') {
    closeEdit(li);
  } else if (act === 'bring-back') {
    run(() => api('POST', `/api/todos/${id}/bring-back`));
  } else if (act === 'delete') {
    const title = li.querySelector('.title').textContent;
    if (confirm(`"${title}"을(를) 삭제할까요?`)) {
      run(() => api('DELETE', `/api/todos/${id}`));
    }
  }
});

// ── 수정 ─────────────────────────────────────────────────────
function openEdit(li) {
  document.querySelectorAll('.item .edit:not([hidden])').forEach((f) => closeEdit(f.closest('.item')));
  const t = todos.find((x) => String(x.id) === li.dataset.id);
  const form = li.querySelector('.edit');
  form.querySelector('.edit-title').value = t.title;
  form.querySelector('.edit-due').value = t.due_date || '';
  form.querySelector('.edit-tags').value = t.tags.join(', ');
  li.querySelector('.body').hidden = true;
  form.hidden = false;
  form.querySelector('.edit-title').focus();
}

function closeEdit(li) {
  li.querySelector('.edit').hidden = true;
  li.querySelector('.body').hidden = false;
}

$('list').addEventListener('submit', (e) => {
  if (!e.target.matches('.edit')) return;
  e.preventDefault();
  const form = e.target;
  const id = form.closest('.item').dataset.id;
  run(() => api('PATCH', `/api/todos/${id}`, {
    title: form.querySelector('.edit-title').value.trim(),
    dueDate: form.querySelector('.edit-due').value || null,
    tags: form.querySelector('.edit-tags').value,
  }));
});

$('list').addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && e.target.closest('.edit')) closeEdit(e.target.closest('.item'));
});

$('list').addEventListener('change', (e) => {
  if (!e.target.matches('.pick-date') || !e.target.value) return;
  const id = e.target.closest('.item').dataset.id;
  const date = e.target.value;
  run(() => api('POST', `/api/todos/${id}/move`, { date }));
});

// ── 로그인 ───────────────────────────────────────────────────
function authMessage(text, ok = false) {
  const box = $('auth-message');
  box.textContent = text || '';
  box.hidden = !text;
  box.classList.toggle('ok', ok);
}

function showAuth(text = '') {
  $('app').hidden = true;
  $('auth').hidden = false;
  document.title = 'To do list 로그인';
  authMessage(text);
  $('email').focus();
}

function showApp(email) {
  $('auth').hidden = true;
  $('app').hidden = false;
  $('me').textContent = email;
  $('password').value = '';
  current = toKey(new Date());
  load();
}

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const mode = e.submitter?.dataset.mode === 'signup' ? 'signup' : 'login';
  const buttons = e.currentTarget.querySelectorAll('button');
  buttons.forEach((b) => { b.disabled = true; });
  authMessage('');
  try {
    const result = await api('POST', `/api/auth/${mode}`, {
      email: $('email').value.trim(),
      password: $('password').value,
    });
    if (result?.needsConfirmation) {
      authMessage('가입 신청이 됐어요. 메일함에서 인증 링크를 누른 뒤 로그인해 주세요.', true);
    } else {
      showApp(result.email);
    }
  } catch (err) {
    authMessage(err.message);
  } finally {
    buttons.forEach((b) => { b.disabled = false; });
  }
});

$('logout').addEventListener('click', async () => {
  try { await api('POST', '/api/auth/logout'); } catch { /* 이미 풀린 경우도 화면은 로그인으로 */ }
  todos = [];
  renderList();
  showAuth();
});

$('prev').addEventListener('click', () => { current = addDays(current, -1); load(); });
$('next').addEventListener('click', () => { current = addDays(current, 1); load(); });
$('go-today').addEventListener('click', () => { current = toKey(new Date()); load(); });


// 시작: 이미 로그인돼 있으면 바로 목록, 아니면 로그인 화면
(async () => {
  try {
    const me = await api('GET', '/api/auth/me');
    showApp(me.email);
  } catch {
    showAuth();
  }
})();
