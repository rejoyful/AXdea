import { q, json, handler, ensureSchema } from "@/lib/db";
export const dynamic = "force-dynamic";
// 반응 추가(누적): 좋아요/커피를 누를 때마다 한 행씩 쌓인다.
export const POST = handler(async (req) => {
  await ensureSchema();
  const b = await req.json();
  if (!b.idea_id || !b.voter) return json({ error: "idea_id/voter required" }, 400);
  const kind = b.kind === "coffee" ? "coffee" : "like";
  await q("insert into likes (idea_id,voter,kind,created_at) values (?,?,?,UTC_TIMESTAMP(6))", [b.idea_id, b.voter, kind]);
  return json({ ok: true });
});
// (호환용) 특정 사용자의 반응 전체 제거
export const DELETE = handler(async (req) => {
  await ensureSchema();
  const sp = new URL(req.url).searchParams;
  const kind = sp.get("kind") === "coffee" ? "coffee" : "like";
  await q("delete from likes where idea_id=? and voter=? and kind=?", [sp.get("idea_id"), sp.get("voter"), kind]);
  return json({ ok: true });
});
