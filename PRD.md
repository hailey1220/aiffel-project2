# PRD: To do list

## 무엇
내 컴퓨터에서 도는 웹 Todo 앱. 날짜별로 할 일을 관리하고, 진행 상태와 미룬 기록을 남긴다.
길 A(로컬 SQLite)로 완성한 뒤, 길 B에서 저장소를 Supabase(클라우드 Postgres)로 옮기고 회원가입·로그인을 붙인다.

## 기술
- 백엔드: JavaScript (Node.js + Express)
- 화면: 웹 브라우저 (HTML/CSS/JavaScript), http://localhost:3000
- 저장: 길 A는 SQLite 파일(`todo.db`, Node.js 내장 SQLite), 길 B는 Supabase Postgres
- 회원가입·로그인(길 B): Supabase Auth (공식 라이브러리 `@supabase/ssr`, 직접 만들지 않음)
- 무료 도구만 사용

## 기본 기능 (CRUD)
- 추가: 내용 + 날짜(기본값 오늘), 마감일·태그는 선택
- 조회: 날짜별 목록, 기본은 오늘, 이전/다음 날로 이동
- 수정: 진행 상태 변경, 내용·마감일·태그 수정 ("수정" 버튼으로 그 자리에서)
- 삭제

## 내가 넣은 기능
1. 진행 상태 표시: ○ 완료 / △ 시작했지만 미완료 / ✕ 시작 못 함 / → 이동됨
   - 새 할 일은 아무 표시 없이 시작 (아직 손대지 않은 것과 '못 했다'고 표시한 것을 구분)
   - 클릭으로 ○△✕ 선택, 선택된 표시를 다시 누르면 해제
2. 날짜 이동(미루기)
   - 다른 날짜로 옮기면 원래 날짜에 "→ 이동됨" 기록이 남음 (얼마나 지연되는지 확인하기 위해)
   - 옮겨진 할 일에 미룬 횟수 표시, 3번 이상이면 강조
   - 마음이 바뀌면 → 기록에서 "다시 가져오기"로 미루기를 취소 (중복 줄 없이 원래 할 일이 되살아나고, 미룬 횟수도 원래대로)
3. 마감일(D-day 표시)과 태그

## DB 구조
- `todos`: id, (user_id), title, status, date, due_date, moved_from_id, postpone_count, created_at, updated_at
  - 미루기: 원래 줄은 지우지 않고 status를 `moved`로 바꾼 뒤, `moved_from_id`로 연결된 새 줄을 만든다
- `tags`: id, (user_id), name
- `todo_tags`: todo_id, tag_id (할 일과 태그 연결)
- 괄호 안 `user_id`는 길 B에서 추가 (할 일의 주인). 회원 정보(이메일, 비밀번호 해시)는 Supabase Auth의 `auth.users`가 관리

## 규칙
- 비밀값은 `.env`에, `.env`와 `todo.db`는 `.gitignore`에
- DB 접근 코드는 백엔드(`server/db.js`)에만, 화면은 백엔드 API에만 요청
- 길 B: 화면에서 Supabase를 직접 부르지 않고, 접속 키는 백엔드 `.env`에서만 사용
- 길 B: 비밀번호는 원문 저장 금지(Supabase Auth가 해시로 저장), 이메일은 유일, 이메일·비밀번호만 수집
- 길 B: 관리자(secret) 키를 쓰지 않고 publishable 키 + 사용자 로그인 토큰으로 접속해 RLS가 항상 적용되게 함
- 길 B: 모든 표에 RLS를 켜고, 로그인한 사용자는 자기 할 일만 조회·추가·수정·삭제 가능
  (확인: `npm run check-rls`)

## 진행 순서
1. 길 A: SQLite로 전체 기능 구현 → 직접 확인
2. 길 B: Supabase로 저장소 전환 + 회원가입·로그인 + RLS → 직접 확인
3. Render 배포 준비물 정리 (선택: 실제 배포)

## 완성 확인
| 확인 항목 | 길 A (로컬) | 길 B (Supabase) |
|---|---|---|
| 앱을 껐다 켜도 할 일이 남는다 | ☑ | ☑ |
| ○△✕ 클릭(완료 등)이 저장된다 | ☑ | ☐ |
| 삭제가 동작한다 | ☑ | ☐ |
| 내일로 미루면 오늘엔 →, 내일엔 "1번 미룸"이 보인다 | ☑ | ☐ |
| Supabase Table Editor에 내 할 일이 보인다 | | ☑ |
| 회원가입·로그인·로그아웃이 된다 | | ☑ |
| Table Editor의 할 일에 user_id(주인)가 기록된다 | | ☑ |
| 다른 계정으로 로그인하면 내 할 일이 안 보인다 (RLS) | | ☑ |

## 배포 준비물 (Render)
| 항목 | 내용 |
|---|---|
| 코드 보관 위치 | GitHub 저장소 (`.env`는 올리지 않음) |
| 서비스 | Web Service, Node, Free |
| Build / Start | `npm install` / `npm start` |
| Health Check | `/healthz` |
| 환경 변수 | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `HOST=0.0.0.0`, `NODE_ENV=production` |
| Supabase 설정 | Authentication의 Site URL을 Render 주소로, Confirm email 끄기 |
| 채점 | 배포 주소에서 회원가입하면 바로 사용 가능 (첫 접속 1분 정도 걸릴 수 있음) |

## 기록
- 길 A 확인: 2026-10-29, 할 일 추가·○△✕ 표시·삭제·미루기 동작, 서버를 껐다 켜도 todo.db에 남아 있음 확인
- 클라우드 전환: 2026-10-29, Supabase 프로젝트 생성 후 schema.sql 실행, 앱에서 추가한 할 일이 Table Editor에 user_id와 함께 저장되고 서버를 껐다 켜도 남아 있음 확인
- RLS 확인: 2026-10-29, 계정 A로 할 일 4개 추가 후 계정 B로 로그인하니 같은 날 목록 0개, A의 할 일이 보이지 않음 확인
- 배포 URL: (도전·성공 시 작성)
