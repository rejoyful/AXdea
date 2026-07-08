# AXdea 백엔드 (사내망 전용)

Express 서버 하나가 **앱(정적 파일) + `/api`(MySQL)** 를 함께 서빙합니다.
Supabase를 대체하며, 팀은 사내망에서 `http://192.168.100.76:8080` 로 접속합니다.

```
브라우저(앱)  ──/api──▶  Express(server.js)  ──▶  MySQL(axdea)
        ▲ 정적파일 ──────────┘
```

## 서버(192.168.100.76)에 배포하기

1. **Node.js 18+ 설치** (`node -v` 로 확인)
2. 이 저장소를 서버에 복사(또는 `git clone`)
3. 접속 정보 설정 — `server/` 에서:
   ```
   cp .env.example .env
   # .env 를 열어 DB_PASSWORD 등 채우기
   ```
   (또는 실행 시 환경변수로 넘겨도 됩니다: `DB_PASSWORD=... node server.js`)
4. 설치 & 실행:
   ```
   cd server
   npm install
   npm start
   ```
   콘솔에 `AXdea 서버 실행: http://0.0.0.0:8080` 이 뜨면 정상.
5. 팀은 브라우저에서 **http://192.168.100.76:8080** 접속.

> 방화벽에서 **8080 포트(사내망)** 를 열어두세요. 포트는 `.env` 의 `PORT` 로 변경 가능.

## 상시 구동 (권장)

`npm start` 는 터미널을 닫으면 종료됩니다. 재부팅에도 자동으로 뜨게 하려면 **pm2** 사용:
```
npm install -g pm2
cd server
pm2 start server.js --name axdea
pm2 save
pm2 startup     # 안내되는 명령 1줄 실행 → 부팅 시 자동 시작
```
로그: `pm2 logs axdea` · 재시작: `pm2 restart axdea`

## 환경변수 (`server/.env`)

| 키 | 기본값 | 설명 |
|---|---|---|
| `PORT` | 8080 | 서버 포트 |
| `DB_HOST` | 192.168.100.76 | MySQL 호스트 |
| `DB_PORT` | 3306 | MySQL 포트 |
| `DB_USER` | axdea | MySQL 사용자 |
| `DB_PASSWORD` | (필수) | MySQL 비밀번호 |
| `DB_NAME` | axdea | 데이터베이스 |

## API 개요 (앱 내부에서 사용)

- `GET /api/health`
- `GET/PUT /api/state/:key` — active_round 등
- `GET /api/rounds`, `POST /api/rounds/rename`
- `GET /api/ideas?round=…` / `?rounds=a,b`, `POST /api/ideas`, `PATCH/DELETE /api/ideas/:id`
- `GET /api/comments?idea_id=…`, `POST /api/comments`, `PATCH/DELETE /api/comments/:id`
- `GET /api/counts?me=…`, `POST /api/likes`, `DELETE /api/likes?idea_id=&voter=`

## 참고
- **실시간**: 앱이 4초 폴링으로 반영합니다(웹소켓 불필요).
- **DB 스키마**: 이미 Supabase에서 이전 완료. 빈 DB에 새로 세팅할 땐 `schema.sql` 실행.
- **인증**: 사내망 신뢰 기반이라 API에 별도 인증 없음. 외부 노출 시 인증/HTTPS를 추가하세요.
