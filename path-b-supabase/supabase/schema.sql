-- ════════════════════════════════════════════════════════════
-- To do list: Supabase 스키마 (회원가입·로그인 버전)
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여 넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.
--
-- 회원 데이터 원칙
--  - 회원(이메일·비밀번호)은 Supabase Auth의 auth.users 표가 관리합니다.
--    비밀번호는 원문이 아니라 해시로 저장되고, 이메일은 중복 가입이 막혀 있습니다.
--  - 우리 표에는 비밀번호 칸이 없고, 할 일의 주인(user_id)만 기록합니다.
--
-- 사용자별 접근 제한 (RLS)
--  - 모든 표에 RLS를 켜고, 로그인한 사용자(authenticated)는 '자기 것'만
--    조회·추가·수정·삭제할 수 있는 정책을 둡니다.
--  - 로그인하지 않은 접근(anon)에는 아무것도 허용하지 않습니다.
--  - 함수는 SECURITY INVOKER(기본값)라서 호출한 사용자의 RLS가 그대로 적용됩니다.
-- ════════════════════════════════════════════════════════════

-- ⚠ 로그인 없는 버전의 schema.sql을 이미 실행한 프로젝트라면, 아래 네 줄의 '--'를 지우고
--   한 번 함께 실행해 예전 표를 지운 뒤 시작하세요. (그 안의 할 일도 지워집니다)
-- drop view if exists public.todo_view;
-- drop table if exists public.todo_tags;
-- drop table if exists public.tags;
-- drop table if exists public.todos;

-- ── 1. 표 ────────────────────────────────────────────────────
create table if not exists public.todos (
  id             bigint generated always as identity primary key,
  user_id        uuid   not null default auth.uid()
                        references auth.users (id) on delete cascade,
  title          text   not null check (char_length(title) between 1 and 200),
  -- none(아직 표시 안 함) / done(○) / doing(△) / todo(✕) / moved(→)
  status         text   not null default 'none'
                        check (status in ('none', 'todo', 'doing', 'done', 'moved')),
  date           date   not null,
  due_date       date,
  moved_from_id  bigint references public.todos (id) on delete set null,
  postpone_count int    not null default 0 check (postpone_count >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists todos_user_date_idx  on public.todos (user_id, date);
create index if not exists todos_moved_from_idx on public.todos (moved_from_id);

create table if not exists public.tags (
  id      bigint generated always as identity primary key,
  user_id uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  name    text not null check (char_length(name) between 1 and 30),
  unique (user_id, name)               -- 태그 이름은 사용자마다 따로
);

create table if not exists public.todo_tags (
  todo_id bigint not null references public.todos (id) on delete cascade,
  tag_id  bigint not null references public.tags (id)  on delete cascade,
  primary key (todo_id, tag_id)
);
create index if not exists todo_tags_tag_idx on public.todo_tags (tag_id);

-- ── 2. RLS 켜기 ──────────────────────────────────────────────
alter table public.todos     enable row level security;
alter table public.tags      enable row level security;
alter table public.todo_tags enable row level security;

-- ── 3. RLS 정책: 자기 데이터만 ───────────────────────────────
-- (select auth.uid()) 형태는 Supabase 권장 방식(줄마다 다시 계산하지 않음)
drop policy if exists "todos: 본인 조회" on public.todos;
drop policy if exists "todos: 본인 추가" on public.todos;
drop policy if exists "todos: 본인 수정" on public.todos;
drop policy if exists "todos: 본인 삭제" on public.todos;
create policy "todos: 본인 조회" on public.todos for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "todos: 본인 추가" on public.todos for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "todos: 본인 수정" on public.todos for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "todos: 본인 삭제" on public.todos for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "tags: 본인 조회" on public.tags;
drop policy if exists "tags: 본인 추가" on public.tags;
drop policy if exists "tags: 본인 삭제" on public.tags;
create policy "tags: 본인 조회" on public.tags for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "tags: 본인 추가" on public.tags for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "tags: 본인 삭제" on public.tags for delete to authenticated
  using ((select auth.uid()) = user_id);

-- 연결 표: 할 일과 태그가 둘 다 내 것일 때만
drop policy if exists "todo_tags: 본인 조회" on public.todo_tags;
drop policy if exists "todo_tags: 본인 추가" on public.todo_tags;
drop policy if exists "todo_tags: 본인 삭제" on public.todo_tags;
create policy "todo_tags: 본인 조회" on public.todo_tags for select to authenticated
  using (exists (select 1 from public.todos t
                  where t.id = todo_id and t.user_id = (select auth.uid())));
create policy "todo_tags: 본인 추가" on public.todo_tags for insert to authenticated
  with check (
    exists (select 1 from public.todos t
             where t.id = todo_id and t.user_id = (select auth.uid()))
    and exists (select 1 from public.tags g
                 where g.id = tag_id and g.user_id = (select auth.uid()))
  );
create policy "todo_tags: 본인 삭제" on public.todo_tags for delete to authenticated
  using (exists (select 1 from public.todos t
                  where t.id = todo_id and t.user_id = (select auth.uid())));

-- ── 4. 조회용 뷰 (security_invoker: 보는 사람의 RLS가 적용됨) ─
create or replace view public.todo_view
with (security_invoker = true) as
select
  t.id, t.title, t.status, t.date, t.due_date,
  t.moved_from_id, t.postpone_count, t.created_at, t.updated_at,
  (t.status = 'moved') as is_moved,
  (select c.date from public.todos c
    where c.moved_from_id = t.id
    order by c.id limit 1) as moved_to_date,
  coalesce((select array_agg(g.name order by g.name)
              from public.todo_tags tt
              join public.tags g on g.id = tt.tag_id
             where tt.todo_id = t.id), '{}') as tags
from public.todos t;

-- ── 5. 여러 줄을 한 번에 바꾸는 작업은 함수로 (전부 되거나 전부 안 되거나) ─
create or replace function public.attach_tags(p_todo_id bigint, p_tags text[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_name   text;
  v_tag_id bigint;
begin
  foreach v_name in array coalesce(p_tags, '{}') loop
    insert into public.tags (name) values (v_name)
      on conflict (user_id, name) do nothing;
    select id into v_tag_id from public.tags
     where user_id = auth.uid() and name = v_name;
    insert into public.todo_tags (todo_id, tag_id) values (p_todo_id, v_tag_id)
      on conflict do nothing;
  end loop;
end;
$$;

-- 아무 할 일에도 안 붙은 '내' 태그 정리
create or replace function public.cleanup_my_tags()
returns void
language sql
set search_path = ''
as $$
  delete from public.tags g
   where g.user_id = auth.uid()
     and not exists (select 1 from public.todo_tags tt where tt.tag_id = g.id);
$$;

create or replace function public.create_todo(
  p_title text, p_date date, p_due_date date default null, p_tags text[] default '{}'
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.todos (title, date, due_date)
  values (p_title, p_date, p_due_date)
  returning id into v_id;

  perform public.attach_tags(v_id, p_tags);
  return v_id;
end;
$$;

-- 수정: 내용·마감일·태그를 한 번에 바꿈 (태그는 새 목록으로 통째로 교체)
create or replace function public.update_todo(
  p_id bigint, p_title text, p_due_date date default null, p_tags text[] default '{}'
)
returns bigint
language plpgsql
set search_path = ''
as $$
begin
  update public.todos
     set title = p_title, due_date = p_due_date, updated_at = now()
   where id = p_id;                                  -- RLS: 내 것만 바뀜
  if not found then
    raise exception 'todo % not found', p_id using errcode = 'P0002';
  end if;

  delete from public.todo_tags where todo_id = p_id;
  perform public.attach_tags(p_id, p_tags);
  perform public.cleanup_my_tags();
  return p_id;
end;
$$;

-- 미루기: 원래 줄은 'moved'로 남기고, 이어지는 새 줄을 만든다
-- 단, 이 할 일이 거쳐 온 날짜로 다시 옮기면 '미루기 취소'로 처리한다.
create or replace function public.move_todo(p_id bigint, p_date date)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_cur    public.todos%rowtype;
  v_node   public.todos%rowtype;
  v_parent public.todos%rowtype;
  v_passed bigint[] := '{}';
  v_new    bigint;
  v_guard  int := 0;
begin
  select * into v_cur from public.todos where id = p_id for update;  -- RLS: 내 것만 보임
  if not found then
    raise exception 'todo % not found', p_id using errcode = 'P0002';
  end if;
  if v_cur.status = 'moved' or v_cur.date = p_date then
    raise exception 'todo % cannot be moved', p_id using errcode = 'P0001';
  end if;

  v_node := v_cur;
  while v_node.moved_from_id is not null and v_guard < 1000 loop
    select * into v_parent from public.todos where id = v_node.moved_from_id;
    exit when not found;
    v_passed := v_passed || v_node.id;
    if v_parent.date = p_date and v_parent.status = 'moved' then
      update public.todos set status = v_cur.status, updated_at = now() where id = v_parent.id;
      delete from public.todos where id = any (v_passed);
      perform public.cleanup_my_tags();
      return v_parent.id;
    end if;
    v_node := v_parent;
    v_guard := v_guard + 1;
  end loop;

  update public.todos set status = 'moved', updated_at = now() where id = p_id;

  insert into public.todos (title, date, due_date, moved_from_id, postpone_count)
  values (v_cur.title, p_date, v_cur.due_date, v_cur.id, v_cur.postpone_count + 1)
  returning id into v_new;

  insert into public.todo_tags (todo_id, tag_id)
  select v_new, tag_id from public.todo_tags where todo_id = p_id;

  return v_new;
end;
$$;

-- 다시 가져오기: → 기록(p_id)에서 옮겨 간 끝의 할 일을 찾아 이 날로 되돌린다
create or replace function public.bring_back_todo(p_id bigint)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_rec   public.todos%rowtype;
  v_tip   public.todos%rowtype;
  v_child public.todos%rowtype;
  v_guard int := 0;
begin
  select * into v_rec from public.todos where id = p_id for update;
  if not found then
    raise exception 'todo % not found', p_id using errcode = 'P0002';
  end if;
  if v_rec.status <> 'moved' then
    raise exception 'todo % is not moved', p_id using errcode = 'P0001';
  end if;

  v_tip := v_rec;
  while v_tip.status = 'moved' and v_guard < 1000 loop
    select * into v_child from public.todos where moved_from_id = v_tip.id order by id limit 1;
    exit when not found;
    v_tip := v_child;
    v_guard := v_guard + 1;
  end loop;

  if v_tip.id = v_rec.id then
    update public.todos set status = 'none', updated_at = now() where id = p_id;
    return p_id;
  end if;

  return public.move_todo(v_tip.id, v_rec.date);
end;
$$;

create or replace function public.delete_todo(p_id bigint)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_count int;
begin
  delete from public.todos where id = p_id;          -- RLS: 내 것만 지워짐
  get diagnostics v_count = row_count;
  perform public.cleanup_my_tags();
  return v_count > 0;
end;
$$;

-- ── 6. 권한(GRANT): 로그인한 사용자에게만, 필요한 만큼만 ────
-- (2026-10-30 이후 Supabase는 새 표에 권한을 자동으로 주지 않음)
revoke all on public.todos, public.tags, public.todo_tags, public.todo_view from anon;
grant select, insert, update, delete on public.todos     to authenticated;
grant select, insert, delete         on public.tags      to authenticated;
grant select, insert, delete         on public.todo_tags to authenticated;
grant select                         on public.todo_view to authenticated;

-- RLS 확인용: 로그인하지 않은 접근도 표 앞까지는 오게 두고, RLS가 막는 걸 볼 수 있게 함
-- (정책이 authenticated 전용이라 anon은 조회 0줄, 추가는 RLS 위반으로 거부됨)
grant select, insert on public.todos to anon;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.attach_tags(bigint, text[])',
    'public.cleanup_my_tags()',
    'public.create_todo(text, date, date, text[])',
    'public.update_todo(bigint, text, date, text[])',
    'public.move_todo(bigint, date)',
    'public.bring_back_todo(bigint)',
    'public.delete_todo(bigint)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
