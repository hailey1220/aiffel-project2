# 내 Todo 앱 (길 A: 로컬 SQLite)

날짜별 할 일을 ○ 완료 / △ 진행 중 / ✕ 시작 전으로 표시하고,
다른 날로 미루면 원래 날짜에 기록(→)이 남는 Todo 앱입니다.

## 실행

Node.js 22.13 이상이 필요합니다 (`node -v`로 확인).

```bash
npm install            # 라이브러리 설치 (처음 한 번)
cp .env.example .env   # 윈도우 명령 프롬프트는: copy .env.example .env
npm start              # 서버 실행
```

브라우저에서 http://localhost:3000 을 엽니다. 끌 때는 터미널에서 `Ctrl + C`.

## 폴더 구조

```
server/db.js      DB에 접근하는 유일한 파일 (Node.js 내장 SQLite 사용)
server/index.js   API 서버: 입력값 검사 후 db.js 호출
public/           화면 (index.html, style.css, app.js) — /api 에만 요청
todo.db           실행하면 자동으로 생기는 DB 파일 (깃에 안 올라감)
```

## API

| 하는 일 | 요청 |
|---|---|
| 날짜별 목록 | `GET /api/todos?date=2026-10-29` |
| 추가 | `POST /api/todos` `{ title, date, dueDate?, tags? }` |
| 상태 바꾸기 | `PATCH /api/todos/:id/status` `{ status: "todo" \| "doing" \| "done" }` |
| 미루기 | `POST /api/todos/:id/move` `{ date }` |
| 삭제 | `DELETE /api/todos/:id` |

## 길 B로 갈 때 메모

- 바꿀 곳은 `server/db.js` 하나입니다. 함수 이름과 돌려주는 모양만 지키면 나머지는 그대로 둡니다.
- Supabase 주소와 키는 `.env`에 넣고, `.env.example`에는 이름만 적습니다.
- 배포할 때는 `server/index.js`의 `app.listen(PORT, '127.0.0.1')`을 클라우드에 맞게 바꿔야 합니다 (지금은 내 컴퓨터에서만 접속되도록 막아 둔 상태).
