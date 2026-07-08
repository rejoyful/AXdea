# AXdea 백엔드 (사내 서비스)

Express 서버 하나가 **앱(정적 파일) + `/api`** 를 함께 서빙하고, 데이터는 **원격 DB서버의 MySQL**에 저장합니다.

## 구성 (웹서버 ≠ DB서버, 서로 다른 호스트)

```
              [ 웹서버 192.168.100.105:5114 ]            [ DB서버 192.168.100.76:3306 ]
브라우저 ─▶ https://axdea.hakjisa.kr ─(리버스프록시)─▶ Express(server.js) ──네트워크──▶ MySQL / axdea
             (2차 도메인)                                앱 + /api
```

- **접속 도메인**: `axdea.hakjisa.kr` (2차 도메인) — 팀은 이 주소로 접속
- **웹서버**: `192.168.100.105:5114` (세팅 예정, **현재는 로컬 구동**). Express가 앱과 `/api`를 함께 서빙 (같은 오리진 → CORS 불필요)
- **DB서버**: `192.168.100.76:3306` (MySQL, DB명 `axdea`) — **웹서버와 다른 호스트**. 웹서버가 이 주소로 네트워크 접속
- ⚠️ **웹서버(192.168.100.105)에서 DB서버(192.168.100.76:3306)로 가는 네트워크 경로·방화벽이 열려 있어야** 합니다.

## 배포 (웹서버에)

1. **Node.js 18+ 설치** (`node -v`)
2. 이 저장소를 웹서버에 복사/`git clone`
3. 접속 정보 설정 — `server/` 에서:
   ```
   cp .env.example .env
   # .env 에 PORT=5114, DB_HOST=192.168.100.76, DB_PORT=3306, DB_PASSWORD=... 채우기
   ```
4. 설치 & 실행:
   ```
   cd server
   npm install
   npm start
   ```
   콘솔에 `AXdea 웹서버 실행: http://0.0.0.0:5114 → DB(원격) 192.168.100.76:3306/axdea` 가 뜨면 정상.

## 도메인 연결 (axdea.hakjisa.kr → Express)

Express는 **5114** 포트에서 뜹니다. 도메인·HTTPS는 **리버스 프록시(nginx)** 로 앞단에서 연결합니다.
준비된 설정 파일: **`deploy/nginx-axdea.conf`**
```
sudo cp deploy/nginx-axdea.conf /etc/nginx/sites-available/axdea
sudo ln -s /etc/nginx/sites-available/axdea /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d axdea.hakjisa.kr     # HTTPS 자동 설정
```
- DNS: `axdea.hakjisa.kr` A레코드 → 웹서버 IP(**192.168.100.105**)
- HTTPS 인증서: Let's Encrypt(certbot)

## 상시 구동 (택1)

**A. pm2 (권장)** — 준비된 `ecosystem.config.js` 사용:
```
npm install -g pm2
cd server
pm2 start ecosystem.config.js
pm2 save
pm2 startup     # 안내되는 명령 1줄 실행 → 부팅 시 자동 시작
```
로그: `pm2 logs axdea` · 재시작: `pm2 restart axdea` · 상태: `pm2 status`

**B. systemd** — `deploy/axdea.service` 참고(경로/사용자만 수정):
```
sudo cp deploy/axdea.service /etc/systemd/system/axdea.service
sudo systemctl daemon-reload && sudo systemctl enable --now axdea
journalctl -u axdea -f
```

> 서버는 부팅 시 DB 연결을 자가진단합니다. 로그에 `✅ DB 연결 정상` 이 뜨면 OK,
> `⚠️ DB 연결 실패` 면 105→76:3306 네트워크/방화벽/비밀번호를 확인하세요.

## 환경변수 (`server/.env`)

| 키 | 기본값 | 설명 |
|---|---|---|
| `PORT` | 5114 | 웹서버(Express) 포트 (리버스 프록시가 이 포트로 프록시) |
| `DB_HOST` | 192.168.100.76 | **DB서버** 호스트 (웹서버와 다른 호스트) |
| `DB_PORT` | 3306 | DB 포트 |
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
- **실시간**: 앱이 4초 폴링으로 반영(웹소켓 불필요).
- **DB 스키마**: 이미 이전 완료. 빈 DB에 새로 세팅할 땐 `schema.sql` 실행.
- **인증**: 사내 신뢰 기반이라 API 자체 인증은 없음. 외부에 열 경우 인증/HTTPS를 반드시 추가.
