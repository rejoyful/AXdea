// ===== AXdea — 앱 로직 =====
import { SB_URL, SB_KEY, CATEGORIES, COLORS } from "./config.js";
import { isRevealer, pickAvatar, stepBody, resolveWall, resolveCollision } from "./pure.js";

const $ = (s) => document.querySelector(s);
const catOf = (key) => CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];
const avatarUrl = (style, seed) => `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
const isRejected = (idea) => !!idea && idea.status === "rejected";

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
  likeCounts: {},     // idea_id -> 좋아요 수
  myLikes: new Set(), // 내가 좋아요한 idea_id
  cat: null,          // 고양이 상태
  roundsEnabled: false, // 아카이브 구조 사용 가능 여부(DB 감지)
  activeRound: "lab-day", // 현재 진행 중인 라운드
  viewRound: "lab-day",   // 지금 보고 있는 라운드 (다르면 읽기 전용)
};
const readonly = () => state.roundsEnabled && state.viewRound !== state.activeRound;
state.reveal = isRevealer(state.me);

// ---------- 데이터 레이어 (Supabase + 데모 폴백) ----------
const sb = (SB_URL && SB_KEY && window.supabase) ? window.supabase.createClient(SB_URL, SB_KEY) : null;
const DEMO = !sb;
let demoIdeas = [];
let demoComments = [];
let demoLikes = [];
let demoSeq = 0;
const uid = () => `demo-${Date.now()}-${demoSeq++}`;

if (DEMO) {
  console.warn("[AXdea] Supabase 키가 없어 데모 모드로 동작합니다. js/config.js에 SB_URL/SB_KEY를 채우세요.");
  demoIdeas = seedDemo();
}

async function loadIdeas() {
  if (DEMO) return demoIdeas.filter((i) => !state.roundsEnabled || (i.round || "lab-day") === state.viewRound);
  let q = sb.from("ideas").select("*").order("created_at", { ascending: true });
  if (state.roundsEnabled) q = q.eq("round", state.viewRound);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return data || [];
}
// 아카이브 구조(라운드 컬럼 + app_state 테이블) 사용 가능 여부 감지
async function detectRounds() {
  if (DEMO) return true;
  const [r1, r2] = await Promise.all([
    sb.from("ideas").select("round").limit(1),
    sb.from("app_state").select("key").limit(1),
  ]);
  return !r1.error && !r2.error;
}
async function loadActiveRound() {
  if (DEMO) return "lab-day";
  const { data, error } = await sb.from("app_state").select("value").eq("key", "active_round").maybeSingle();
  if (error || !data) return "lab-day";
  return data.value || "lab-day";
}
async function setActiveRoundDB(name) {
  if (DEMO) return true;
  const { error } = await sb.from("app_state").upsert({ key: "active_round", value: name }).select();
  if (error) { console.error(error); alert("라운드 전환 실패: " + error.message); return false; }
  return true;
}
// 라운드 목록 + 아이디어 수 (최신 활동 순)
async function loadRounds() {
  const counts = {}, last = {};
  const bump = (r, ts) => { r = r || "lab-day"; counts[r] = (counts[r] || 0) + 1; if (!last[r] || ts > last[r]) last[r] = ts; };
  if (DEMO) { demoIdeas.forEach((i) => bump(i.round, i.created_at)); }
  else {
    const { data } = await sb.from("ideas").select("round,created_at");
    (data || []).forEach((i) => bump(i.round, i.created_at));
  }
  if (!counts[state.activeRound]) { counts[state.activeRound] = 0; last[state.activeRound] = last[state.activeRound] || ""; }
  return Object.keys(counts).map((r) => ({ round: r, count: counts[r], last: last[r] || "" }))
    .sort((a, b) => (b.last || "").localeCompare(a.last || ""));
}
async function addIdea(fields) {
  const av = pickAvatar(`${fields.author}-${Date.now()}-${Math.random()}`);
  const row = { ...fields, avatar_style: av.style, avatar_seed: av.seed };
  if (state.roundsEnabled) row.round = state.activeRound;
  if (DEMO) {
    const full = { id: uid(), created_at: new Date().toISOString(), ...row };
    demoIdeas.push(full);
    return full;
  }
  const { data, error } = await sb.from("ideas").insert(row).select().single();
  if (error) { console.error(error); alert("저장 실패: " + error.message); return null; }
  return data;
}
async function loadComments(ideaId) {
  if (DEMO) return demoComments.filter((c) => c.idea_id === ideaId);
  const { data, error } = await sb.from("comments").select("*").eq("idea_id", ideaId).order("created_at", { ascending: true });
  if (error) { console.error(error); return []; }
  return data || [];
}
// 댓글 수 + 좋아요 수 + 내 좋아요 집계 (한 번에 로드)
async function loadCounts() {
  const cc = {}, lc = {}, mine = new Set();
  if (DEMO) {
    demoComments.forEach((c) => { cc[c.idea_id] = (cc[c.idea_id] || 0) + 1; });
    demoLikes.forEach((l) => { lc[l.idea_id] = (lc[l.idea_id] || 0) + 1; if (l.voter === state.me) mine.add(l.idea_id); });
    return { cc, lc, mine };
  }
  const [cRes, lRes] = await Promise.all([
    sb.from("comments").select("idea_id"),
    sb.from("likes").select("idea_id,voter"),
  ]);
  (cRes.data || []).forEach((c) => { cc[c.idea_id] = (cc[c.idea_id] || 0) + 1; });
  (lRes.data || []).forEach((l) => { lc[l.idea_id] = (lc[l.idea_id] || 0) + 1; if (l.voter === state.me) mine.add(l.idea_id); });
  return { cc, lc, mine };
}
async function likeIdea(id) {
  if (DEMO) { if (!demoLikes.some((l) => l.idea_id === id && l.voter === state.me)) demoLikes.push({ idea_id: id, voter: state.me }); return true; }
  const { error } = await sb.from("likes").insert({ idea_id: id, voter: state.me });
  if (error && error.code !== "23505") { console.error(error); alert("좋아요 실패: likes 테이블이 필요합니다. supabase.sql 참고\n" + error.message); return false; }
  return true;
}
async function unlikeIdea(id) {
  if (DEMO) { demoLikes = demoLikes.filter((l) => !(l.idea_id === id && l.voter === state.me)); return true; }
  const { error } = await sb.from("likes").delete().eq("idea_id", id).eq("voter", state.me);
  if (error) { console.error(error); alert("좋아요 취소 실패: " + error.message); return false; }
  return true;
}
async function addComment(ideaId, author, body) {
  const row = { idea_id: ideaId, author, body };
  if (DEMO) { const full = { id: uid(), created_at: new Date().toISOString(), ...row }; demoComments.push(full); return full; }
  const { data, error } = await sb.from("comments").insert(row).select().single();
  if (error) { console.error(error); return null; }
  return data;
}
async function updateComment(id, body) {
  if (DEMO) { const c = demoComments.find((x) => x.id === id); if (c) c.body = body; return true; }
  const { data, error } = await sb.from("comments").update({ body }).eq("id", id).select();
  if (error || !data || data.length === 0) { console.error("comment update failed", error); alert("댓글 수정 실패: DB에 comments update 정책이 필요합니다. supabase.sql 참고"); return false; }
  return true;
}
async function deleteComment(id) {
  if (DEMO) { demoComments = demoComments.filter((x) => x.id !== id); return true; }
  const { data, error } = await sb.from("comments").delete().eq("id", id).select();
  if (error || !data || data.length === 0) { console.error("comment delete failed", error); alert("댓글 삭제 실패: DB에 comments delete 정책이 필요합니다. supabase.sql 참고"); return false; }
  return true;
}
async function deleteIdea(id) {
  if (DEMO) { demoIdeas = demoIdeas.filter((i) => i.id !== id); return; }
  const { error } = await sb.from("ideas").delete().eq("id", id);
  if (error) console.error(error);
}
async function updateIdea(id, fields) {
  if (DEMO) {
    const it = demoIdeas.find((i) => i.id === id); if (it) Object.assign(it, fields);
    const s = state.ideas.find((i) => i.id === id); if (s) Object.assign(s, fields);
    return true;
  }
  const { data, error } = await sb.from("ideas").update(fields).eq("id", id).select();
  if (error || !data || data.length === 0) {
    console.error("update failed", error);
    alert("수정 실패: DB에 update 권한 정책이 없습니다.\nSupabase SQL Editor에서 supabase.sql의 update 정책을 실행해 주세요.");
    return false;
  }
  const s = state.ideas.find((i) => i.id === id); if (s) Object.assign(s, fields);
  return true;
}
async function setStatus(id, status) {
  if (DEMO) { const it = demoIdeas.find((i) => i.id === id); if (it) it.status = status; return true; }
  const { data, error } = await sb.from("ideas").update({ status }).eq("id", id).select();
  if (error || !data || data.length === 0) {
    console.error("status update failed", error);
    alert("상태 변경 실패: DB에 status 컬럼과 update 정책이 필요합니다.\nSupabase SQL Editor에서 supabase.sql의 해당 SQL을 실행해 주세요.");
    return false;
  }
  return true;
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
function renderFilters() {
  const box = $("#filters");
  box.innerHTML = "";
  CATEGORIES.forEach((c) => {
    const chip = document.createElement("button");
    chip.className = "chip" + (state.filter === c.key ? " on" : "");
    chip.textContent = c.label;
    chip.style.setProperty("--chip-hue", c.hue);
    chip.onclick = () => { state.filter = state.filter === c.key ? null : c.key; renderFilters(); applyFilter(); };
    box.appendChild(chip);
  });
}
function applyFilter() {
  state.bodies.forEach((b, id) => {
    const idea = state.ideas.find((i) => i.id === id);
    const match = !state.filter || (idea && idea.category === state.filter);
    b.el.classList.toggle("dim", !match);
  });
}
function renderMe() {
  const chip = $("#me-chip");
  chip.textContent = state.me ? (state.reveal ? `${state.me} · 전체열람` : state.me) : "이름 설정";
  chip.classList.toggle("reveal", state.reveal);
}
function initTheme() {
  const saved = localStorage.getItem("axdea_theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);
  $("#theme-btn").onclick = () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("axdea_theme", next);
  };
}

// ---------- 이름 게이트 ----------
function openNameModal() {
  $("#name-input").value = state.me || "";
  $("#name-modal").hidden = false;
  setTimeout(() => $("#name-input").focus(), 50);
}
function saveName() {
  const v = $("#name-input").value.trim();
  if (!v) { $("#name-input").focus(); return; }
  state.me = v;
  state.reveal = isRevealer(v);
  localStorage.setItem("axdea_name", v);
  $("#name-modal").hidden = true;
  renderMe();
  rerenderAuthors();
  rerenderMine();
  refreshCounts();
}

// ---------- 캔버스 & 물리 ----------
const stage = $("#stage");
const R = () => (window.innerWidth <= 520 ? 34 : 42);
const stageSize = () => ({ W: stage.clientWidth, H: stage.clientHeight });

function makeChar(idea) {
  const el = document.createElement("div");
  el.className = "char pop";
  el.dataset.id = idea.id;
  el.style.setProperty("--cat-hue", catOf(idea.category).hue);
  el.innerHTML = `
    <div class="char-ball" style="--ball:${idea.color}"><img alt="" src="${avatarUrl(idea.avatar_style, idea.avatar_seed)}" /></div>
    <div class="char-badge">${catOf(idea.category).label}</div>`;
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
    y: r + Math.random() * Math.max(1, H - 2 * r),
    vx: (Math.random() - 0.5) * 2.4,
    vy: (Math.random() - 0.5) * 2.4,
    r, baseR: r, scale: 1, el, dragging: false,
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
  const rj = isRejected(state.ideas.find((i) => i.id === id));
  b.el.classList.toggle("rejected", rj);
  let stamp = b.el.querySelector(".char-stamp");
  if (rj) {
    if (!stamp) { stamp = document.createElement("div"); stamp.className = "char-stamp"; stamp.textContent = "반려"; b.el.appendChild(stamp); }
  } else if (stamp) { stamp.remove(); }
}
// 수정 후 캐릭터 외형(색상/카테고리) 갱신 (아바타는 유지)
function updateCharVisual(id) {
  const b = state.bodies.get(id);
  const idea = state.ideas.find((i) => i.id === id);
  if (!b || !idea) return;
  b.el.style.setProperty("--cat-hue", catOf(idea.category).hue);
  const ball = b.el.querySelector(".char-ball");
  if (ball) ball.style.setProperty("--ball", idea.color);
  const badge = b.el.querySelector(".char-badge");
  if (badge) badge.textContent = catOf(idea.category).label;
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
  let pill = b.el.querySelector(".char-counts");
  if (l === 0 && c === 0) { if (pill) pill.remove(); return; }
  if (!pill) { pill = document.createElement("div"); pill.className = "char-counts"; b.el.appendChild(pill); }
  pill.innerHTML = `${l ? `<span class="cc-like">♥ ${l}</span>` : ""}${c ? `<span class="cc-cmt">💬 ${c}</span>` : ""}`;
}
async function refreshCounts() {
  const { cc, lc, mine } = await loadCounts();
  state.commentCounts = cc; state.likeCounts = lc; state.myLikes = mine;
  state.bodies.forEach((_, id) => updateCharCounts(id));
  if (state.openId) renderSocial(state.openId);
}
// 카드 내 좋아요 버튼 + 댓글 수
function renderSocial(id) {
  const box = document.getElementById("card-social");
  if (!box) return;
  const liked = state.myLikes.has(id);
  const l = state.likeCounts[id] || 0, c = state.commentCounts[id] || 0;
  if (readonly()) {
    box.innerHTML = `<span class="like-static">♥ ${l}</span><span class="cmt-count">💬 댓글 ${c}</span>`;
    return;
  }
  box.innerHTML =
    `<button class="like-btn${liked ? " on" : ""}" id="like-btn">${liked ? "♥" : "♡"} <b>${l}</b> 좋아요</button>` +
    `<span class="cmt-count">💬 댓글 ${c}</span>`;
  document.getElementById("like-btn").onclick = () => toggleLike(id);
}
async function toggleLike(id) {
  if (!state.me) { openNameModal(); return; }
  const liked = state.myLikes.has(id);
  const ok = liked ? await unlikeIdea(id) : await likeIdea(id);
  if (!ok) return;
  if (liked) { state.myLikes.delete(id); state.likeCounts[id] = Math.max(0, (state.likeCounts[id] || 1) - 1); }
  else { state.myLikes.add(id); state.likeCounts[id] = (state.likeCounts[id] || 0) + 1; }
  updateCharCounts(id);
  renderSocial(id);
}
// 내가 쓴 아이디어를 외관으로 표시 (강조 링 + '내 글' 태그) — 내 화면에만 보임
function applyMine(id) {
  const b = state.bodies.get(id);
  const idea = state.ideas.find((i) => i.id === id);
  if (!b || !idea) return;
  const mine = !!state.me && idea.author === state.me;
  b.el.classList.toggle("mine", mine);
  let tag = b.el.querySelector(".char-mine");
  if (mine) {
    if (!tag) { tag = document.createElement("div"); tag.className = "char-mine"; tag.textContent = "내 글"; b.el.appendChild(tag); }
  } else if (tag) { tag.remove(); }
}
function rerenderMine() { state.bodies.forEach((_, id) => applyMine(id)); }
function rerenderAuthors() {
  state.bodies.forEach((b, id) => {
    const idea = state.ideas.find((i) => i.id === id);
    let tag = b.el.querySelector(".char-author");
    if (state.reveal && idea) {
      if (!tag) { tag = document.createElement("div"); tag.className = "char-author"; b.el.appendChild(tag); }
      tag.textContent = idea.author;
    } else if (tag) { tag.remove(); }
  });
}

function loop() {
  const { W, H } = stageSize();
  const ids = [...state.bodies.keys()];
  // 이동 + 벽
  for (const id of ids) {
    const b = state.bodies.get(id);
    if (b.dragging) continue;
    let nb = stepBody(b, 1);
    nb = resolveWall(nb, W, H, 0.9);
    // 마찰 + 최소 속도(완전 정지 방지)
    nb.vx *= 0.995; nb.vy *= 0.995;
    const sp = Math.hypot(nb.vx, nb.vy);
    if (sp < 0.18) { nb.vx += (Math.random() - 0.5) * 0.4; nb.vy += (Math.random() - 0.5) * 0.4; }
    Object.assign(b, nb);
  }
  // 충돌 (드래그 중인 것은 위치 고정, 상대만 밀림)
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = state.bodies.get(ids[i]), c = state.bodies.get(ids[j]);
      const [na, nc] = resolveCollision(a, c);
      if (!a.dragging) Object.assign(a, na);
      if (!c.dragging) Object.assign(c, nc);
    }
  }
  for (const id of ids) {
    const b = state.bodies.get(id);
    b.el.style.transform = `translate(${b.x}px, ${b.y}px) scale(${b.scale})`;
  }
  updateCat(W, H);
  requestAnimationFrame(loop);
}

// 하단 고양이: 가장 가까운 공을 쫓아 툭툭 쳐서 논다
function initCat() {
  const el = $("#cat");
  const { W, H } = stageSize();
  state.cat = { x: W * 0.35, y: H - 46, vx: 1.4, dir: 1, targetId: null, cooldown: 0, el };
}
function updateCat(W, H) {
  const cat = state.cat;
  if (!cat) return;
  const baseY = H - 46;
  cat.cooldown = Math.max(0, cat.cooldown - 1);

  // 타겟(가장 가까운 공, 하단 가중치) 재선정
  if (!cat.targetId || !state.bodies.has(cat.targetId) || cat.cooldown === 0) {
    let best = null, bd = Infinity;
    state.bodies.forEach((b, id) => {
      if (b.dragging) return;
      const d = Math.abs(b.x - cat.x) + Math.abs(b.y - baseY) * 0.6;
      if (d < bd) { bd = d; best = id; }
    });
    if (cat.cooldown === 0 || !cat.targetId) cat.targetId = best;
  }
  const target = cat.targetId ? state.bodies.get(cat.targetId) : null;

  if (target && !target.dragging) {
    const dx = target.x - cat.x;
    cat.vx = Math.max(-3.6, Math.min(3.6, dx * 0.05));
    if (Math.abs(cat.vx) > 0.25) cat.dir = cat.vx > 0 ? 1 : -1;
    cat.x += cat.vx;
    // 하단부에 있는 공까지 살짝 뛰어오름
    const desiredY = Math.max(H * 0.5, Math.min(baseY, target.y));
    cat.y += (desiredY - cat.y) * 0.09;
    // 닿으면 공을 위로 튕겨 올림(공놀이)
    const dist = Math.hypot(target.x - cat.x, target.y - cat.y);
    if (dist < target.r + 42 && cat.cooldown === 0) {
      const away = Math.sign(target.x - cat.x) || (Math.random() < 0.5 ? 1 : -1);
      target.vx = away * (4 + Math.random() * 4);
      target.vy = -(7 + Math.random() * 5);
      cat.cooldown = 55;
      cat.el.classList.add("pounce");
      setTimeout(() => cat.el.classList.remove("pounce"), 280);
      cat.targetId = null;
    }
  } else {
    cat.x += cat.vx;
    if (cat.x < 44 || cat.x > W - 44) cat.vx *= -1;
    cat.y += (baseY - cat.y) * 0.09;
  }
  cat.x = Math.max(30, Math.min(W - 30, cat.x));
  cat.el.style.transform = `translate(${cat.x}px, ${cat.y}px) scaleX(${cat.dir})`;
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
    const { W, H } = stageSize();
    b.x = Math.max(b.r, Math.min(W - b.r, p.x));
    b.y = Math.max(b.r, Math.min(H - b.r, p.y));
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
  const rj = isRejected(idea);
  $("#card-body").innerHTML =
    (rj ? `<div class="card-rej-banner">반려됨 · 진행이 어려운 아이디어로 표시되었습니다</div>` : "") +
    `<div class="card-text">${esc(idea.body || "(내용 없음)")}</div>`;
  const isOwner = !!state.me && idea.author === state.me;
  let btns = "";
  if (!readonly()) {
    if (state.reveal) btns += `<button class="btn" id="rej-btn">${rj ? "반려 취소" : "반려"}</button>`;
    if (isOwner) btns += `<button class="btn" id="edit-btn">수정</button>`;
    if (isOwner || state.reveal) btns += `<button class="btn danger" id="del-btn">삭제</button>`;
  }
  $("#card-footer").innerHTML = btns;
  if (!readonly()) {
    if (state.reveal) $("#rej-btn").onclick = () => toggleReject(id);
    if (isOwner) $("#edit-btn").onclick = () => openEdit(id);
    if (isOwner || state.reveal) $("#del-btn").onclick = () => removeIdea(id);
  }
  $("#comment-form").style.display = readonly() ? "none" : "";
  renderSocial(id);
  $("#card-modal").hidden = false;
  renderComments(await loadComments(id));
}
function renderComments(list) {
  const box = $("#card-comments");
  state.openComments = list;
  if (!list.length) { box.innerHTML = `<div class="comment-empty">첫 댓글을 남겨보세요.</div>`; return; }
  box.innerHTML = list.map((c) => {
    const mine = !readonly() && !!state.me && c.author === state.me;
    const ctrls = readonly() ? "" :
      (mine ? `<button class="c-act" data-act="edit" data-id="${c.id}">수정</button>` : "") +
      (mine || state.reveal ? `<button class="c-act" data-act="del" data-id="${c.id}">삭제</button>` : "");
    return `<div class="comment" data-id="${c.id}">
      <div class="c-main">${state.reveal ? `<span class="c-author">${esc(c.author)}</span>` : ""}<span class="c-body">${esc(c.body)}</span></div>
      ${ctrls ? `<div class="c-actions">${ctrls}</div>` : ""}
    </div>`;
  }).join("");
  box.querySelectorAll(".c-act").forEach((btn) => {
    btn.onclick = () => (btn.dataset.act === "edit" ? startEditComment(btn.dataset.id) : removeComment(btn.dataset.id));
  });
  box.scrollTop = box.scrollHeight;
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
  $("#compose-modal").hidden = true;
}

// ---------- 전체 아이디어 목록 ----------
function openList() {
  const box = $("#list-items");
  const items = [...state.ideas].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  $("#list-count").textContent = `(${items.length})`;
  box.innerHTML = items.length
    ? items.map((i) => {
        const cat = catOf(i.category);
        const rj = isRejected(i);
        const author = state.reveal ? `<span class="li-author">${esc(i.author)}</span>` : `<span class="li-author muted">익명</span>`;
        const l = state.likeCounts[i.id] || 0, c = state.commentCounts[i.id] || 0;
        const mine = !!state.me && i.author === state.me;
        return `<button class="list-item${rj ? " rej" : ""}${mine ? " mine" : ""}" data-id="${i.id}">
          <span class="li-dot" style="background:${i.color}"></span>
          <span class="li-title">${esc(i.title)}${mine ? ` <span class="li-mine">내 글</span>` : ""}${rj ? ` <span class="li-rej">반려</span>` : ""}</span>
          <span class="li-counts">♥ ${l} · 💬 ${c}</span>
          <span class="li-cat" style="--cat-hue:${cat.hue}">${cat.label}</span>
          ${author}
        </button>`;
      }).join("")
    : `<div class="comment-empty">아직 아이디어가 없어요.</div>`;
  box.querySelectorAll(".list-item").forEach((el) => {
    el.onclick = () => { $("#list-modal").hidden = true; openCard(el.dataset.id); };
  });
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
  await refreshCounts();
}
async function openArchive() {
  if (!state.roundsEnabled) { alert("아카이브 기능을 켜려면 supabase.sql의 라운드 설정을 실행해야 합니다."); return; }
  const rounds = await loadRounds();
  $("#archive-count").textContent = `(${rounds.length})`;
  const box = $("#archive-items");
  box.innerHTML = rounds.map((r) => {
    const active = r.round === state.activeRound;
    const viewing = r.round === state.viewRound;
    const renameBtn = state.reveal ? `<button class="round-edit" data-rename="${esc(r.round)}" title="이름 변경">✎</button>` : "";
    return `<div class="list-item round-item${viewing ? " viewing" : ""}" data-round="${esc(r.round)}">
      <span class="round-name">${esc(r.round)}</span>
      <span class="round-badge${active ? " live" : ""}">${active ? "진행 중" : "아카이브"}</span>
      <span class="round-count">아이디어 ${r.count}</span>
      ${renameBtn}
    </div>`;
  }).join("");
  box.querySelectorAll(".round-item").forEach((el) => {
    el.onclick = (e) => { if (e.target.closest(".round-edit")) return; selectRound(el.dataset.round); };
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
  // 해당 라운드의 아이디어들도 새 이름으로 이동
  if (DEMO) { demoIdeas.forEach((i) => { if ((i.round || "lab-day") === oldName) i.round = newName; }); }
  else {
    const upd = await sb.from("ideas").update({ round: newName }).eq("round", oldName).select();
    if (upd.error) { console.error(upd.error); alert("이름 변경 실패: " + upd.error.message); return; }
  }
  if (isActive) { const ok = await setActiveRoundDB(newName); if (!ok) return; state.activeRound = newName; }
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
$("#name-input").addEventListener("keydown", (e) => { if (e.key === "Enter") saveName(); });
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
$("#comment-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (readonly()) return;
  if (!state.me) { openNameModal(); return; }
  const input = $("#comment-input");
  const body = input.value.trim();
  if (!body || !state.openId) return;
  input.value = "";
  const id = state.openId;
  await addComment(id, state.me, body);
  state.commentCounts[id] = (state.commentCounts[id] || 0) + 1;
  updateCharCounts(id);
  renderSocial(id);
  renderComments(await loadComments(id));
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
}
async function refreshIdeas() { if (!DEMO && !readonly()) reconcile(await loadIdeas()); }
async function refreshOpenComments() { if (!DEMO && state.openId) renderComments(await loadComments(state.openId)); }

function startSync() {
  if (DEMO) return;
  // 1) Supabase Realtime — 퍼블리케이션이 켜져 있으면 즉시 반영
  try {
    sb.channel("axdea-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "ideas" }, () => refreshIdeas())
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, (p) => {
        refreshCounts();
        if (p.new && p.new.idea_id === state.openId) refreshOpenComments();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "likes" }, () => refreshCounts())
      .subscribe();
  } catch (e) { console.warn("[AXdea] realtime 미사용, 폴링으로 동작", e); }
  // 2) 폴링 폴백 — realtime이 꺼져 있어도 새로고침 없이 반영
  setInterval(refreshIdeas, 4000);
  setInterval(refreshOpenComments, 4000);
  setInterval(refreshCounts, 4000);
  setInterval(pollActiveRound, 5000);
}

// ---------- 부팅 ----------
async function boot() {
  initTheme();
  renderFilters();
  renderMe();
  state.roundsEnabled = await detectRounds();
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
  initCat();
  requestAnimationFrame(loop);
  await refreshCounts();
  startSync();
  if (!state.me) openNameModal();
}
boot();
