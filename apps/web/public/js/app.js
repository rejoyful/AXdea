// ===== AXdea — 앱 로직 =====
import { CATEGORIES, COLORS, PANEL_COLORS, ACCESS_CODE_HASH, ADMIN_CODE_HASHES } from "./config.js";
import { api } from "./api.js";
import { icon } from "./icons.js";
import { isRevealer, sha256HexSync, pickAvatar, stepBody, resolveWall, resolveWallRegion, resolveCollision, layoutRegions } from "./pure.js";

const $ = (s) => document.querySelector(s);
const TOP_INSET = 92; // 전광판 아래로만 아이디어가 돌아다니도록 상단 여백(스테이지 기준)
const catOf = (key) => CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];
// scale로 인물이 원 안을 꽉 채우게(비어보이는 아바타 개선)
const avatarUrl = (style, seed) => `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&scale=115`;
const isRejected = (idea) => !!idea && idea.status === "rejected";
const isSelected = (idea) => !!idea && idea.status === "selected";
const isPicked = (idea) => !!idea && (idea.pick === 1 || idea.pick === "1" || idea.pick === true);

// ---------- 상태 ----------
const state = {
  me: localStorage.getItem("axdea_name") || "",
  reveal: false,
  ideas: [],          // 서버/데모의 아이디어 행
  bodies: new Map(),  // id -> { x,y,vx,vy,r, el, dragging }
  filter: null,       // 카테고리 key or null
  openId: null,       // 열린 카드의 idea id
  editId: null,       // 수정 중인 idea id (null이면 신규 작성)
  compose: { category: "etc", color: COLORS[0] },
  commentCounts: {},  // idea_id -> 댓글 수
  posCounts: {},      // idea_id -> 해보자 댓글 수
  negCounts: {},      // idea_id -> 아쉬워 댓글 수
  coffeeCounts: {},   // idea_id -> '커피' 태그 댓글 수
  likeCounts: {},     // idea_id -> 좋아요 수
  myLikes: new Set(), // 내가 좋아요 누른 적 있는 idea_id
  cat: null,          // 고양이 상태
  roundsEnabled: false, // 아카이브 구조 사용 가능 여부(DB 감지)
  activeRound: "lab-day", // 현재 진행 중인 라운드
  viewRound: "lab-day",   // 지금 보고 있는 라운드 (다르면 읽기 전용)
  splitMode: false,       // 라운드(주제) 분할 비교 보기
  splitRounds: [],        // 나란히 비교할 라운드 이름(2~4)
};
// 저장된 분할 보기 설정 복원 (클라이언트 전용)
try {
  const sv = JSON.parse(localStorage.getItem("axdea_split") || "null");
  if (sv && Array.isArray(sv.rounds)) { state.splitMode = !!sv.mode; state.splitRounds = sv.rounds.slice(0, 4); }
} catch (e) { /* ignore */ }
const readonly = () => effectiveSplit() || (state.roundsEnabled && state.viewRound !== state.activeRound);
// 재접속 시 전체열람은 이전에 관리자 코드로 확인된 경우에만 복원
state.reveal = isRevealer(state.me) && localStorage.getItem("axdea_admin") === "1";

// ---------- 데이터 레이어 (백엔드 API + 데모 폴백) ----------
let DEMO = false;                 // 부팅 시 API 헬스체크 실패하면 데모 모드
let demoIdeas = [];
let demoComments = [];
let demoLikes = [];
let demoSeq = 0;
const uid = () => `demo-${Date.now()}-${demoSeq++}`;

async function loadIdeas() {
  const split = effectiveSplit();
  if (DEMO) {
    if (split) return demoIdeas.filter((i) => state.splitRounds.includes(i.round || "lab-day"));
    return demoIdeas.filter((i) => !state.roundsEnabled || (i.round || "lab-day") === state.viewRound);
  }
  if (split) return await api.ideasByRounds(state.splitRounds);
  if (state.roundsEnabled) return await api.ideasByRound(state.viewRound);
  return await api.allIdeas();
}
// 백엔드 연결 확인 — 실패하면 데모 모드로 전환. 라운드 기능은 항상 사용 가능.
async function detectRounds() {
  if (DEMO) return true;
  try { await api.health(); return true; }
  catch (e) { console.warn("[AXdea] API 연결 실패 → 데모 모드로 전환", e); DEMO = true; demoIdeas = seedDemo(); return true; }
}
async function loadActiveRound() {
  if (DEMO) return "lab-day";
  const r = await api.getState("active_round");
  return (r && r.value) || "lab-day";
}
async function setActiveRoundDB(name) {
  if (DEMO) return true;
  try { await api.putState("active_round", name); return true; }
  catch (e) { console.error(e); alert("라운드 전환 실패: " + e.message); return false; }
}
// 라운드 목록 + 아이디어 수 (최신 활동 순)
async function loadRounds() {
  const counts = {}, last = {};
  if (DEMO) {
    demoIdeas.forEach((i) => { const r = i.round || "lab-day"; counts[r] = (counts[r] || 0) + 1; if (!last[r] || i.created_at > last[r]) last[r] = i.created_at; });
  } else {
    const rows = await api.rounds();
    rows.forEach((r) => { const key = r.round || "lab-day"; counts[key] = Number(r.count); last[key] = r.last || ""; });
  }
  if (!(state.activeRound in counts)) { counts[state.activeRound] = 0; last[state.activeRound] = last[state.activeRound] || ""; }
  return Object.keys(counts).map((r) => ({ round: r, count: counts[r], last: last[r] || "" }))
    .sort((a, b) => String(b.last || "").localeCompare(String(a.last || "")));
}
async function addIdea(fields) {
  const av = pickAvatar(`${fields.author}-${Date.now()}-${Math.random()}`);
  const row = { ...fields, avatar_style: av.style, avatar_seed: av.seed };
  if (state.roundsEnabled) row.round = state.activeRound;
  if (DEMO) { const full = { id: uid(), created_at: new Date().toISOString(), status: "open", ...row }; demoIdeas.push(full); return full; }
  try { return await api.addIdea(row); }
  catch (e) { console.error(e); alert("저장 실패: " + e.message); return null; }
}
async function loadComments(ideaId) {
  if (DEMO) return demoComments.filter((c) => c.idea_id === ideaId);
  try { return await api.comments(ideaId); } catch (e) { console.error(e); return []; }
}
// 댓글 수 + 감정(해보자/아쉬워/커피) 수 + 좋아요 수 + 내 좋아요 집계 (한 번에 로드)
async function loadCounts() {
  if (DEMO) {
    const cc = {}, pc = {}, nc = {}, fc = {}, lc = {}, mine = new Set();
    demoComments.forEach((c) => {
      cc[c.idea_id] = (cc[c.idea_id] || 0) + 1;
      if (c.sentiment === "pos") pc[c.idea_id] = (pc[c.idea_id] || 0) + 1;
      else if (c.sentiment === "neg") nc[c.idea_id] = (nc[c.idea_id] || 0) + 1;
      else if (c.sentiment === "coffee") fc[c.idea_id] = (fc[c.idea_id] || 0) + 1;
    });
    demoLikes.forEach((l) => { lc[l.idea_id] = (lc[l.idea_id] || 0) + 1; if (l.voter === state.me) mine.add(l.idea_id); });
    return { cc, pc, nc, fc, lc, mine };
  }
  try {
    const d = await api.counts(state.me);
    return { cc: d.commentCounts || {}, pc: d.posCounts || {}, nc: d.negCounts || {}, fc: d.coffeeCounts || {}, lc: d.likeCounts || {}, mine: new Set(d.myLikes || []) };
  } catch (e) { console.error(e); return { cc: {}, pc: {}, nc: {}, fc: {}, lc: {}, mine: new Set() }; }
}
// 반응 추가(누적, 취소 없음)
async function likeIdea(id) {
  if (DEMO) { demoLikes.push({ idea_id: id, voter: state.me, kind: "like" }); return true; }
  try { await api.like(id, state.me); return true; } catch (e) { console.error(e); alert("좋아요 실패: " + e.message); return false; }
}
async function unlikeIdea(id) {
  if (DEMO) { demoLikes = demoLikes.filter((l) => !(l.idea_id === id && l.voter === state.me)); return true; }
  try { await api.unlike(id, state.me); return true; } catch (e) { console.error(e); alert("좋아요 취소 실패: " + e.message); return false; }
}
async function addComment(ideaId, author, body, opts = {}) {
  if (DEMO) { const full = { id: uid(), created_at: new Date().toISOString(), idea_id: ideaId, author, body, parent_id: opts.parent_id || null, sentiment: opts.sentiment || null }; demoComments.push(full); return full; }
  try { return await api.addComment(ideaId, author, body, opts); } catch (e) { console.error(e); return null; }
}
async function updateComment(id, body) {
  if (DEMO) { const c = demoComments.find((x) => x.id === id); if (c) c.body = body; return true; }
  try { await api.updateComment(id, body); return true; } catch (e) { console.error(e); alert("댓글 수정 실패: " + e.message); return false; }
}
async function deleteComment(id) {
  if (DEMO) { demoComments = demoComments.filter((x) => x.id !== id); return true; }
  try { await api.deleteComment(id); return true; } catch (e) { console.error(e); alert("댓글 삭제 실패: " + e.message); return false; }
}
async function deleteIdea(id) {
  if (DEMO) { demoIdeas = demoIdeas.filter((i) => i.id !== id); return; }
  try { await api.deleteIdea(id); } catch (e) { console.error(e); }
}
async function updateIdea(id, fields) {
  if (DEMO) { const it = demoIdeas.find((i) => i.id === id); if (it) Object.assign(it, fields); const s = state.ideas.find((i) => i.id === id); if (s) Object.assign(s, fields); return true; }
  try { await api.updateIdea(id, fields); } catch (e) { console.error(e); alert("수정 실패: " + e.message); return false; }
  const s = state.ideas.find((i) => i.id === id); if (s) Object.assign(s, fields);
  return true;
}
async function setStatus(id, status) {
  if (DEMO) { const it = demoIdeas.find((i) => i.id === id); if (it) it.status = status; return true; }
  try { await api.updateIdea(id, { status }); return true; } catch (e) { console.error(e); alert("상태 변경 실패: " + e.message); return false; }
}
async function setPick(id, pick) {
  if (DEMO) { const it = demoIdeas.find((i) => i.id === id); if (it) it.pick = pick; return true; }
  try { await api.updateIdea(id, { pick }); return true; } catch (e) { console.error(e); alert("Pick 변경 실패: " + e.message); return false; }
}
async function togglePick(id) {
  const idea = state.ideas.find((i) => i.id === id);
  if (!idea) return;
  const next = isPicked(idea) ? 0 : 1;
  if (!(await setPick(id, next))) return;
  idea.pick = next;
  applyRejected(id);   // 메달 갱신
  renderSocial(id);    // 버튼 상태 갱신
}

function seedDemo() {
  const now = Date.now();
  const mk = (t, b, cat, color, author, ago) => {
    const av = pickAvatar(author + t);
    return { id: uid(), title: t, body: b, category: cat, color, author,
      avatar_style: av.style, avatar_seed: av.seed, created_at: new Date(now - ago).toISOString() };
  };
  return [
    mk("상세페이지 자동 요약 봇", "상품 상세를 AI가 3줄로 요약해 상단에 노출하면 어떨까요?", "ai", COLORS[3], "김하나", 3600e3),
    mk("주간 리듬 회고 자동화", "rhythm 데이터를 매주 금요일 자동 정리해 슬랙으로.", "auto", COLORS[1], "이든", 7200e3),
    mk("경쟁 서비스 온보딩 비교", "toss/twenty 온보딩 플로우를 뜯어보고 정리해봐요.", "research", COLORS[2], "박찬영", 1200e3),
    mk("아이디어 놀이터(이거!)", "지금 보고 있는 이 화면이 바로 그 실험입니다 🎈", "feature", COLORS[4], "박찬영", 60e3),
  ];
}

// ---------- 헤더/필터/테마 ----------
// 카테고리 필터바는 제거됨 — 카테고리는 캐릭터의 네온 '플래그'로만 구분
function renderFilters() {}
function applyFilter() {}
function renderMe() {
  const chip = $("#me-chip");
  chip.textContent = state.me ? (state.reveal ? `${state.me} · 전체열람` : state.me) : "이름 설정";
  chip.classList.toggle("reveal", state.reveal);
}
// 정적 버튼들에 Phosphor 아이콘 주입 (플랫폼 전체 아이콘 통일)
function setupIcons() {
  const set = (sel, name, size) => { const el = document.querySelector(sel); if (el) el.innerHTML = icon(name, size); };
  set("#archive-btn .nb-ico", "archive", 18);
  set("#split-btn .nb-ico", "columns", 18);
  set("#list-btn .nb-ico", "list", 18);
  const fab = $("#fab"); if (fab) fab.innerHTML = icon("plus", 28);
  ["#card-close", "#list-close", "#archive-close", "#split-close", "#promote-close"].forEach((s) => set(s, "x", 20));
  const mqr = $("#mq-return"); if (mqr) mqr.innerHTML = `${icon("arrow-left", 15)}<span>현재 라운드로</span>`;
}
function updateThemeIcon() {
  const btn = $("#theme-btn"); if (!btn) return;
  const dark = document.documentElement.getAttribute("data-theme") !== "light";
  const ic = btn.querySelector(".nb-ico"); if (ic) ic.innerHTML = icon(dark ? "sun" : "moon", 18);
  const lbl = btn.querySelector(".nb-label"); if (lbl) lbl.textContent = dark ? "라이트" : "다크";
}
function initTheme() {
  const saved = localStorage.getItem("axdea_theme") || "dark"; // 기본 다크(네온)
  document.documentElement.setAttribute("data-theme", saved);
  updateThemeIcon();
  $("#theme-btn").onclick = () => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("axdea_theme", next);
    updateThemeIcon();
  };
}

// ---------- 이름 게이트 ----------
function openNameModal() {
  $("#name-input").value = state.me || "";
  $("#code-input").value = "";
  const err = $("#name-err"); if (err) err.hidden = true;
  $("#name-modal").hidden = false;
  setTimeout(() => $("#name-input").focus(), 50);
}
// SHA-256 → hex (본인확인용 코드 대조). 보안 컨텍스트면 네이티브, 아니면(HTTP) 순수 폴백.
async function sha256Hex(s) {
  try {
    if (globalThis.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch (e) { /* 비보안 컨텍스트 등 → 폴백 */ }
  return sha256HexSync(s);
}
function showNameError(msg) {
  const err = $("#name-err");
  if (err) { err.textContent = msg; err.hidden = false; }
  $("#code-input").focus();
}
async function saveName() {
  const name = $("#name-input").value.trim();
  const code = $("#code-input").value.trim();
  if (!name) { $("#name-input").focus(); return; }
  if (!code) { showNameError("입장 코드를 입력해 주세요."); return; }
  const admin = isRevealer(name);
  let h;
  try { h = await sha256Hex(code); }
  catch (e) { showNameError("코드 확인 중 오류가 발생했어요. 다시 시도해 주세요."); return; }
  let reveal;
  if (admin) {
    // 관리자 이름은 반드시 본인 관리자 코드로만 입장 (공용 코드로는 불가)
    if (h === ADMIN_CODE_HASHES[name]) reveal = true;
    else { showNameError("관리자 코드가 올바르지 않습니다."); return; }
  } else {
    if (h === ACCESS_CODE_HASH) reveal = false;
    else { showNameError("입장 코드가 올바르지 않습니다."); return; }
  }
  state.me = name;
  state.reveal = reveal;
  localStorage.setItem("axdea_name", name);
  if (reveal) localStorage.setItem("axdea_admin", "1"); else localStorage.removeItem("axdea_admin");
  $("#name-modal").hidden = true;
  renderMe();
  rerenderAuthors();
  rerenderMine();
  refreshCounts();
}

// ---------- 캔버스 & 물리 ----------
const stage = $("#stage");
const R = () => (window.innerWidth <= 520 ? 34 : 42);
// 스테이지가 아직 레이아웃 전이라 0으로 잡히면 뷰포트 기준으로 대체(오브제가 좌상단에 뭉치는 것 방지)
const stageSize = () => ({
  W: stage.clientWidth || window.innerWidth || 1280,
  H: stage.clientHeight || Math.max(320, window.innerHeight - 56) || 700,
});

function makeChar(idea) {
  const el = document.createElement("div");
  el.className = "char pop";
  el.dataset.id = idea.id;
  el.style.setProperty("--cat-hue", catOf(idea.category).hue);
  el.innerHTML = `
    <div class="char-halo"><i></i></div>
    <div class="char-ball" style="--ball:${idea.color}"><img alt="" src="${avatarUrl(idea.avatar_style, idea.avatar_seed)}" /></div>
    <div class="char-info">
      <span class="ci-cat" style="--cat-hue:${catOf(idea.category).hue}">${catOf(idea.category).label}</span>
      <span class="ci-count ci-like" hidden></span>
      <span class="ci-count ci-coffee" hidden></span>
      <span class="ci-count ci-cmt" hidden></span>
    </div>`;
  // 오브제마다 랜덤 idle 애니메이션 부여 (공에만)
  const ball = el.querySelector(".char-ball");
  const ANIMS = ["anim-spin", "anim-wobble", "anim-pulse", "anim-float", "anim-jelly", "anim-sway", "anim-heartbeat", "anim-swing"];
  ball.classList.add(ANIMS[Math.floor(Math.random() * ANIMS.length)]);
  ball.style.animationDelay = (-Math.random() * 4).toFixed(2) + "s";
  stage.appendChild(el);
  attachDrag(el, idea.id);

  const { W, H } = stageSize();
  const r = R();
  const body = {
    x: r + Math.random() * Math.max(1, W - 2 * r),
    y: TOP_INSET + r + Math.random() * Math.max(1, H - TOP_INSET - 2 * r),
    vx: (Math.random() - 0.5) * 2.4,
    vy: (Math.random() - 0.5) * 2.4,
    r, baseR: r, scale: 1, el, dragging: false,
    panel: "all", hidden: false, region: { x0: 0, y0: TOP_INSET, x1: W, y1: H },
  };
  state.bodies.set(idea.id, body);
  applyRejected(idea.id);
  updateCharCounts(idea.id);
  applyMine(idea.id);
  return body;
}
// 반려 상태를 캐릭터 외형에 반영 (흑백 + '반려' 스탬프)
function applyRejected(id) {
  const b = state.bodies.get(id);
  if (!b) return;
  const idea = state.ideas.find((i) => i.id === id);
  const rj = isRejected(idea), sel = isSelected(idea), pk = isPicked(idea);
  b.el.classList.toggle("rejected", rj);
  b.el.classList.toggle("selected", sel);
  b.el.classList.toggle("picked", pk);
  let stamp = b.el.querySelector(".char-stamp");
  if (rj) {
    if (!stamp) { stamp = document.createElement("div"); stamp.className = "char-stamp"; stamp.textContent = "반려"; b.el.appendChild(stamp); }
  } else if (stamp) { stamp.remove(); }
  let sbadge = b.el.querySelector(".char-selected");
  if (sel) {
    if (!sbadge) { sbadge = document.createElement("div"); sbadge.className = "char-selected"; sbadge.innerHTML = `${icon("star-fill", 11)}선정`; b.el.appendChild(sbadge); }
  } else if (sbadge) { sbadge.remove(); }
  // 팀장 Pick 메달 (좌상단, 반짝임)
  let medal = b.el.querySelector(".char-medal");
  if (pk) {
    if (!medal) { medal = document.createElement("div"); medal.className = "char-medal"; medal.title = "팀장 Pick"; medal.innerHTML = `<span class="cm-shine"></span>${icon("crown", 15)}`; b.el.appendChild(medal); }
  } else if (medal) { medal.remove(); }
}
// 수정 후 캐릭터 외형(색상/카테고리) 갱신 (아바타는 유지)
function updateCharVisual(id) {
  const b = state.bodies.get(id);
  const idea = state.ideas.find((i) => i.id === id);
  if (!b || !idea) return;
  b.el.style.setProperty("--cat-hue", catOf(idea.category).hue);
  const ball = b.el.querySelector(".char-ball");
  if (ball) ball.style.setProperty("--ball", idea.color);
  const cat = b.el.querySelector(".ci-cat");
  if (cat) { cat.textContent = catOf(idea.category).label; cat.style.setProperty("--cat-hue", catOf(idea.category).hue); }
  applyRejected(id);
}
// 캐릭터에 좋아요/댓글 수 표시 (0/0이면 숨김)
function updateCharCounts(id) {
  const b = state.bodies.get(id);
  if (!b) return;
  const l = state.likeCounts[id] || 0, c = state.commentCounts[id] || 0;
  // 좋아요가 많을수록 캐릭터가 커진다 (최대 약 2.3배)
  b.scale = 1 + Math.min(l * 0.07, 1.3);
  b.r = b.baseR * b.scale;
  // 좋아요 인챈트 궤도 — 좋아요가 쌓일수록 엇갈려 도는 색색의 광선이 늘고 빨라진다
  let tier = 0;
  if (l >= 9) tier = 3; else if (l >= 5) tier = 2; else if (l >= 2) tier = 1;
  b.el.classList.toggle("enchanted", tier >= 1);
  b.el.classList.toggle("ench-2", tier >= 2);
  b.el.classList.toggle("ench-3", tier >= 3);
  if (tier >= 1) b.el.style.setProperty("--ench-spin", Math.max(1.5, 3.6 - l * 0.14).toFixed(2) + "s"); // 많을수록 빠르게
  const f = state.coffeeCounts[id] || 0;
  const like = b.el.querySelector(".ci-like"), coff = b.el.querySelector(".ci-coffee"), cmt = b.el.querySelector(".ci-cmt");
  if (like) { if (l > 0) { like.innerHTML = `${icon("heart-fill", 12)}${l}`; like.hidden = false; } else like.hidden = true; }
  if (coff) { if (f > 0) { coff.innerHTML = `${icon("coffee-fill", 12)}${f}`; coff.hidden = false; } else coff.hidden = true; }
  if (cmt) { if (c > 0) { cmt.innerHTML = `${icon("chat-circle", 12)}${c}`; cmt.hidden = false; } else cmt.hidden = true; }
}
async function refreshCounts() {
  const { cc, pc, nc, fc, lc, mine } = await loadCounts();
  state.commentCounts = cc; state.posCounts = pc; state.negCounts = nc; state.coffeeCounts = fc; state.likeCounts = lc; state.myLikes = mine;
  state.bodies.forEach((_, id) => updateCharCounts(id));
  if (state.openId) renderSocial(state.openId);
}
// 버튼 톡 튀는 반응
function bumpBtn(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
}
// 카드 내 좋아요 + 커피 버튼 + 댓글 수
function renderSocial(id) {
  const box = document.getElementById("card-social");
  if (!box) return;
  const idea = state.ideas.find((i) => i.id === id);
  const liked = state.myLikes.has(id), picked = isPicked(idea);
  const l = state.likeCounts[id] || 0, c = state.commentCounts[id] || 0;
  box.innerHTML =
    `<button class="like-btn${liked ? " on" : ""}" id="like-btn" title="좋아요">${icon(liked ? "heart-fill" : "heart", 17)}<b>${l}</b> 좋아요</button>` +
    (state.reveal ? `<button class="pick-btn${picked ? " on" : ""}" id="pick-btn" title="팀장 Pick — 메달 부여">${icon("crown", 17)} 팀장 Pick</button>` : "") +
    `<span class="cmt-count" aria-label="댓글 ${c}개">${icon("chat-circle", 17)}<b>${c}</b> 댓글</span>`;
  document.getElementById("like-btn").onclick = () => toggleLike(id);
  if (state.reveal) document.getElementById("pick-btn").onclick = () => { togglePick(id); bumpBtn("pick-btn"); };
}
// 좋아요: 1인 1회 토글 — 누르면 반응, 다시 누르면 취소.
async function toggleLike(id) {
  if (!state.me) { openNameModal(); return; }
  const liked = state.myLikes.has(id);
  const ok = liked ? await unlikeIdea(id) : await likeIdea(id);
  if (!ok) return;
  if (liked) { state.myLikes.delete(id); state.likeCounts[id] = Math.max(0, (state.likeCounts[id] || 1) - 1); }
  else { state.myLikes.add(id); state.likeCounts[id] = (state.likeCounts[id] || 0) + 1; }
  updateCharCounts(id); renderSocial(id); bumpBtn("like-btn");
}
// 본인 글 표시: '내 글' 태그 제거(이름 깜빡으로 대체). mine 클래스만 유지
function applyMine(id) {
  const b = state.bodies.get(id);
  const idea = state.ideas.find((i) => i.id === id);
  if (!b || !idea) return;
  const mine = !!state.me && idea.author === state.me;
  b.el.classList.toggle("mine", mine);
  const tag = b.el.querySelector(".char-mine");
  if (tag) tag.remove(); // '내 글' 표현 제거 — 본인 글은 이름이 잔잔히 깜빡여 구분
}
function rerenderMine() { state.bodies.forEach((_, id) => applyMine(id)); }
function rerenderAuthors() {
  state.bodies.forEach((b, id) => {
    const idea = state.ideas.find((i) => i.id === id);
    const mine = !!state.me && idea && idea.author === state.me;
    // 관리자(전체열람)는 모든 이름, 그 외엔 본인 글 이름만 표시
    const show = idea && (state.reveal || mine);
    let tag = b.el.querySelector(".char-author");
    if (show) {
      if (!tag) { tag = document.createElement("div"); tag.className = "char-author"; b.el.appendChild(tag); }
      tag.textContent = idea.author;
      tag.classList.toggle("self", mine); // 본인 글이면 이름이 잔잔히 깜빡
    } else if (tag) { tag.remove(); }
  });
}

function loop() {
  try { loopBody(); } catch (e) { if (!loop._warned) { console.error("[loop]", e); loop._warned = true; } }
  requestAnimationFrame(loop);
}
function loopBody() {
  const { W, H } = stageSize();
  const ids = [...state.bodies.keys()];
  // 이동 + (자기 영역의) 벽
  for (const id of ids) {
    const b = state.bodies.get(id);
    if (b.hidden || b.dragging) continue;
    let nb = stepBody(b, 1);
    nb = resolveWallRegion(nb, b.region, 0.9);
    // 마찰 + 최소 속도(완전 정지 방지)
    nb.vx *= 0.995; nb.vy *= 0.995;
    const sp = Math.hypot(nb.vx, nb.vy);
    if (sp < 0.18) { nb.vx += (Math.random() - 0.5) * 0.4; nb.vy += (Math.random() - 0.5) * 0.4; }
    Object.assign(b, nb);
  }
  // 충돌은 같은 패널(영역) 안에서만
  const groups = {};
  for (const id of ids) { const b = state.bodies.get(id); if (b.hidden) continue; (groups[b.panel] = groups[b.panel] || []).push(id); }
  for (const g in groups) {
    const arr = groups[g];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = state.bodies.get(arr[i]), c = state.bodies.get(arr[j]);
        const [na, nc] = resolveCollision(a, c);
        if (!a.dragging) Object.assign(a, na);
        if (!c.dragging) Object.assign(c, nc);
      }
    }
  }
  for (const id of ids) {
    const b = state.bodies.get(id);
    if (b.hidden) continue;
    b.el.style.transform = `translate(${b.x}px, ${b.y}px) scale(${b.scale})`;
  }
  if (!effectiveSplit()) updateCats(W, H);
}

// ---------- 라운드(주제) 분할 비교 ----------
function effectiveSplit() {
  return state.splitMode && state.roundsEnabled && window.innerWidth > 640 && state.splitRounds.length >= 2;
}
function computeRegions() {
  if (!effectiveSplit()) return null;
  const { W, H } = stageSize();
  return layoutRegions(state.splitRounds, W, H);
}
function renderPanels(regions) {
  const box = $("#panels");
  if (!regions) { box.innerHTML = ""; return; }
  box.innerHTML = state.splitRounds.map((rnd, i) => {
    const rg = regions[rnd];
    const color = PANEL_COLORS[i % PANEL_COLORS.length];
    const count = state.ideas.filter((x) => (x.round || "lab-day") === rnd).length;
    return `<div class="panel round-panel" style="left:${rg.x0}px;top:${rg.y0}px;width:${rg.x1 - rg.x0}px;height:${rg.y1 - rg.y0}px;--led:${color}">
      <div class="panel-head"><i class="ph-led"></i><span class="ph-name">${esc((rnd || "").toUpperCase())}</span><span class="panel-count">${count}</span></div>
    </div>`;
  }).join("");
}
// 현재 뷰(통합/분할)에 맞게 각 캐릭터의 영역 배정 + 위치 클램프
function relayout() {
  const { W, H } = stageSize();
  const regions = computeRegions();
  const split = !!regions;
  state.bodies.forEach((b, id) => {
    const idea = state.ideas.find((i) => i.id === id);
    const rnd = idea ? (idea.round || "lab-day") : null;
    if (split && rnd && regions[rnd]) {
      const rg = regions[rnd];
      b.hidden = false; b.panel = rnd; b.region = { x0: rg.x0, y0: rg.y0 + 46, x1: rg.x1, y1: rg.y1 };
    } else if (split) {
      b.hidden = true;
    } else {
      b.hidden = false; b.panel = "all"; b.region = { x0: 0, y0: TOP_INSET, x1: W, y1: H };
    }
    b.el.style.display = b.hidden ? "none" : "";
    if (!b.hidden) {
      b.x = Math.min(Math.max(b.x, b.region.x0 + b.r), b.region.x1 - b.r);
      b.y = Math.min(Math.max(b.y, b.region.y0 + b.r), b.region.y1 - b.r);
    }
  });
  renderPanels(regions);
  const catsEl = $("#cats");
  if (catsEl) catsEl.style.display = split ? "none" : "";
  $("#marquee").hidden = !state.roundsEnabled || split;
  $("#fab").style.display = readonly() ? "none" : "";
  const splitBtn = $("#split-btn");
  if (splitBtn) splitBtn.classList.toggle("on", split);
}
function saveSplitPref() { localStorage.setItem("axdea_split", JSON.stringify({ mode: state.splitMode, rounds: state.splitRounds })); }
async function openSplit() {
  if (!state.roundsEnabled) { alert("아카이브(라운드) 기능을 먼저 켜야 분할 비교가 가능합니다."); return; }
  const box = $("#split-cats");
  const off = $("#split-off");
  off.hidden = !state.splitMode;
  off.onclick = async () => { state.splitMode = false; saveSplitPref(); await reloadBoard(); $("#split-modal").hidden = true; };
  const rounds = await loadRounds();
  const names = rounds.map((r) => r.round);
  if (names.length < 2) {
    box.innerHTML = `<p class="fineprint" style="margin:0">아직 라운드(주제)가 하나뿐이에요. 🗂 아카이브에서 <b>＋새 라운드 시작</b>으로 주제를 더 만들면 여러 주제를 나란히 비교할 수 있어요.</p>`;
    $("#split-hint").textContent = "";
    $("#split-apply").disabled = true;
    $("#split-modal").hidden = false;
    return;
  }
  let sel = state.splitRounds.filter((r) => names.includes(r));
  if (sel.length < 2) sel = names.slice(0, Math.min(4, names.length));
  const render = () => {
    box.innerHTML = rounds.map((r) => {
      const on = sel.includes(r.round);
      return `<button type="button" class="chip split-cat${on ? " on" : ""}" data-round="${esc(r.round)}">${esc(r.round)}<span class="split-cnt">${r.count}</span></button>`;
    }).join("");
    box.querySelectorAll(".split-cat").forEach((el) => {
      el.onclick = () => {
        const rn = el.dataset.round;
        if (sel.includes(rn)) sel = sel.filter((x) => x !== rn);
        else { if (sel.length >= 4) { alert("최대 4개까지 비교할 수 있어요."); return; } sel.push(rn); }
        render();
      };
    });
    $("#split-apply").disabled = sel.length < 2;
    $("#split-hint").textContent = `${sel.length}/4 · 2~4개 라운드 선택`;
  };
  render();
  $("#split-apply").onclick = async () => {
    if (sel.length < 2) return;
    state.splitMode = true; state.splitRounds = sel.slice(0, 4);
    saveSplitPref(); await reloadBoard();
    $("#split-modal").hidden = true;
  };
  $("#split-modal").hidden = false;
}

// 고양이들: 종류별 5마리, 각자 다른 색·포즈·성격으로 아이디어 사이를 논다
const CAT_TYPES = [
  // target: nearest(가까운) / topLiked(인기) / roam(배회), sleepy: 자주 졸기, edge: 아래쪽 선호
  { key: "lazy",    name: "느긋이", fur: "#e6b06a", furL: "#f6cd92", furD: "#c9924f", speed: 1.1, sitMin: 520, sitMax: 900, pounce: false, target: "nearest", sleepy: true },
  { key: "playful", name: "폴짝이", fur: "#f2985a", furL: "#ffb98a", furD: "#d67b3d", speed: 3.6, sitMin: 110, sitMax: 230, pounce: true,  target: "nearest" },
  { key: "aloof",   name: "새침이", fur: "#585560", furL: "#7c7883", furD: "#3f3c46", speed: 1.9, sitMin: 90,  sitMax: 200, pounce: false, target: "roam" },
  { key: "clingy",  name: "응석이", fur: "#eae5dd", furL: "#ffffff", furD: "#cbc4b8", speed: 2.0, sitMin: 420, sitMax: 680, pounce: false, target: "topLiked" },
  { key: "shy",     name: "부끄럼", fur: "#8b7d70", furL: "#ab9d8f", furD: "#6a5e53", speed: 2.9, sitMin: 90,  sitMax: 190, pounce: true,  target: "nearest", edge: true },
];
function catSVG() {
  return `<div class="cat-inner"><svg class="cat-svg" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <path class="cat-tail cfd-s" d="M45 52 C60 50 60 32 51 31" fill="none" stroke-width="7" stroke-linecap="round"/>
    <path class="cf" d="M18 56 C15 40 22 29 32 29 C42 29 49 40 46 56 Z"/>
    <path class="cfl" d="M32 34 C26 34 22 42 23 56 L41 56 C42 42 38 34 32 34 Z"/>
    <ellipse class="cfl" cx="26" cy="54" rx="5" ry="6.5"/>
    <ellipse class="cfl" cx="38" cy="54" rx="5" ry="6.5"/>
    <path class="cfd-s" d="M23.5 55 L28.5 55 M33.5 55 L38.5 55" stroke-width="0.9" stroke-linecap="round"/>
    <g class="cat-head">
      <path class="cf" d="M21 15 L18 3 L31 12 Z"/>
      <path class="cf" d="M43 15 L46 3 L33 12 Z"/>
      <path d="M23 13 L22 6 L30 12 Z" fill="#ffc9c9"/>
      <path d="M41 13 L42 6 L34 12 Z" fill="#ffc9c9"/>
      <circle class="cfl" cx="32" cy="22" r="15"/>
      <circle cx="24.5" cy="26" r="3.2" fill="#ffb3b3" opacity="0.5"/>
      <circle cx="39.5" cy="26" r="3.2" fill="#ffb3b3" opacity="0.5"/>
      <g class="cat-eyes">
        <ellipse cx="26.5" cy="21" rx="2.7" ry="3.8" fill="#2b2b2b"/>
        <ellipse cx="37.5" cy="21" rx="2.7" ry="3.8" fill="#2b2b2b"/>
        <circle cx="27.6" cy="19.5" r="1" fill="#fff"/>
        <circle cx="38.6" cy="19.5" r="1" fill="#fff"/>
      </g>
      <g class="cat-eyes-closed" stroke="#2b2b2b" stroke-width="1.5" fill="none" stroke-linecap="round">
        <path d="M23.6 21 q2.9 2.6 5.8 0"/>
        <path d="M34.6 21 q2.9 2.6 5.8 0"/>
      </g>
      <path d="M30 25 L34 25 L32 27.4 Z" fill="#e26d6d"/>
      <path d="M32 27.4 C32 29 30.4 29.6 29 29" fill="none" stroke="#d9825a" stroke-width="0.9" stroke-linecap="round"/>
      <path d="M32 27.4 C32 29 33.6 29.6 35 29" fill="none" stroke="#d9825a" stroke-width="0.9" stroke-linecap="round"/>
      <g class="whiskers" stroke="#b9b9b9" stroke-width="1" stroke-linecap="round" opacity="0.7">
        <line x1="24" y1="25" x2="15" y2="24"/><line x1="24" y1="27" x2="15" y2="29"/>
        <line x1="40" y1="25" x2="49" y2="24"/><line x1="40" y1="27" x2="49" y2="29"/>
      </g>
    </g>
  </svg></div>`;
}
function initCats() {
  const cont = $("#cats");
  if (!cont) return;
  cont.innerHTML = "";
  const { W, H } = stageSize();
  state.cats = CAT_TYPES.map((t, i) => {
    const el = document.createElement("div");
    el.className = "cat cat-" + t.key;
    el.style.setProperty("--fur", t.fur);
    el.style.setProperty("--fur-l", t.furL);
    el.style.setProperty("--fur-d", t.furD);
    el.innerHTML = catSVG() + `<div class="cat-name">${t.name}</div>`;
    cont.appendChild(el);
    return { el, type: t, x: (W * (i + 1)) / (CAT_TYPES.length + 1), y: H - 44 - Math.random() * 30,
             vx: (Math.random() < 0.5 ? -1 : 1) * (t.speed * 0.4), dir: 1, targetId: null, mode: "seek", sit: 0, sitTotal: 0, restTimer: 0 };
  });
}
function hopCat(cat) {
  cat.el.classList.remove("pounce");
  void cat.el.offsetWidth; // 리플로우로 애니메이션 재시작
  cat.el.classList.add("pounce");
  setTimeout(() => cat.el.classList.remove("pounce"), 420);
}
function nearestIdea(cat) {
  let best = null, bd = Infinity;
  state.bodies.forEach((b, id) => {
    if (b.dragging || b.hidden) return;
    const d = Math.abs(b.x - cat.x) + Math.abs(b.y - cat.y) * 0.7;
    if (d < bd) { bd = d; best = id; }
  });
  return best;
}
function pickCatTarget(cat) {
  const t = cat.type;
  if (t.target === "topLiked") {
    let best = null, bl = -1;
    state.bodies.forEach((b, id) => { if (b.dragging || b.hidden) return; const l = state.likeCounts[id] || 0; if (l > bl) { bl = l; best = id; } });
    return best;
  }
  if (t.target === "roam") return Math.random() < 0.004 ? nearestIdea(cat) : null; // 대부분 배회, 가끔만 올라탐
  return nearestIdea(cat);
}
function placeCat(cat) {
  cat.el.style.transform = `translate(${cat.x}px, ${cat.y}px)`;
  cat.el.style.setProperty("--dir", cat.dir);
}
function updateCats(W, H) {
  if (!state.cats) return;
  state.cats.forEach((cat) => updateOneCat(cat, W, H));
}
function updateOneCat(cat, W, H) {
  const t = cat.type;
  const target = cat.targetId ? state.bodies.get(cat.targetId) : null;

  // 아이디어 위에 올라타 앉기 (함께 이동)
  if (cat.mode === "riding" && target && !target.dragging && !target.hidden) {
    const topY = target.y - target.r - 14;
    cat.x += (target.x - cat.x) * 0.4;
    cat.y += (topY - cat.y) * 0.4;
    cat.sit -= 1;
    cat.el.classList.add("sitting");
    cat.el.classList.remove("walking");
    // 성격상 졸음이 많은 고양이는 자리 잡은 뒤 눈 감고 존다
    cat.el.classList.toggle("sleeping", !!(t.sleepy && cat.sit < cat.sitTotal - 45));
    if (cat.sit <= 0) { cat.mode = "seek"; cat.targetId = null; cat.el.classList.remove("sleeping"); hopCat(cat); }
    placeCat(cat);
    return;
  }
  cat.el.classList.remove("sitting");

  if (!target || target.dragging || target.hidden) cat.targetId = pickCatTarget(cat);
  const tgt = cat.targetId ? state.bodies.get(cat.targetId) : null;
  if (tgt) {
    const dx = tgt.x - cat.x;
    cat.vx = Math.max(-t.speed, Math.min(t.speed, dx * 0.06));
    if (Math.abs(cat.vx) > 0.25) cat.dir = cat.vx > 0 ? 1 : -1;
    cat.x += cat.vx;
    const topY = tgt.y - tgt.r - 14;
    cat.y += (topY - cat.y) * 0.13;
    cat.el.classList.toggle("walking", Math.abs(cat.vx) > 0.5);
    cat.el.classList.remove("sleeping");
    if (Math.hypot(tgt.x - cat.x, tgt.y - cat.y) < tgt.r + 22) {
      cat.mode = "riding";
      cat.sitTotal = t.sitMin + Math.floor(Math.random() * (t.sitMax - t.sitMin));
      cat.sit = cat.sitTotal;
      if (t.pounce) hopCat(cat);
    }
  } else {
    // 바닥 배회
    if (!cat.vx) cat.vx = t.speed * 0.4 * (cat.dir || 1);
    cat.x += cat.vx;
    if (cat.x < 44 || cat.x > W - 44) { cat.vx *= -1; cat.dir = cat.vx > 0 ? 1 : -1; }
    const baseY = (t.edge ? H - 30 : H - 44);
    cat.y += (baseY - cat.y) * 0.06;
    cat.el.classList.toggle("walking", Math.abs(cat.vx) > 0.5);
    // 느긋이는 배회 중에도 가끔 멈춰 존다
    if (t.sleepy) { cat.restTimer++; const nap = (cat.restTimer % 620) > 400; cat.el.classList.toggle("sleeping", nap); if (nap) { cat.vx *= 0.55; cat.el.classList.remove("walking"); } }
  }
  cat.x = Math.max(30, Math.min(W - 30, cat.x));
  placeCat(cat);
}

// ---------- 드래그 / 던지기 / 클릭 ----------
function attachDrag(el, id) {
  let startX, startY, moved, lastX, lastY, lastT;
  const onDown = (e) => {
    const b = state.bodies.get(id);
    b.dragging = true;
    el.classList.add("dragging");
    el.setPointerCapture(e.pointerId);
    const p = pt(e);
    startX = p.x; startY = p.y; moved = 0;
    lastX = p.x; lastY = p.y; lastT = e.timeStamp;
  };
  const onMove = (e) => {
    const b = state.bodies.get(id);
    if (!b.dragging) return;
    const p = pt(e);
    moved += Math.hypot(p.x - lastX, p.y - lastY);
    const rg = b.region;
    b.x = Math.max(rg.x0 + b.r, Math.min(rg.x1 - b.r, p.x));
    b.y = Math.max(rg.y0 + b.r, Math.min(rg.y1 - b.r, p.y));
    const dt = Math.max(1, e.timeStamp - lastT);
    b.vx = (p.x - lastX) / dt * 16;
    b.vy = (p.y - lastY) / dt * 16;
    lastX = p.x; lastY = p.y; lastT = e.timeStamp;
  };
  const onUp = (e) => {
    const b = state.bodies.get(id);
    b.dragging = false;
    el.classList.remove("dragging");
    // 속도 제한(과도한 던지기 방지)
    const cap = 22;
    b.vx = Math.max(-cap, Math.min(cap, b.vx));
    b.vy = Math.max(-cap, Math.min(cap, b.vy));
    if (moved < 6) openCard(id);   // 거의 안 움직였으면 클릭으로 간주
  };
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
}
function pt(e) {
  const rect = stage.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// ---------- 아이디어 카드 ----------
function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}
async function openCard(id) {
  const idea = state.ideas.find((i) => i.id === id);
  if (!idea) return;
  state.openId = id;
  const cat = catOf(idea.category);
  $("#card-head").innerHTML = `
    <div class="card-avatar" style="background:${idea.color}"><img alt="" src="${avatarUrl(idea.avatar_style, idea.avatar_seed)}" /></div>
    <div class="card-title-wrap">
      <div class="card-title">${esc(idea.title)}</div>
      <div class="card-meta">
        <span class="cat-tag" style="--cat-hue:${cat.hue}">${cat.label}</span>
        <span class="card-when">${timeAgo(idea.created_at)}</span>
        ${state.reveal ? `<span class="card-author-tag">✎ ${esc(idea.author)}</span>` : ""}
      </div>
    </div>`;
  const rj = isRejected(idea), sel = isSelected(idea);
  $("#card-body").innerHTML =
    (sel ? `<div class="card-sel-banner">${icon("star-fill", 14)} 선정된 아이디어 · 실행 라운드로 복제되었습니다</div>` : "") +
    (idea.source_id ? `<div class="card-src-banner">${icon("star", 14)} 다른 라운드에서 선정되어 복제된 아이디어예요</div>` : "") +
    (rj ? `<div class="card-rej-banner">반려됨 · 진행이 어려운 아이디어로 표시되었습니다</div>` : "") +
    `<div class="card-text">${esc(idea.body || "(내용 없음)")}</div>`;
  const isOwner = !!state.me && idea.author === state.me;
  let btns = "";
  if (state.reveal) btns += `<button class="btn primary" id="promote-btn">선정 · 라운드로 복제</button>`;
  if (!readonly()) {
    if (state.reveal && sel) btns += `<button class="btn" id="unsel-btn">선정 해제</button>`;
    if (state.reveal) btns += `<button class="btn" id="rej-btn">${rj ? "반려 취소" : "반려"}</button>`;
    if (isOwner) btns += `<button class="btn" id="edit-btn">수정</button>`;
    if (isOwner || state.reveal) btns += `<button class="btn danger" id="del-btn">삭제</button>`;
  }
  $("#card-footer").innerHTML = btns;
  if (state.reveal) $("#promote-btn").onclick = () => openPromote(id);
  if (!readonly()) {
    if (state.reveal && sel) $("#unsel-btn").onclick = () => unselectIdea(id);
    if (state.reveal) $("#rej-btn").onclick = () => toggleReject(id);
    if (isOwner) $("#edit-btn").onclick = () => openEdit(id);
    if (isOwner || state.reveal) $("#del-btn").onclick = () => removeIdea(id);
  }
  $("#comment-form").style.display = "";
  const csp = $("#comment-sent");
  if (csp) { csp.innerHTML = sentButtonsHTML(); state.cSent = null; wireSentPicker(csp, (s) => { state.cSent = s; }); }
  renderSocial(id);
  $("#card-modal").hidden = false;
  renderComments(await loadComments(id));
}
function sentimentBadge(s) {
  if (s === "pos") return `<span class="c-sent pos">${icon("thumbs-up-fill", 13)}해보자</span>`;
  if (s === "neg") return `<span class="c-sent neg">${icon("thumbs-down-fill", 13)}아쉬워</span>`;
  if (s === "coffee") return `<span class="c-sent coffee">${icon("coffee-fill", 13)}커피</span>`;
  return "";
}
function commentNode(c, isReply) {
  const mine = !!state.me && c.author === state.me;
  const ctrls =
    (mine ? `<button class="c-act" data-act="edit" data-id="${c.id}">수정</button>` : "") +
    (mine || state.reveal ? `<button class="c-act" data-act="del" data-id="${c.id}">삭제</button>` : "") +
    (!isReply ? `<button class="c-act" data-act="reply" data-id="${c.id}">${icon("arrow-bend-down-right", 13)}답글</button>` : "");
  return `<div class="comment${isReply ? " reply" : ""}" data-id="${c.id}">
    <div class="c-main">${sentimentBadge(c.sentiment)}${state.reveal ? `<span class="c-author">${esc(c.author)}</span>` : ""}<span class="c-body">${esc(c.body)}</span></div>
    ${ctrls ? `<div class="c-actions">${ctrls}</div>` : ""}
  </div>`;
}
function renderComments(list) {
  const box = $("#card-comments");
  state.openComments = list;
  if (!list.length) { box.innerHTML = ""; return; }
  const tops = list.filter((c) => !c.parent_id);
  const byParent = {};
  list.filter((c) => c.parent_id).forEach((c) => { (byParent[c.parent_id] = byParent[c.parent_id] || []).push(c); });
  box.innerHTML = tops.map((c) => {
    const replies = (byParent[c.id] || []).map((r) => commentNode(r, true)).join("");
    return commentNode(c, false) + (replies ? `<div class="c-replies">${replies}</div>` : "");
  }).join("");
  box.querySelectorAll(".c-act").forEach((btn) => {
    btn.onclick = () => {
      const act = btn.dataset.act, cid = btn.dataset.id;
      if (act === "edit") startEditComment(cid);
      else if (act === "del") removeComment(cid);
      else if (act === "reply") startReply(cid);
    };
  });
  box.scrollTop = box.scrollHeight;
}
// 감정 선택기(해보자/아쉬워) — 공용
function sentButtonsHTML() {
  return (
    `<button type="button" class="sent-btn pos" data-s="pos" title="해보자">${icon("thumbs-up", 15)}<span>해보자</span></button>` +
    `<button type="button" class="sent-btn neg" data-s="neg" title="아쉬워">${icon("thumbs-down", 15)}<span>아쉬워</span></button>` +
    `<button type="button" class="sent-btn coffee" data-s="coffee" title="커피 한잔 사줄게">${icon("coffee", 15)}<span>커피</span></button>`
  );
}
function sentPickerHTML() { return `<div class="sent-pick">${sentButtonsHTML()}</div>`; }
function wireSentPicker(root, onChange) {
  let cur = null;
  root.querySelectorAll(".sent-btn").forEach((b) => {
    b.onclick = () => {
      cur = cur === b.dataset.s ? null : b.dataset.s;
      root.querySelectorAll(".sent-btn").forEach((x) => x.classList.toggle("on", x.dataset.s === cur));
      onChange(cur);
    };
  });
}
function startReply(parentId) {
  if (!state.me) { openNameModal(); return; }
  const node = document.querySelector(`#card-comments .comment[data-id="${parentId}"]`);
  if (!node || (node.nextElementSibling && node.nextElementSibling.classList.contains("c-replyform"))) return;
  const form = document.createElement("div");
  form.className = "c-replyform";
  form.innerHTML = `<input type="text" class="reply-input" maxlength="300" placeholder="답글 남기기…" autocomplete="off" />${sentPickerHTML()}<button class="btn c-reply-send">등록</button>`;
  node.after(form);
  let sent = null;
  wireSentPicker(form, (s) => { sent = s; });
  const input = form.querySelector(".reply-input");
  input.focus();
  const send = async () => {
    const v = input.value.trim();
    if (!v) return;
    await addComment(state.openId, state.me, v, { parent_id: parentId, sentiment: sent });
    state.commentCounts[state.openId] = (state.commentCounts[state.openId] || 0) + 1;
    updateCharCounts(state.openId);
    renderSocial(state.openId);
    renderComments(await loadComments(state.openId));
  };
  form.querySelector(".c-reply-send").onclick = send;
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
}
function startEditComment(id) {
  const c = (state.openComments || []).find((x) => x.id === id);
  const node = document.querySelector(`#card-comments .comment[data-id="${id}"]`);
  if (!c || !node) return;
  node.innerHTML = `<div class="c-edit"><input type="text" class="c-edit-input" maxlength="300" value="${esc(c.body)}" /><button class="c-act" data-save="1">저장</button><button class="c-act" data-cancel="1">취소</button></div>`;
  const input = node.querySelector(".c-edit-input");
  input.focus();
  const save = async () => {
    const v = input.value.trim();
    if (!v) { input.focus(); return; }
    const ok = await updateComment(id, v);
    if (!ok) return;
    renderComments(await loadComments(state.openId));
  };
  node.querySelector("[data-save]").onclick = save;
  node.querySelector("[data-cancel]").onclick = () => renderComments(state.openComments);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
}
async function removeComment(id) {
  if (!confirm("이 댓글을 삭제할까요?")) return;
  const ok = await deleteComment(id);
  if (!ok) return;
  const oid = state.openId;
  state.commentCounts[oid] = Math.max(0, (state.commentCounts[oid] || 1) - 1);
  updateCharCounts(oid);
  renderSocial(oid);
  renderComments(await loadComments(oid));
}
async function toggleReject(id) {
  const idea = state.ideas.find((i) => i.id === id);
  if (!idea) return;
  const next = isRejected(idea) ? "open" : "rejected";
  const ok = await setStatus(id, next);
  if (!ok) return;
  idea.status = next;
  applyRejected(id);
  openCard(id); // 카드 UI 갱신(배너/버튼)
}
async function removeIdea(id) {
  if (!confirm("이 아이디어를 삭제할까요?")) return;
  await deleteIdea(id);
  const b = state.bodies.get(id);
  if (b) { b.el.remove(); state.bodies.delete(id); }
  state.ideas = state.ideas.filter((i) => i.id !== id);
  $("#card-modal").hidden = true;
  updateEmpty();
}
async function unselectIdea(id) {
  const idea = state.ideas.find((i) => i.id === id);
  if (!idea) return;
  if (!(await setStatus(id, "open"))) return;
  idea.status = "open";
  applyRejected(id);
  openCard(id);
}

// ---------- 선정 → 라운드로 복제 ----------
async function openPromote(id) {
  const idea = state.ideas.find((i) => i.id === id);
  if (!idea) return;
  state.promoteId = id;
  state.promoteTarget = null;
  const cat = catOf(idea.category);
  $("#promote-idea").innerHTML =
    `<span class="pi-dot" style="background:${idea.color}"></span>` +
    `<span class="pi-title">${esc(idea.title)}</span>` +
    `<span class="pi-cat" style="--cat-hue:${cat.hue}">${cat.label}</span>`;
  const box = $("#promote-rounds");
  box.innerHTML = `<span class="rp-loading">라운드 불러오는 중…</span>`;
  const rounds = await loadRounds();
  box.innerHTML = rounds.map((r) => {
    const cur = r.round === (idea.round || state.activeRound);
    return `<button type="button" class="round-chip${cur ? " cur" : ""}" data-round="${esc(r.round)}">${esc(r.round)}<span class="rc-cnt">${r.count}</span>${cur ? `<span class="rc-cur">현재</span>` : ""}</button>`;
  }).join("");
  box.querySelectorAll(".round-chip").forEach((c) => {
    c.onclick = () => {
      state.promoteTarget = c.dataset.round;
      $("#promote-new").value = "";
      box.querySelectorAll(".round-chip").forEach((x) => x.classList.toggle("on", x === c));
    };
  });
  const nu = $("#promote-new");
  nu.value = "";
  nu.oninput = () => { state.promoteTarget = null; box.querySelectorAll(".round-chip").forEach((x) => x.classList.remove("on")); };
  $("#promote-apply").disabled = false;
  $("#promote-modal").hidden = false;
}
async function copyIdeaToRound(idea, round) {
  const fields = {
    title: idea.title, body: idea.body, category: idea.category, color: idea.color,
    avatar_style: idea.avatar_style, avatar_seed: idea.avatar_seed, author: idea.author,
    round, source_id: idea.id, status: "open",
  };
  if (DEMO) { const full = { id: uid(), created_at: new Date().toISOString(), ...fields }; demoIdeas.push(full); return full; }
  try { return await api.addIdea(fields); }
  catch (e) { console.error(e); alert("복제 실패: " + e.message); return null; }
}
async function applyPromote() {
  const id = state.promoteId;
  const idea = state.ideas.find((i) => i.id === id);
  if (!idea) return;
  const nv = $("#promote-new").value.trim();
  const target = nv || state.promoteTarget;
  if (!target) { alert("대상 라운드를 선택하거나 새 라운드 이름을 입력하세요."); return; }
  const btn = $("#promote-apply");
  btn.disabled = true;
  const copy = await copyIdeaToRound(idea, target);
  if (!copy) { btn.disabled = false; return; }
  // 원본을 '선정'으로 표시
  if (!isSelected(idea)) { if (await setStatus(id, "selected")) { idea.status = "selected"; applyRejected(id); } }
  $("#promote-modal").hidden = true;
  btn.disabled = false;
  if (state.openId === id) openCard(id);
  // 지금 보고 있는 라운드가 대상이면 즉시 캔버스에 반영
  if (state.roundsEnabled && state.viewRound === target && !effectiveSplit()) {
    state.ideas.push(copy); makeChar(copy); relayout(); updateEmpty();
  }
  toast(`'${idea.title}' → '${target}' 라운드로 복제했어요`, state.roundsEnabled && state.viewRound !== target ? { label: "그 라운드 보기", fn: () => selectRound(target) } : null);
}
// 간단 토스트
let _toastTimer = null;
function toast(msg, action) {
  let el = $("#axdea-toast");
  if (!el) { el = document.createElement("div"); el.id = "axdea-toast"; el.className = "toast"; document.body.appendChild(el); }
  el.innerHTML = `<span class="toast-msg">${esc(msg)}</span>` + (action ? `<button class="toast-act">${esc(action.label)}</button>` : "");
  if (action) el.querySelector(".toast-act").onclick = () => { el.classList.remove("show"); action.fn(); };
  el.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove("show"), 4200);
}

// ---------- 새 아이디어 작성 ----------
function renderComposePickers() {
  const catBox = $("#c-category");
  catBox.innerHTML = "";
  CATEGORIES.forEach((c) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (state.compose.category === c.key ? " on" : "");
    chip.textContent = c.label;
    chip.style.setProperty("--chip-hue", c.hue);
    chip.onclick = () => { state.compose.category = c.key; renderComposePickers(); };
    catBox.appendChild(chip);
  });
  const colBox = $("#c-color");
  colBox.innerHTML = "";
  COLORS.forEach((col) => {
    const sw = document.createElement("button");
    sw.type = "button";
    sw.className = "swatch" + (state.compose.color === col ? " on" : "");
    sw.style.background = col;
    sw.onclick = () => { state.compose.color = col; renderComposePickers(); };
    colBox.appendChild(sw);
  });
}
function openCompose() {
  if (!state.me) { openNameModal(); return; }
  state.editId = null;
  state.compose = { category: "etc", color: COLORS[Math.floor(Math.random() * COLORS.length)] };
  $("#c-title").value = ""; $("#c-body").value = "";
  $("#compose-title").textContent = "새 아이디어 띄우기";
  $("#c-save").textContent = "띄우기 🎈";
  renderComposePickers();
  $("#compose-modal").hidden = false;
  setTimeout(() => $("#c-title").focus(), 50);
}
function openEdit(id) {
  const idea = state.ideas.find((i) => i.id === id);
  if (!idea) return;
  state.editId = id;
  state.compose = { category: idea.category, color: idea.color };
  $("#c-title").value = idea.title;
  $("#c-body").value = idea.body || "";
  $("#compose-title").textContent = "아이디어 수정";
  $("#c-save").textContent = "수정 저장";
  renderComposePickers();
  $("#card-modal").hidden = true;
  $("#compose-modal").hidden = false;
  setTimeout(() => $("#c-title").focus(), 50);
}
async function saveIdea() {
  const title = $("#c-title").value.trim();
  if (!title) { $("#c-title").focus(); return; }
  const fields = { title, body: $("#c-body").value.trim(), category: state.compose.category, color: state.compose.color };
  // 수정 모드
  if (state.editId) {
    const id = state.editId;
    const ok = await updateIdea(id, fields);
    if (!ok) return;
    updateCharVisual(id);
    state.editId = null;
    $("#compose-modal").hidden = true;
    if (state.openId === id) openCard(id);
    return;
  }
  // 신규 작성
  const row = await addIdea({ ...fields, author: state.me });
  if (!row) return;
  state.ideas.push(row);
  makeChar(row);
  if (state.reveal) rerenderAuthors();
  applyFilter();
  updateEmpty();
  relayout();
  $("#compose-modal").hidden = true;
}

// ---------- 전체 아이디어 목록 ----------
function openList() {
  if (!state.listSort) state.listSort = "likes"; // 기본 좋아요순
  const L = (i) => state.likeCounts[i.id] || 0, F = (i) => state.coffeeCounts[i.id] || 0;
  const P = (i) => state.posCounts[i.id] || 0, N = (i) => state.negCounts[i.id] || 0, C = (i) => state.commentCounts[i.id] || 0;
  const sortItems = () => {
    const items = [...state.ideas];
    const byDate = (a, b) => new Date(b.created_at) - new Date(a.created_at);
    const s = state.listSort;
    if (s === "coffee") items.sort((a, b) => F(b) - F(a) || L(b) - L(a) || byDate(a, b));
    else if (s === "pos") items.sort((a, b) => P(b) - P(a) || C(b) - C(a) || byDate(a, b));
    else if (s === "neg") items.sort((a, b) => N(b) - N(a) || C(b) - C(a) || byDate(a, b));
    else if (s === "comments") items.sort((a, b) => C(b) - C(a) || L(b) - L(a) || byDate(a, b));
    else if (s === "name") items.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "ko"));
    else items.sort((a, b) => L(b) - L(a) || C(b) - C(a) || byDate(a, b));
    return items;
  };
  const render = () => {
    const items = sortItems();
    $("#list-count").textContent = `(${items.length})`;
    const sortBar = $("#list-sort");
    if (sortBar) {
      const opt = (k, label) => `<button class="ls-btn${state.listSort === k ? " on" : ""}" data-sort="${k}">${label}</button>`;
      sortBar.innerHTML = `<span class="ls-label">정렬</span>${opt("likes", "좋아요순")}${opt("coffee", "커피순")}${opt("pos", "해보자순")}${opt("neg", "아쉬워순")}${opt("comments", "댓글순")}${opt("name", "이름순")}`;
      sortBar.querySelectorAll(".ls-btn").forEach((b) => (b.onclick = () => { state.listSort = b.dataset.sort; render(); }));
    }
    const box = $("#list-items");
    box.innerHTML = items.length
      ? items.map((i) => {
          const cat = catOf(i.category), rj = isRejected(i), sel = isSelected(i), pk = isPicked(i), mine = !!state.me && i.author === state.me;
          const l = L(i), f = F(i), p = P(i), n = N(i), c = C(i);
          const author = (state.reveal || mine) ? `<span class="li-author${mine ? " self" : ""}">${esc(i.author)}</span>` : `<span class="li-author muted">익명</span>`;
          const counts =
            `<span class="lc-like" title="좋아요">${icon("heart-fill", 13)}${l}</span>` +
            `<span class="lc-coffee" title="커피">${icon("coffee-fill", 13)}${f}</span>` +
            `<span class="lc-pos" title="해보자">${icon("thumbs-up-fill", 13)}${p}</span>` +
            `<span class="lc-neg" title="아쉬워">${icon("thumbs-down-fill", 13)}${n}</span>` +
            `<span class="lc-cmt" title="댓글">${icon("chat-circle", 13)}${c}</span>`;
          const badges =
            (pk ? `<span class="li-pick" title="팀장 Pick">${icon("crown", 12)}</span>` : "") +
            (sel ? `<span class="li-sel">${icon("star-fill", 11)}선정</span>` : "") +
            (rj ? `<span class="li-rej">반려</span>` : "");
          return `<button class="list-item${rj ? " rej" : ""}${mine ? " mine" : ""}${pk ? " picked" : ""}" data-id="${i.id}">
            <div class="lci-head">
              <span class="li-dot" style="background:${i.color}"></span>
              <span class="li-cat" style="--cat-hue:${cat.hue}">${cat.label}</span>
              ${badges ? `<span class="lci-badges">${badges}</span>` : ""}
            </div>
            <div class="li-title">${esc(i.title)}</div>
            <div class="li-counts">${counts}</div>
            <div class="lci-foot">${author}</div>
          </button>`;
        }).join("")
      : `<div class="comment-empty">아직 아이디어가 없어요.</div>`;
    box.querySelectorAll(".list-item").forEach((el) => {
      el.onclick = () => { $("#list-modal").hidden = true; openCard(el.dataset.id); };
    });
  };
  render();
  $("#list-modal").hidden = false;
}

// ---------- 라운드 / 아카이브 ----------
function updateRoundUI() {
  const marquee = $("#marquee"), archiveBtn = $("#archive-btn");
  if (!state.roundsEnabled) { marquee.hidden = true; archiveBtn.hidden = true; return; }
  archiveBtn.hidden = false;
  marquee.hidden = false;
  const ro = readonly();
  const label = esc((state.viewRound || "").toUpperCase());
  const seg = Array(6).fill(label).join("&nbsp;&nbsp;◆&nbsp;&nbsp;") + "&nbsp;&nbsp;◆&nbsp;&nbsp;";
  $("#mq-track").innerHTML = `<span>${seg}</span><span>${seg}</span>`;
  $("#mq-board").classList.toggle("archive", ro);
  $("#mq-label").textContent = ro ? "ARCHIVE" : "LIVE";
  $("#mq-return").hidden = !ro;
  $("#fab").style.display = ro ? "none" : "";
}
async function reloadBoard() {
  state.bodies.forEach((b) => b.el.remove());
  state.bodies.clear();
  state.openId = null;
  $("#card-modal").hidden = true;
  state.ideas = await loadIdeas();
  state.ideas.forEach(makeChar);
  rerenderAuthors();
  rerenderMine();
  applyFilter();
  updateEmpty();
  updateRoundUI();
  relayout();
  await refreshCounts();
}
async function openArchive() {
  if (!state.roundsEnabled) { alert("백엔드에 연결되지 않아 아카이브 기능을 쓸 수 없습니다. 서버 실행 여부를 확인해 주세요."); return; }
  const rounds = await loadRounds();
  $("#archive-count").textContent = `(${rounds.length})`;
  const box = $("#archive-items");
  box.innerHTML = rounds.map((r) => {
    const active = r.round === state.activeRound;
    const viewing = r.round === state.viewRound;
    const renameBtn = state.reveal ? `<button class="round-edit" data-rename="${esc(r.round)}" title="이름 변경">${icon("pencil-simple", 15)}</button>` : "";
    return `<div class="round-card${viewing ? " viewing" : ""}${active ? " live" : ""}" data-round="${esc(r.round)}" role="button" tabindex="0">
      <div class="rc-head">
        <span class="round-badge${active ? " live" : ""}">${active ? "진행 중" : "아카이브"}</span>
        ${renameBtn}
      </div>
      <div class="round-name">${esc(r.round)}</div>
      <div class="round-count">${icon("archive", 13)}<span>아이디어 ${r.count}</span></div>
    </div>`;
  }).join("");
  box.querySelectorAll(".round-card").forEach((el) => {
    const go = (e) => { if (e.target.closest(".round-edit")) return; selectRound(el.dataset.round); };
    el.onclick = go;
    el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(e); } };
  });
  box.querySelectorAll(".round-edit").forEach((btn) => {
    btn.onclick = (e) => { e.stopPropagation(); renameRound(btn.dataset.rename); };
  });
  $("#archive-actions").innerHTML = state.reveal
    ? `<button class="btn primary" id="new-round-btn">＋ 새 라운드 시작 (현재 라운드는 아카이브로 보관)</button>`
    : `<p class="fineprint" style="margin:0">새 라운드 시작은 <b>박찬영 부장</b>만 할 수 있어요.</p>`;
  if (state.reveal) $("#new-round-btn").onclick = startNewRound;
  $("#archive-modal").hidden = false;
}
async function selectRound(name) {
  $("#archive-modal").hidden = true;
  state.viewRound = name;
  await reloadBoard();
}
async function returnToActive() {
  state.viewRound = state.activeRound;
  await reloadBoard();
}
async function startNewRound() {
  const suggested = "round-" + new Date().toISOString().slice(0, 10);
  const name = (prompt(`새 라운드 이름을 입력하세요.\n(현재 '${state.activeRound}' 라운드는 아카이브로 보관됩니다)`, suggested) || "").trim();
  if (!name) return;
  if (name === state.activeRound) { alert("현재 라운드와 같은 이름은 쓸 수 없어요."); return; }
  const ok = await setActiveRoundDB(name);
  if (!ok) return;
  state.activeRound = name;
  state.viewRound = name;
  $("#archive-modal").hidden = true;
  await reloadBoard();   // 새(빈) 라운드 보드
  openCompose();         // 새 아이디어 등록 화면 열기
}
async function renameRound(oldName) {
  const newName = (prompt(`'${oldName}' 라운드의 새 이름을 입력하세요.`, oldName) || "").trim();
  if (!newName || newName === oldName) return;
  const rounds = await loadRounds();
  if (rounds.some((r) => r.round === newName)) { alert("이미 있는 라운드 이름이에요."); return; }
  const isActive = oldName === state.activeRound;
  // 해당 라운드의 아이디어들도 새 이름으로 이동 (백엔드가 ideas + app_state를 트랜잭션으로 처리)
  if (DEMO) { demoIdeas.forEach((i) => { if ((i.round || "lab-day") === oldName) i.round = newName; }); }
  else {
    try { await api.renameRound(oldName, newName); } catch (e) { console.error(e); alert("이름 변경 실패: " + e.message); return; }
  }
  if (isActive) state.activeRound = newName;
  if (state.viewRound === oldName) state.viewRound = newName;
  await reloadBoard();
  openArchive();
}
async function pollActiveRound() {
  if (DEMO || !state.roundsEnabled) return;
  const cur = await loadActiveRound();
  if (cur !== state.activeRound) {
    const wasViewingActive = state.viewRound === state.activeRound;
    state.activeRound = cur;
    if (wasViewingActive) { state.viewRound = cur; await reloadBoard(); }
    else updateRoundUI();
  }
}

// ---------- 유틸 ----------
function esc(s) { return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }
function updateEmpty() { $("#empty-hint").style.display = state.ideas.length ? "none" : ""; }

// ---------- 이벤트 바인딩 ----------
$("#name-save").onclick = saveName;
$("#name-input").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("#code-input").focus(); } });
$("#code-input").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) saveName(); });
$("#me-chip").onclick = openNameModal;
$("#list-btn").onclick = openList;
$("#list-close").onclick = () => { $("#list-modal").hidden = true; };
$("#fab").onclick = openCompose;
$("#card-close").onclick = () => { $("#card-modal").hidden = true; state.openId = null; };
$("#c-cancel").onclick = () => { state.editId = null; $("#compose-modal").hidden = true; };
$("#c-save").onclick = saveIdea;
$("#archive-btn").onclick = openArchive;
$("#mq-board").onclick = openArchive;
$("#archive-close").onclick = () => { $("#archive-modal").hidden = true; };
$("#mq-return").onclick = returnToActive;
$("#split-btn").onclick = openSplit;
$("#split-close").onclick = () => { $("#split-modal").hidden = true; };
$("#promote-close").onclick = () => { $("#promote-modal").hidden = true; };
$("#promote-cancel").onclick = () => { $("#promote-modal").hidden = true; };
$("#promote-apply").onclick = applyPromote;
let _rz, _lastSplit = false;
window.addEventListener("resize", () => {
  clearTimeout(_rz);
  _rz = setTimeout(async () => {
    const now = effectiveSplit();
    if (now !== _lastSplit) { _lastSplit = now; await reloadBoard(); }
    else relayout();
  }, 150);
});
$("#comment-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.me) { openNameModal(); return; }
  const input = $("#comment-input");
  const body = input.value.trim();
  if (!body || !state.openId) return;
  input.value = "";
  const id = state.openId;
  const sent = state.cSent;
  await addComment(id, state.me, body, { sentiment: sent });
  state.cSent = null;
  const sp = $("#comment-sent"); if (sp) sp.querySelectorAll(".sent-btn").forEach((x) => x.classList.remove("on"));
  state.commentCounts[id] = (state.commentCounts[id] || 0) + 1;
  if (sent === "coffee") state.coffeeCounts[id] = (state.coffeeCounts[id] || 0) + 1;
  else if (sent === "pos") state.posCounts[id] = (state.posCounts[id] || 0) + 1;
  else if (sent === "neg") state.negCounts[id] = (state.negCounts[id] || 0) + 1;
  updateCharCounts(id);
  renderSocial(id);
  renderComments(await loadComments(id));
});
// 댓글: Enter=등록, Shift+Enter=줄바꿈
$("#comment-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $("#comment-form").requestSubmit();
  }
});
// 스크림 클릭으로 닫기
document.querySelectorAll(".modal-scrim").forEach((scrim) => {
  if (scrim.id === "name-modal") return; // 이름은 필수라 닫기 제외
  scrim.addEventListener("pointerdown", (e) => { if (e.target === scrim) scrim.hidden = true; });
});

// ---------- 실시간 동기화 (Realtime + 폴링 폴백) ----------
// 현재 캔버스를 최신 아이디어 목록에 맞춰 조정(기존 캐릭터 위치/속도는 유지)
function reconcile(fresh) {
  const freshIds = new Set(fresh.map((i) => i.id));
  // 새로 생긴 것 추가 / 기존 것은 상태 변화(반려) 반영
  for (const idea of fresh) {
    if (!state.bodies.has(idea.id)) {
      state.ideas.push(idea);
      makeChar(idea);
    } else {
      const cur = state.ideas.find((i) => i.id === idea.id);
      if (cur && cur.status !== idea.status) {
        cur.status = idea.status;
        applyRejected(idea.id);
        if (state.openId === idea.id) openCard(idea.id);
      }
    }
  }
  // 삭제된 것 제거
  for (const id of [...state.bodies.keys()]) {
    if (!freshIds.has(id)) {
      const b = state.bodies.get(id);
      if (b) { b.el.remove(); state.bodies.delete(id); }
      state.ideas = state.ideas.filter((i) => i.id !== id);
      if (state.openId === id) { $("#card-modal").hidden = true; state.openId = null; }
    }
  }
  if (state.reveal) rerenderAuthors();
  applyFilter();
  updateEmpty();
  relayout();
}
async function refreshIdeas() { if (!DEMO && !readonly()) reconcile(await loadIdeas()); }
async function refreshOpenComments() { if (!DEMO && state.openId) renderComments(await loadComments(state.openId)); }

function startSync() {
  if (DEMO) return;
  // 4초 폴링으로 새로고침 없이 반영 (백엔드는 폴링 방식)
  setInterval(refreshIdeas, 4000);
  setInterval(refreshOpenComments, 4000);
  setInterval(refreshCounts, 4000);
  setInterval(pollActiveRound, 5000);
}

// ---------- 부팅 ----------
// 데모(오프라인) 모드일 때 실제 데이터로 오해하지 않도록 큰 경고 배너
function showDemoBanner() {
  if (document.getElementById("demo-banner")) return;
  const b = document.createElement("div");
  b.id = "demo-banner";
  b.className = "demo-banner";
  b.innerHTML = '⚠️ <b>데모(오프라인) 모드</b> — 서버에 연결되지 않아 아래는 <b>가짜 예시</b>입니다. 실제 데이터 아님 · 변경은 저장 안 됨. &nbsp; 올바른 주소 → <b>axdea.hakjisa.kr</b>';
  document.body.appendChild(b);
}
async function boot() {
  setupIcons();
  initTheme();
  renderFilters();
  renderMe();
  state.roundsEnabled = await detectRounds();
  if (DEMO) showDemoBanner();
  if (state.roundsEnabled) {
    state.activeRound = await loadActiveRound();
    state.viewRound = state.activeRound;
  }
  state.ideas = await loadIdeas();
  state.ideas.forEach(makeChar);
  rerenderAuthors();
  rerenderMine();
  applyFilter();
  updateEmpty();
  updateRoundUI();
  initCats();
  relayout();
  requestAnimationFrame(loop);
  await refreshCounts();
  startSync();
  if (!state.me) openNameModal();
}
boot();
