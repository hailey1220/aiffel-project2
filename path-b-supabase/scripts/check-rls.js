// RLS 확인: npm run check-rls
// 1) 로그인하지 않은 채 공개 키로 들어오면 막히는지
// 2) (.env에 시험용 계정 두 개를 적었다면) B가 A의 할 일을 보거나 고치거나 지울 수 없는지
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key || key.includes('xxxx')) {
  console.error('\n.env 에 SUPABASE_URL 과 SUPABASE_PUBLISHABLE_KEY 가 있어야 확인할 수 있습니다.\n');
  process.exit(1);
}
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const newClient = () => createClient(url, key, options);
const ok = (b) => (b ? '→ 차단 OK' : '→ ⚠ 막히지 않음!');
let allGood = true;

console.log('\n── RLS 확인 결과 ─────────────────────────────');

// 1) 로그인 안 함
const guest = newClient();
const { data: seen, error: e1 } = await guest.from('todos').select('id');
const { error: e2 } = await guest.from('todos').insert({ title: 'RLS 침입 시험', date: '2026-01-01' });
const readBlocked = (!e1 && seen.length === 0) || e1?.code === '42501';
console.log(`[로그인 안 함] 조회: ${e1 ? '거부됨' : `${seen.length}개 보임`}  ${ok(readBlocked)}`);
console.log(`[로그인 안 함] 추가: ${e2 ? '거부됨' : '성공해 버림'}  ${ok(Boolean(e2))}`);
allGood &&= readBlocked && Boolean(e2);

// 2) 사용자 A vs B
const { RLS_TEST_EMAIL_A: ea, RLS_TEST_PASSWORD_A: pa, RLS_TEST_EMAIL_B: eb, RLS_TEST_PASSWORD_B: pb } = process.env;
let twoUsers = false;
if (ea && pa && eb && pb) {
  const a = newClient();
  const b = newClient();
  const la = await a.auth.signInWithPassword({ email: ea, password: pa });
  const lb = await b.auth.signInWithPassword({ email: eb, password: pb });
  if (la.error || lb.error) {
    console.log(`시험용 계정 로그인 실패: ${(la.error || lb.error).message} (앱에서 먼저 두 계정으로 가입해 두세요)`);
    allGood = false;
  } else {
    const { data: id } = await a.rpc('create_todo', { p_title: 'RLS 시험용 (A의 할 일)', p_date: '2026-01-01' });
    const { data: bSees } = await b.from('todo_view').select('id').eq('id', id);
    const { data: bUpd } = await b.from('todos').update({ title: '해킹' }).eq('id', id).select('id');
    const { data: bDel } = await b.from('todos').delete().eq('id', id).select('id');
    const { data: aStill } = await a.from('todos').select('title').eq('id', id).single();
    await a.rpc('delete_todo', { p_id: id });

    const r1 = bSees.length === 0;
    const r2 = (bUpd ?? []).length === 0 && aStill?.title === 'RLS 시험용 (A의 할 일)';
    const r3 = (bDel ?? []).length === 0 && Boolean(aStill);
    console.log(`[B → A의 할 일] 조회: ${bSees.length}개  ${ok(r1)}`);
    console.log(`[B → A의 할 일] 수정: ${(bUpd ?? []).length}개 바뀜  ${ok(r2)}`);
    console.log(`[B → A의 할 일] 삭제: ${(bDel ?? []).length}개 지워짐  ${ok(r3)}`);
    allGood &&= r1 && r2 && r3;
    twoUsers = true;
  }
} else {
  console.log('(사용자끼리 막히는지도 보려면 .env 에 RLS_TEST_EMAIL_A/B, RLS_TEST_PASSWORD_A/B 를 적어 주세요)');
}
console.log('──────────────────────────────────────────────');

const today = new Date().toLocaleDateString('ko-KR');
if (allGood) {
  const extra = twoUsers ? ', 다른 사용자의 할 일 조회·수정·삭제 차단' : '';
  console.log(`기록용 한 줄: RLS 켬, 로그인 없이 조회 0개·추가 거부${extra} 확인, ${today}\n`);
} else {
  console.log('Supabase SQL Editor 에서 supabase/schema.sql 을 다시 실행하고, 표마다 RLS가 켜져 있는지 확인하세요.\n');
  process.exit(1);
}
