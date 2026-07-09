import assert from "node:assert";
import { createHash } from "node:crypto";
import { isRevealer, sha256HexSync, pickAvatar, stepBody, resolveWall, resolveWallRegion, resolveCollision, layoutRegions } from "../public/js/pure.js";

// 순수 SHA-256 폴백이 표준 SHA-256과 동일한지 (ASCII·유니코드·빈문자·긴문자)
for (const s of ["", "a", "axdea2026", "pcy2026!", "lhw2026!", "한글코드!@#", "x".repeat(100)]) {
  assert.equal(sha256HexSync(s), createHash("sha256").update(s).digest("hex"), `sha256 mismatch: ${s}`);
}
// config의 공용 입장코드 해시와 일치하는지 (코드 "2026")
assert.equal(sha256HexSync("2026"), "158a323a7ba44870f23d96f1516dd70aa48e9a72db4ebb026b0a89e212a208ab");

// 관리자(열람) 판정 — 박찬영 · 이해원 · 조용선 · 김인성
assert.equal(isRevealer("박찬영"), true);
assert.equal(isRevealer(" 박찬영 "), true);
assert.equal(isRevealer("이해원"), true);
assert.equal(isRevealer(" 이해원 "), true);
assert.equal(isRevealer("조용선"), true);
assert.equal(isRevealer("김인성"), true);
assert.equal(isRevealer("박찬영님"), false);
assert.equal(isRevealer("이해원2"), false);
// 새 관리자 코드 해시가 config와 일치
assert.equal(sha256HexSync("0339"), "a7502d14f2f3ca2937540068d122a73a1f5d7efcc1913439d28e0d22cf7db301");
assert.equal(sha256HexSync("8827"), "2cb4c57c545815f3e447294ee771f0f7513c3aae5275bb1dc8c7e436e9a72de3");
assert.equal(isRevealer("홍길동"), false);
assert.equal(isRevealer(""), false);

// 아바타: 결정적
const a = pickAvatar("seed-1");
assert.ok(a.style && a.seed === "seed-1");
assert.deepEqual(pickAvatar("seed-1"), a);

// step
const b = stepBody({ x: 10, y: 10, vx: 2, vy: -3, r: 20 }, 1);
assert.equal(b.x, 12);
assert.equal(b.y, 7);

// 벽 반사
const w = resolveWall({ x: -5, y: 100, vx: -4, vy: 0, r: 20 }, 800, 600, 0.8);
assert.ok(w.vx > 0, "vx should flip positive");
assert.ok(w.x >= 20, "x corrected inside");

// 영역 벽 반사: 패널 오른쪽 벽 넘으면 되튕김 + 보정
const rg = resolveWallRegion({ x: 395, y: 100, vx: 5, vy: 0, r: 20 }, { x0: 0, y0: 0, x1: 400, y1: 300 }, 0.8);
assert.ok(rg.vx < 0, "vx should reflect negative at right wall");
assert.ok(rg.x <= 380, "x corrected inside region");
// 왼쪽 경계가 0이 아닌 패널(오른쪽 절반)에서도 왼쪽 벽 반사
const rg2 = resolveWallRegion({ x: 205, y: 100, vx: -5, vy: 0, r: 20 }, { x0: 200, y0: 0, x1: 400, y1: 300 }, 0.8);
assert.ok(rg2.vx > 0 && rg2.x >= 220, "left wall of right panel reflects");

// 분할 영역 배치: 2=좌우, 3=3열, 4=2×2
const L2 = layoutRegions(["a", "b"], 800, 600);
assert.deepEqual(L2.a, { x0: 0, y0: 0, x1: 400, y1: 600 });
assert.deepEqual(L2.b, { x0: 400, y0: 0, x1: 800, y1: 600 });
const L3 = layoutRegions(["a", "b", "c"], 900, 600);
assert.deepEqual(L3.c, { x0: 600, y0: 0, x1: 900, y1: 600 });
const L4 = layoutRegions(["a", "b", "c", "d"], 800, 600);
assert.deepEqual(L4.a, { x0: 0, y0: 0, x1: 400, y1: 300 });
assert.deepEqual(L4.d, { x0: 400, y0: 300, x1: 800, y1: 600 });

// 충돌: 겹치면 밀어냄
const [A, B] = resolveCollision({ x: 0, y: 0, vx: 0, vy: 0, r: 20 }, { x: 10, y: 0, vx: 0, vy: 0, r: 20 });
assert.ok(B.x - A.x >= 20, "separated to >= sum of radii-ish");

// 충돌: 안 겹치면 그대로
const pair = resolveCollision({ x: 0, y: 0, vx: 1, vy: 1, r: 20 }, { x: 100, y: 0, vx: 0, vy: 0, r: 20 });
assert.deepEqual(pair[0], { x: 0, y: 0, vx: 1, vy: 1, r: 20 });

console.log("PASS pure.test");
