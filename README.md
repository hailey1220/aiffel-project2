# 과제 제출 - 내 Todo 앱과 PRD

**To do list**: 날짜별 할 일을 ○ 완료 / △ 진행 중 / ✕ 못 함으로 표시하고,
다른 날로 미루면 원래 날짜에 기록(→)이 남는 Todo 앱입니다.

## 제출 요약

| 항목 | 위치 |
|---|---|
| PRD | [PRD.md](PRD.md) (클라우드 전환·RLS 확인 기록은 맨 아래 "기록") |
| 배포 주소 | https://aiffel-project2.onrender.com (처음 열 때 1분 정도 걸릴 수 있습니다. 회원가입 후 바로 사용 가능) |
| 길 A 코드 (로컬 SQLite) | [path-a-sqlite/](path-a-sqlite/) |
| 길 B 코드 (Supabase + 회원가입·로그인) | [path-b-supabase/](path-b-supabase/) |

## 작동 화면

### 1. 길 A(로컬 SQLite): 완료·삭제 후 서버를 껐다 켜도 데이터가 남음

할 일을 추가하고 ○(완료)를 누르고 다른 할 일을 삭제한 뒤, 오른쪽 터미널에서 서버를 끄고 다시 `npm start` 한 화면입니다.
`Todo 앱이 열렸습니다`가 두 번 찍혀 있고, 완료 표시가 그대로 남아 있습니다.

![길 A 재시작 후](screenshots/1-local-restart.png)

### 2. 길 B(Supabase): 완료·삭제 후 서버를 껐다 켜도 데이터가 남음

`블로그 글 작성 1개`를 완료(○)로 바꾸고, 시험용 할 일을 추가했다가 삭제한 뒤 서버를 여러 번 껐다 켠 화면입니다.
터미널에 `(Supabase 저장)`으로 세 번 켜진 기록이 있고, 완료 1개와 목록이 그대로 남아 있습니다.

![길 B 재시작 후](screenshots/2-cloud-restart.png)

### 3. Supabase에 실제로 저장된 데이터

SQL Editor에서 `todos` 표를 조회한 결과입니다. 할 일 이름, 상태(`done` 완료 / `none` 표시 전 / `moved` 미룸), 날짜,
그리고 할 일의 주인(`user_id`)이 함께 저장되어 있습니다.

![Supabase todos 표](screenshots/3-supabase-table.png)

### 4. RLS 확인: 다른 계정으로 로그인하면 같은 날 할 일이 보이지 않음

3번 표에서 첫 번째 계정은 10월 29일에 할 일이 있지만, 두 번째 계정으로 로그인하면 같은 날짜가 비어 있습니다.
데이터는 DB에 있어도 주인만 볼 수 있도록 RLS가 막고 있습니다.

![다른 계정 화면](screenshots/4-rls-other-account.png)

## 추가 기능: 미루기 기록

**미루기 전 (10월 29일)**: 완료한 `도서관 책 대여`와 아직 못 한 할 일 4개

![미루기 전](screenshots/5-postpone-before.png)

**미룬 뒤 (10월 29일)**: 원래 날짜에 → 기록이 남고, "이 날로 다시 가져오기"로 취소할 수 있음

![미룬 뒤 원래 날짜](screenshots/6-postpone-moved.png)

**다음 날 (10월 30일)**: 옮겨 온 할 일에 "1번 미룸"이 표시되어 얼마나 지연됐는지 알 수 있음

![다음 날](screenshots/7-postpone-next-day.png)

## 실행 방법

```
cd path-a-sqlite      (또는 path-b-supabase)
npm install
copy .env.example .env
npm start
```

브라우저에서 http://localhost:3000

길 B는 Supabase 설정이 먼저 필요합니다. [path-b-supabase/README.md](path-b-supabase/README.md)를 보세요.
