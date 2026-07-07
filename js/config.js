// AXdea 설정
// ── Supabase: supabase.com에서 AXdea 프로젝트 만든 뒤 아래 2줄만 채우세요.
//    (비워두면 브라우저 로컬 데모 모드로 동작합니다 — 새로고침 시 초기화)
export const SB_URL = "https://oqnluqfzcdbpmwoxjnoh.supabase.co";
export const SB_KEY = "sb_publishable_k0aWd3vDWjsyOsOS9rubWQ_Xq3MuSas";

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

export const AVATAR_STYLES = ["fun-emoji", "bottts", "adventurer", "thumbs", "open-peeps", "big-smile", "lorelei", "notionists"];
