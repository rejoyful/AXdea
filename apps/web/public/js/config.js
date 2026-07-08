// AXdea 설정
// ── 백엔드 API 주소. 앱과 API를 같은 서버(Express)가 서빙하므로 상대경로 "/api" 사용.
//    (앱을 다른 곳에서 열어 API가 없으면 자동으로 로컬 데모 모드로 동작)
export const API_BASE = "/api";

// 관리자(전체 열람 권한) 이름 목록 — 정확히 일치할 때만 작성자 공개/관리 기능 노출
export const REVEAL_NAMES = ["박찬영", "이해원"];
// 팀장 Pick(메달)은 팀장 본인만 가능
export const TEAM_LEAD_NAME = "박찬영";

// ── 입장 코드(본인확인) ──────────────────────────────────────────────
// 공개 레포이므로 코드 "원문"은 절대 저장하지 않고 SHA-256 해시만 둔다.
// 코드를 바꾸려면 Claude에게 알려주면 해시로 바꿔 준다(원문은 git에 안 남음).
// 일반 멤버: 이름 + 공용 입장코드 → 입장
export const ACCESS_CODE_HASH = "158a323a7ba44870f23d96f1516dd70aa48e9a72db4ebb026b0a89e212a208ab";
// 관리자: 이름 + 각자의 관리자 코드 → 전체열람 권한
export const ADMIN_CODE_HASHES = {
  "박찬영": "1cea97c28cd639e0f3307fdb53660175e9e838ff799211075128e63060eb93eb",
  "이해원": "32625be384ed05129315617a65f0b070e7b35a4257bdd11e0d98185c6f0cecfe",
};

// hue = 각 카테고리의 네온 컬러(플래그/링). 네온 스펙트럼에 고르게 분포
export const CATEGORIES = [
  { key: "service",  label: "서비스개선", hue: 190 }, // 시안
  { key: "feature",  label: "신규기능",   hue: 275 }, // 퍼플
  { key: "ai",       label: "AI실험",     hue: 322 }, // 마젠타/핑크
  { key: "auto",     label: "업무자동화", hue: 145 }, // 라임
  { key: "research", label: "리서치",     hue: 45  }, // 옐로우
  { key: "etc",      label: "기타",       hue: 220 }, // 블루
];

// 네온 팔레트 (작성 시 오브제 내부 컬러 선택)
export const COLORS = ["#22e3ff", "#5bff9d", "#ffe45e", "#ff9d3d", "#ff3d9a", "#c07bff", "#5b8cff", "#ff77d4"];

// 분할 비교 패널별 네온 LED 색상 (라운드마다 다른 색으로 구분)
export const PANEL_COLORS = ["#4dff92", "#22e3ff", "#ff5db1", "#ffd24d"]; // 그린·시안·핑크·옐로우

// 원을 잘 채우는 스타일만 (thumbs·open-peeps 등 여백 많은 건 제외)
export const AVATAR_STYLES = ["fun-emoji", "bottts", "adventurer", "big-smile", "lorelei", "notionists", "micah", "personas"];
