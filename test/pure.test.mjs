import assert from "node:assert";
import { isRevealer, pickAvatar, stepBody, resolveWall, resolveCollision } from "../js/pure.js";

// 열람 판정
assert.equal(isRevealer("박찬영"), true);
assert.equal(isRevealer(" 박찬영 "), true);
assert.equal(isRevealer("박찬영님"), false);
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

// 충돌: 겹치면 밀어냄
const [A, B] = resolveCollision({ x: 0, y: 0, vx: 0, vy: 0, r: 20 }, { x: 10, y: 0, vx: 0, vy: 0, r: 20 });
assert.ok(B.x - A.x >= 20, "separated to >= sum of radii-ish");

// 충돌: 안 겹치면 그대로
const pair = resolveCollision({ x: 0, y: 0, vx: 1, vy: 1, r: 20 }, { x: 100, y: 0, vx: 0, vy: 0, r: 20 });
assert.deepEqual(pair[0], { x: 0, y: 0, vx: 1, vy: 1, r: 20 });

console.log("PASS pure.test");
