# AXdea · 아이디어 놀이터

팀원들의 아이디어를 **DiceBear 캐릭터**로 띄우는 물리 캔버스 웹앱.
캐릭터들이 화면을 탱탱볼처럼 튕겨다니고, 클릭하면 아이디어 카드가 열립니다.
작성자는 기본적으로 **가려지며**, 이름을 **`박찬영`** 으로 입장한 세션에서만 모두의 작성자가 보입니다.

정적 웹앱(빌드 없음) + Supabase + GitHub Pages. (rhythm 프로젝트와 동일한 방식)

## 무엇을 할 수 있나

- `+` 버튼으로 아이디어 올리기 (제목·내용·카테고리·색상)
- 아이디어 = 캐릭터. 잡아서 던지면 튕기고, 짧게 누르면 카드가 열림
- 카드에서 댓글 달기
- 상단에서 카테고리 필터 / 라이트·다크 전환
- `박찬영` 입장 시 전체 작성자 열람 + 아이디어 삭제

---

## 처음 한 번만: Supabase 연결 (약 3분)

키를 넣기 전에도 **데모 모드**로 바로 열어볼 수 있습니다(새로고침 시 초기화).
팀과 공유하려면 아래를 따라 실제 DB를 연결하세요.

1. **프로젝트 생성**
   [supabase.com](https://supabase.com) 로그인 → **New project** → 이름 `AXdea` → 생성(1~2분).

2. **테이블 만들기**
   좌측 메뉴 **SQL Editor** → **New query** → 이 저장소의 [`supabase.sql`](supabase.sql) 전체를 붙여넣고 **Run**.

3. **키 2개 복사**
   좌측 **Project Settings → API** 에서:
   - `Project URL`
   - `anon` `public` key

4. **키 붙여넣기**
   [`js/config.js`](js/config.js) 상단 두 줄을 채웁니다:
   ```js
   export const SB_URL = "https://xxxxxxxx.supabase.co";
   export const SB_KEY = "여기에-anon-public-key";
   ```

> 참고: 이 anon key는 브라우저에 공개돼도 되는 키입니다. RLS 정책(내부 신뢰 기반: 익명 읽기/쓰기 허용)이 `supabase.sql`에 포함돼 있습니다. 파일럿이 끝나면 프로젝트를 삭제하거나 정책을 조이면 됩니다.

---

## 로컬에서 실행

브라우저에서 `file://` 로 열면 ES 모듈이 막히므로 간단한 서버로 엽니다:

```bash
cd AXdea
python3 -m http.server 8000      # 또는: npx serve
# 브라우저에서 http://localhost:8000
```

## 배포 (GitHub Pages)

```bash
cd AXdea
git remote add origin https://github.com/<계정>/AXdea.git   # 최초 1회
git branch -M main
git add -A && git commit -m "init: AXdea"
git push -u origin main
```
GitHub → 저장소 **Settings → Pages → Branch: `main` / `root`** 저장.
1~2분 뒤 `https://<계정>.github.io/AXdea/` 에서 접속.

### (선택) 저장 자동화
rhythm처럼 "작업 후 자동 커밋·푸시"를 원하면 `.claude/settings.json`에 Stop 훅을 넣을 수 있습니다.
rhythm 프로젝트의 `.claude/settings.json`을 그대로 복사해 오면 됩니다.

---

## 파일 구조

| 파일 | 역할 |
|---|---|
| `index.html` | 마크업 (캔버스 · 헤더 · 모달) |
| `styles.css` | Twenty 무드 UI + 캐릭터/캔버스 스타일 (라이트/다크) |
| `js/config.js` | **Supabase 키**, 카테고리·색상·아바타 상수 |
| `js/pure.js` | 순수 로직 (물리 · 열람 판정 · 아바타) |
| `js/app.js` | 상태 · Supabase · 물리 루프 · 렌더 · 이벤트 |
| `supabase.sql` | 테이블 + RLS 생성 스크립트 |
| `test/pure.test.mjs` | 순수 로직 검증 (`npm test`) |

## 커스터마이즈 팁

- 카테고리/색상/아바타 스타일 → `js/config.js`
- 전체 열람 이름(현재 `박찬영`) → `js/config.js`의 `REVEAL_NAME`
- 캐릭터 물리 느낌(속도·마찰·튕김) → `js/app.js`의 `loop()`
