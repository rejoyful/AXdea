// AXdea API 클라이언트 — 백엔드(/api)와 통신. 앱과 같은 오리진이라 CORS 불필요.
import { API_BASE } from "./config.js";
const base = API_BASE || "/api";

async function req(method, path, body) {
  const opt = { method, headers: {} };
  if (body !== undefined) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
  const res = await fetch(base + path, opt);
  if (!res.ok) {
    let msg = `${res.status}`;
    try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (e) { /* ignore */ }
    throw new Error(`API ${method} ${path}: ${msg}`);
  }
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}
const enc = encodeURIComponent;

export const api = {
  health: () => req("GET", "/health"),
  getState: (k) => req("GET", `/state/${enc(k)}`),
  putState: (k, value) => req("PUT", `/state/${enc(k)}`, { value }),
  rounds: () => req("GET", "/rounds"),
  renameRound: (from, to) => req("POST", "/rounds/rename", { from, to }),
  ideasByRound: (round) => req("GET", `/ideas?round=${enc(round)}`),
  ideasByRounds: (rounds) => req("GET", `/ideas?rounds=${enc(rounds.join(","))}`),
  allIdeas: () => req("GET", "/ideas"),
  addIdea: (fields) => req("POST", "/ideas", fields),
  updateIdea: (id, fields) => req("PATCH", `/ideas/${id}`, fields),
  deleteIdea: (id) => req("DELETE", `/ideas/${id}`),
  comments: (ideaId) => req("GET", `/comments?idea_id=${enc(ideaId)}`),
  addComment: (idea_id, author, body, extra = {}) => req("POST", "/comments", { idea_id, author, body, ...extra }),
  updateComment: (id, body) => req("PATCH", `/comments/${id}`, { body }),
  deleteComment: (id) => req("DELETE", `/comments/${id}`),
  counts: (me) => req("GET", `/counts${me ? `?me=${enc(me)}` : ""}`),
  like: (idea_id, voter) => req("POST", "/likes", { idea_id, voter }),
  unlike: (idea_id, voter) => req("DELETE", `/likes?idea_id=${enc(idea_id)}&voter=${enc(voter)}`),
};
