import { q, json, handler } from "@/lib/db";
export const dynamic = "force-dynamic";
export const POST = handler(async (req) => {
  const b = await req.json();
  if (!b.idea_id || !b.voter) return json({ error: "idea_id/voter required" }, 400);
  await q("insert into likes (idea_id,voter,created_at) values (?,?,UTC_TIMESTAMP(6)) on duplicate key update created_at=created_at", [b.idea_id, b.voter]);
  return json({ ok: true });
});
export const DELETE = handler(async (req) => {
  const sp = new URL(req.url).searchParams;
  await q("delete from likes where idea_id=? and voter=?", [sp.get("idea_id"), sp.get("voter")]);
  return json({ ok: true });
});
