// AXdea 설정
// ── Supabase: supabase.com에서 AXdea 프로젝트 만든 뒤 아래 2줄만 채우세요.
//    (비워두면 브라우저 로컬 데모 모드로 동작합니다 — 새로고침 시 초기화)
export const SB_URL = "";   // 예: https://xxxxxxxx.supabase.co
export const SB_KEY = "";   // anon public key

// 전체 열람 권한을 가진 이름 (정확히 일치할 때만 작성자 공개)
export const REVEAL_NAME = "박찬영";

export const CATEGORIES = [
  { key: "service",  label: "서비스개선", hue: 205 },
  { key: "feature",  label: "신규기능",   hue: 262 },
  { key: "ai",       label: "AI실험",     hue: 300 },
  { key: "auto",     label: "업무자동화", hue: 152 },
  { key: "research", label: "리서치",     hue: 38  },
  { key: "etc",      label: "기타",       hue: 220 },
];

export const COLORS = ["#FFD6A5", "#CAFFBF", "#9BF6FF", "#BDB2FF", "#FFC6FF", "#FDFFB6", "#FFADAD", "#A0C4FF"];

export const AVATAR_STYLES = ["fun-emoji", "bottts", "adventurer", "thumbs", "open-peeps", "big-smile", "lorelei", "notionists"];
