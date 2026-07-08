// AXdea 설정
// ── 백엔드 API 주소. 앱과 API를 같은 서버(Express)가 서빙하므로 상대경로 "/api" 사용.
//    (앱을 다른 곳에서 열어 API가 없으면 자동으로 로컬 데모 모드로 동작)
export const API_BASE = "/api";

// 전체 열람 권한을 가진 이름 (정확히 일치할 때만 작성자 공개)
export const REVEAL_NAME = "박찬영";

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

export const AVATAR_STYLES = ["fun-emoji", "bottts", "adventurer", "thumbs", "open-peeps", "big-smile", "lorelei", "notionists"];
