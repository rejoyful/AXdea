// 순수 로직 (부작용 없음) — node로 검증 가능, 브라우저에서도 그대로 import
import { REVEAL_NAMES, AVATAR_STYLES } from "./config.js";

// 관리자 판정: 트림 후 관리자 목록과 정확히 일치할 때만
export function isRevealer(name) {
  const n = (name || "").trim();
  return REVEAL_NAMES.some((r) => r === n);
}

// SHA-256(hex) 순수 구현 — crypto.subtle이 없는(비보안 컨텍스트/HTTP) 환경 폴백용.
// UTF-8 바이트 기준이라 Node crypto와 동일한 해시를 낸다.
export function sha256HexSync(str) {
  const rr = (v, a) => (v >>> a) | (v << (32 - a));
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const bytes = [];
  const utf8 = unescape(encodeURIComponent(String(str)));
  for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i) & 0xff);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push((bitLen / Math.pow(2, i * 8)) & 0xff);
  const w = new Array(64);
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = (bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
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

// 분할 보기: 카테고리 목록 → 각 패널의 사각 영역 (2=좌우, 3=3열, 4=2×2)
export function layoutRegions(cats, W, H) {
  const n = cats.length;
  const cols = n === 2 ? 2 : n === 3 ? 3 : 2;
  const rows = n <= 3 ? 1 : 2;
  const map = {};
  cats.forEach((cat, i) => {
    const cx = i % cols, cy = Math.floor(i / cols);
    const w = W / cols, h = H / rows;
    map[cat] = { x0: cx * w, y0: cy * h, x1: (cx + 1) * w, y1: (cy + 1) * h };
  });
  return map;
}

// 임의의 사각 영역(패널) 안에서 벽 반사 — resolveWall의 일반화
export function resolveWallRegion(b, rg, damp) {
  let { x, y, vx, vy, r } = b;
  if (x < rg.x0 + r) { x = rg.x0 + r; vx = Math.abs(vx) * damp; }
  if (x > rg.x1 - r) { x = rg.x1 - r; vx = -Math.abs(vx) * damp; }
  if (y < rg.y0 + r) { y = rg.y0 + r; vy = Math.abs(vy) * damp; }
  if (y > rg.y1 - r) { y = rg.y1 - r; vy = -Math.abs(vy) * damp; }
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
