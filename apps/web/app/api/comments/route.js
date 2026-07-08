import { q, json, handler } from "@/lib/db";
import { randomUUID } from "node:crypto";
export const dynamic = "force-dynamic";
export const GET = handler(async (req) => {
  const idea_id = new URL(req.url).searchParams.get("idea_id");
  return json(await q("select * from comments where idea_id=? order by created_at", [idea_id]));
});
export const POST = handler(async (req) => {
  const b = await req.json();
  if (!b.idea_id || !b.author || !b.body) return json({ error: "idea_id/author/body required" }, 400);
  const id = randomUUID();
  await q("insert into comments (id,idea_id,author,body,created_at) values (?,?,?,?,UTC_TIMESTAMP(6))", [id, b.idea_id, b.author, b.body]);
  const r = await q("select * from comments where id=?", [id]);
  return json(r[0]);
});
