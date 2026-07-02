// 순수 로직 (부작용 없음) — node로 검증 가능, 브라우저에서도 그대로 import
import { REVEAL_NAME, AVATAR_STYLES } from "./config.js";

// 전체 열람 판정: 트림 후 정확히 일치할 때만
export function isRevealer(name) {
  return (name || "").trim() === REVEAL_NAME;
}

// 문자열 seed → 안정적 32bit 해시 (FNV-1a)
export function hash(s) {
  let h = 2166136261;
  s = String(s);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// seed → 결정적 아바타(스타일+seed). 같은 seed면 항상 같은 캐릭터
export function pickAvatar(seed) {
  const h = hash(seed);
  return { style: AVATAR_STYLES[h % AVATAR_STYLES.length], seed: String(seed) };
}

// 위치를 속도만큼 이동
export function stepBody(b, dt) {
  return { ...b, x: b.x + b.vx * dt, y: b.y + b.vy * dt };
}

// 벽 반사: 경계를 넘으면 위치 보정 + 속도 반전(감쇠)
export function resolveWall(b, W, H, damp) {
  let { x, y, vx, vy, r } = b;
  if (x < r)      { x = r;      vx = Math.abs(vx) * damp; }
  if (x > W - r)  { x = W - r;  vx = -Math.abs(vx) * damp; }
  if (y < r)      { y = r;      vy = Math.abs(vy) * damp; }
  if (y > H - r)  { y = H - r;  vy = -Math.abs(vy) * damp; }
  return { ...b, x, y, vx, vy };
}

// 두 원이 겹치면 부드럽게 밀어내고 약간의 반발 속도 부여
export function resolveCollision(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 0.001;
  const overlap = (a.r + b.r) - dist;
  if (overlap <= 0) return [a, b];
  const nx = dx / dist, ny = dy / dist, push = overlap / 2;
  const A = { ...a, x: a.x - nx * push, y: a.y - ny * push, vx: a.vx - nx * 0.5, vy: a.vy - ny * 0.5 };
  const B = { ...b, x: b.x + nx * push, y: b.y + ny * push, vx: b.vx + nx * 0.5, vy: b.vy + ny * 0.5 };
  return [A, B];
}
