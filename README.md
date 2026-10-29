# 과제 제출 - 내 Todo 앱과 PRD

**To do list**: 날짜별 할 일을 ○ 완료 / △ 진행 중 / ✕ 못 함으로 표시하고,
다른 날로 미루면 원래 날짜에 기록(→)이 남는 Todo 앱입니다.

| 폴더 | 내용 |
|---|---|
| `path-a-sqlite/` | 길 A: 내 컴퓨터의 SQLite 파일에 저장 |
| `path-b-supabase/` | 길 B: Supabase(클라우드 Postgres)에 저장 + 회원가입·로그인, 사용자별 RLS |
| `PRD.md` | 기획 문서와 확인 기록 |

## 실행

```
cd path-a-sqlite      (또는 path-b-supabase)
npm install
copy .env.example .env
npm start
```

브라우저에서 http://localhost:3000

길 B는 Supabase 설정이 먼저 필요합니다. `path-b-supabase/README.md`를 보세요.
배포된 주소에서는 회원가입 후 바로 써 볼 수 있고, 각자 자기 할 일만 보입니다.

## 배포 주소

(배포했다면 여기에 적기 — 처음 열 때 1분 정도 걸릴 수 있습니다)https://aiffel-project2.onrender.com (처음 열 때 1분 정도 걸릴 수 있습니다)
