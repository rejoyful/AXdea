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
  compose: { category: "etc", color: COLORS[0] },
};
state.reveal = isRevealer(state.me);

// ---------- 데이터 레이어 (Supabase + 데모 폴백) ----------
const sb = (SB_URL && SB_KEY && window.supabase) ? window.supabase.createClient(SB_URL, SB_KEY) : null;
const DEMO = !sb;
let demoIdeas = [];
let demoComments = [];
let demoSeq = 0;
const uid = () => `demo-${Date.now()}-${demoSeq++}`;

if (DEMO) {
  console.warn("[AXdea] Supabase 키가 없어 데모 모드로 동작합니다. js/config.js에 SB_URL/SB_KEY를 채우세요.");
  demoIdeas = seedDemo();
}

async function loadIdeas() {
  if (DEMO) return [...demoIdeas];
  const { data, error } = await sb.from("ideas").select("*").order("created_at", { ascending: true });
  if (error) { console.error(error); return []; }
  return data || [];
}
async function loadComments(ideaId) {
  if (DEMO) return demoComments.filter((c) => c.idea_id === ideaId);
  const { data, error } = await sb.from("comments").select("*").eq("idea_id", ideaId).order("created_at", { ascending: true });
  if (error) { console.error(error); return []; }
  return data || [];
}
async function addIdea(fields) {
  const av = pickAvatar(`${fields.author}-${Date.now()}-${Math.random()}`);
  const row = { ...fields, avatar_style: av.style, avatar_seed: av.seed };
  if (DEMO) {
    const full = { id: uid(), created_at: new Date().toISOString(), ...row };
    demoIdeas.push(full);
    return full;
  }
  const { data, error } = await sb.from("ideas").insert(row).select().single();
  if (error) { console.error(error); alert("저장 실패: " + error.message); return null; }
  return data;
}
async function addComment(ideaId, author, body) {
  const row = { idea_id: ideaId, author, body };
  if (DEMO) { const full = { id: uid(), created_at: new Date().toISOString(), ...row }; demoComments.push(full); return full; }
  const { data, error } = await sb.from("comments").insert(row).select().single();
  if (error) { console.error(error); return null; }
  return data;
}
async function deleteIdea(id) {
  if (DEMO) { demoIdeas = demoIdeas.filter((i) => i.id !== id); return; }
  const { error } = await sb.from("ideas").delete().eq("id", id);
  if (error) console.error(error);
}
async function setStatus(id, status) {
  if (DEMO) { const it = demoIdeas.find((i) => i.id === id); if (it) it.status = status; return true; }
  const { error } = await sb.from("ideas").update({ status }).eq("id", id);
  if (error) { console.error(error); alert("상태 변경 실패: " + error.message + "\n(Supabase에 status 컬럼/update 정책이 필요합니다. supabase.sql 참고)"); return false; }
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
  stage.appendChild(el);
  attachDrag(el, idea.id);

  const { W, H } = stageSize();
  const r = R();
  const body = {
    x: r + Math.random() * Math.max(1, W - 2 * r),
    y: r + Math.random() * Math.max(1, H - 2 * r),
    vx: (Math.random() - 0.5) * 2.4,
    vy: (Math.random() - 0.5) * 2.4,
    r, el, dragging: false,
  };
  state.bodies.set(idea.id, body);
  applyRejected(idea.id);
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
    b.el.style.transform = `translate(${b.x}px, ${b.y}px)`;
  }
  requestAnimationFrame(loop);
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
  $("#card-footer").innerHTML = state.reveal
    ? `<button class="btn" id="rej-btn">${rj ? "반려 취소" : "반려"}</button><button class="btn danger" id="del-btn">삭제</button>`
    : "";
  if (state.reveal) {
    $("#del-btn").onclick = () => removeIdea(id);
    $("#rej-btn").onclick = () => toggleReject(id);
  }
  $("#card-modal").hidden = false;
  renderComments(await loadComments(id));
}
function renderComments(list) {
  const box = $("#card-comments");
  if (!list.length) { box.innerHTML = `<div class="comment-empty">첫 댓글을 남겨보세요.</div>`; return; }
  box.innerHTML = list.map((c) => `
    <div class="comment">${state.reveal ? `<span class="c-author">${esc(c.author)}</span>` : ""}${esc(c.body)}</div>`).join("");
  box.scrollTop = box.scrollHeight;
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
  state.compose = { category: "etc", color: COLORS[Math.floor(Math.random() * COLORS.length)] };
  $("#c-title").value = ""; $("#c-body").value = "";
  renderComposePickers();
  $("#compose-modal").hidden = false;
  setTimeout(() => $("#c-title").focus(), 50);
}
async function saveIdea() {
  const title = $("#c-title").value.trim();
  if (!title) { $("#c-title").focus(); return; }
  const row = await addIdea({
    title, body: $("#c-body").value.trim(),
    category: state.compose.category, color: state.compose.color, author: state.me,
  });
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
        return `<button class="list-item${rj ? " rej" : ""}" data-id="${i.id}">
          <span class="li-dot" style="background:${i.color}"></span>
          <span class="li-title">${esc(i.title)}${rj ? ` <span class="li-rej">반려</span>` : ""}</span>
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
$("#c-cancel").onclick = () => { $("#compose-modal").hidden = true; };
$("#c-save").onclick = saveIdea;
$("#comment-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.me) { openNameModal(); return; }
  const input = $("#comment-input");
  const body = input.value.trim();
  if (!body || !state.openId) return;
  input.value = "";
  await addComment(state.openId, state.me, body);
  renderComments(await loadComments(state.openId));
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
async function refreshIdeas() { if (!DEMO) reconcile(await loadIdeas()); }
async function refreshOpenComments() { if (!DEMO && state.openId) renderComments(await loadComments(state.openId)); }

function startSync() {
  if (DEMO) return;
  // 1) Supabase Realtime — 퍼블리케이션이 켜져 있으면 즉시 반영
  try {
    sb.channel("axdea-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "ideas" }, () => refreshIdeas())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments" }, (p) => {
        if (p.new && p.new.idea_id === state.openId) refreshOpenComments();
      })
      .subscribe();
  } catch (e) { console.warn("[AXdea] realtime 미사용, 폴링으로 동작", e); }
  // 2) 폴링 폴백 — realtime이 꺼져 있어도 새로고침 없이 반영
  setInterval(refreshIdeas, 4000);
  setInterval(refreshOpenComments, 4000);
}

// ---------- 부팅 ----------
async function boot() {
  initTheme();
  renderFilters();
  renderMe();
  state.ideas = await loadIdeas();
  state.ideas.forEach(makeChar);
  rerenderAuthors();
  applyFilter();
  updateEmpty();
  requestAnimationFrame(loop);
  startSync();
  if (!state.me) openNameModal();
}
boot();
