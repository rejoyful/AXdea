# AXdea · 아이디어 놀이터

팀원들의 아이디어를 **DiceBear 캐릭터**로 띄우는 물리 캔버스 웹앱. 캐릭터가 화면을 탱탱볼처럼 튕겨다니고,
클릭하면 아이디어 카드가 열립니다. 작성자는 기본 **가려지며**, 이름을 **`박찬영`** 으로 입장한 세션에서만 작성자가 보입니다.
좋아요·댓글·반려·라운드 아카이브·주제(라운드) 분할 비교 · 네온 전광판 UI 포함.

## 구조 (모노레포 · Next.js)

```
AXdea/
├─ apps/web/                 # Next.js 앱 (프론트 + /api) = 배포 단위
│  ├─ app/
│  │  ├─ page.js             # 기존 캔버스 UI(바닐라 JS)를 그대로 감싼 페이지
│  │  ├─ layout.js, globals.css
│  │  ├─ lib/db.js           # MySQL 접속 풀
│  │  └─ api/**/route.js     # REST API (MySQL) — Supabase/Express 대체
│  ├─ public/js/{app,pure,config,api}.js   # 앱 로직(바닐라 JS)
│  └─ db/schema.sql          # (신규 세팅용) MySQL 스키마
├─ ecosystem.config.js       # PM2 설정 (deploy.sh용, 앱 이름 web)
├─ .env.example              # 루트 .env 템플릿 (DB 접속정보)
└─ deploy.sh                 # 표준 배포 스크립트(사내) — 루트에 배치해 실행
```

- **웹서버(Next)**: `192.168.100.105:5114` — 앱 + `/api`를 한 프로세스가 서빙 (같은 오리진 → CORS 불필요)
- **DB서버(MySQL)**: `192.168.100.76:3306`, DB명 `axdea` (**웹서버와 다른 호스트**)
- **도메인**: `axdea.hakjisa.kr` (사내 상위 nginx가 5114로 프록시)
- **실시간**: 4초 폴링

## 배포 (사내 표준 deploy.sh 사용)

192.168.100.105 웹서버에서:
```
git clone https://github.com/rejoyful/AXdea.git
cd AXdea
cp .env.example .env         # DB_PASSWORD 등 채우기 (PORT=5114, DB_HOST=192.168.100.76, DB_PORT=3306)
bash deploy.sh               # git pull → npm install → next build → PM2(web:5114) 재기동
```
`deploy.sh` 가 `apps/web` 을 빌드하고 PM2 `web`(포트 5114)로 상시 구동합니다. 도메인/HTTPS는 사내 상위 nginx가 5114로 프록시.

## 로컬 개발
```
cd apps/web
npm install
DB_PASSWORD=... npm run dev      # http://localhost:5114 (DB는 원격 MySQL)
```
API가 안 붙으면(오프라인 등) 앱은 자동으로 로컬 데모 모드로 동작합니다.

## 참고
- 데이터는 Supabase → MySQL 이전 완료(이 저장소는 MySQL 백엔드 기준).
- 로직 단위 테스트: `cd apps/web && npm test`.
