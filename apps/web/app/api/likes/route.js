import { q, json, handler, ensureSchema } from "@/lib/db";
export const dynamic = "force-dynamic";
// 반응 추가(1인 1회): 같은 사람이 여러 번 눌러도 한 번만 반영(유니크 키).
export const POST = handler(async (req) => {
  await ensureSchema();
  const b = await req.json();
  if (!b.idea_id || !b.voter) return json({ error: "idea_id/voter required" }, 400);
  const kind = b.kind === "coffee" ? "coffee" : "like";
  await q(
    "insert into likes (idea_id,voter,kind,created_at) values (?,?,?,UTC_TIMESTAMP(6)) on duplicate key update created_at=created_at",
    [b.idea_id, b.voter, kind]
  );
  return json({ ok: true });
});
// 반응 취소: 해당 사용자의 그 반응 제거
export const DELETE = handler(async (req) => {
  await ensureSchema();
  const sp = new URL(req.url).searchParams;
  const kind = sp.get("kind") === "coffee" ? "coffee" : "like";
  await q("delete from likes where idea_id=? and voter=? and kind=?", [sp.get("idea_id"), sp.get("voter"), kind]);
  return json({ ok: true });
});
