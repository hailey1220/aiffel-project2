# To do list (길 B: Supabase + 회원가입·로그인)

길 A와 같은 앱에서 저장소를 Supabase(무료 클라우드 Postgres)로 바꾸고,
회원가입·로그인을 붙여 **각자 자기 할 일만** 보고 쓸 수 있게 한 버전입니다.

## 처음 설정 (윈도우 기준)

1. https://supabase.com 에 가입하고 **New project** 로 무료 프로젝트를 만듭니다.
2. 왼쪽 메뉴 **SQL Editor** → 새 쿼리 → `supabase/schema.sql` 내용을 전부 붙여 넣고 **Run**.
3. **Authentication → Sign In / Providers → Email** 에서 **Confirm email** 을 끕니다.
   (켜 두면 가입할 때마다 인증 메일이 필요하고, 무료 메일 발송은 시간당 몇 통으로 제한됩니다)
4. **Project Settings → API Keys** 에서 Publishable key(`sb_publishable_...`)를,
   **Project Settings → Data API** 에서 Project URL(`https://xxxx.supabase.co`)을 복사합니다.
5. 이 폴더에서 터미널을 열고:

```
npm install
copy .env.example .env
notepad .env
```

메모장에서 `xxxx` 자리를 4번 값으로 바꾸고 저장합니다.

```
npm start
```

브라우저에서 http://localhost:3000 → 회원가입 → 할 일 추가.

## 회원 데이터는 이렇게 다룹니다

| 원칙 | 이 앱에서 |
|---|---|
| 인증은 직접 만들지 않는다 | Supabase Auth + 공식 라이브러리 `@supabase/ssr` |
| 비밀번호는 해시로 저장 | Supabase Auth가 해시로 저장. 우리 표에는 비밀번호 칸이 없음 |
| 이메일은 유일하게 | Supabase Auth 회원 표가 중복 가입을 막음 |
| 필요한 것만 수집 | 이메일과 비밀번호만 받음 |
| 로그인 상태 유지 | 토큰을 화면 코드가 읽을 수 없는 httpOnly 쿠키에 보관, 만료되면 자동 갱신 |
| 사용자별 접근 제한 | 할 일마다 `user_id`(주인) 기록 + RLS로 자기 것만 조회·추가·수정·삭제 |

백엔드는 관리자 키(secret)를 쓰지 않고 **publishable 키 + 로그인한 사용자의 토큰**으로 DB에 접근합니다.
그래서 모든 요청에 RLS가 적용되어, 코드에 실수가 있어도 다른 사람의 할 일은 나오지 않습니다.

## RLS 확인

```
npm run check-rls
```

로그인 없이 접근하면 막히는지 확인합니다. 앱에서 두 계정으로 가입한 뒤 `.env`의
`RLS_TEST_EMAIL_A/B`, `RLS_TEST_PASSWORD_A/B`를 채우면 **B가 A의 할 일을 보거나 고치거나 지울 수 없는지**도 확인합니다.
마지막 "기록용 한 줄"을 PRD에 옮겨 적으세요.

## 구조

```
supabase/schema.sql   표(user_id 포함), RLS 정책, 권한, DB 함수
server/supabase.js    요청마다 '로그인한 사용자'의 Supabase 연결 + 로그인 확인
server/db.js          DB 읽기·쓰기 (Supabase를 부르는 유일한 파일)
server/index.js       API 서버: 입력값 검사, 회원가입·로그인 API, 할 일 API
public/               화면: /api 에만 요청 (키도 Supabase 코드도 없음)
scripts/check-rls.js  RLS 확인
```

## Render 배포 준비물

| 항목 | 값 |
|---|---|
| 코드 보관 위치 | GitHub 저장소 (`.env` 는 올라가지 않음) |
| 서비스 | Web Service, Node, Free |
| Root Directory | 이 폴더 경로 (예: `path-b-supabase`) |
| Build / Start | `npm install` / `npm start` |
| Health Check Path | `/healthz` |
| 환경 변수 | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `HOST=0.0.0.0`, `NODE_ENV=production` |
| Supabase 설정 | Authentication → URL Configuration 의 Site URL 을 Render 주소로 |

채점자는 배포 주소에서 회원가입만 하면 바로 써 볼 수 있고, 다른 사람의 할 일은 보이지 않습니다.
무료 Web Service는 15분 동안 접속이 없으면 잠들어, 첫 접속에 1분 정도 걸릴 수 있습니다.
