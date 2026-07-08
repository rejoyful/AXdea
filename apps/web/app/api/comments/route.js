import { q, json, handler, ensureSchema } from "@/lib/db";
import { randomUUID } from "node:crypto";
export const dynamic = "force-dynamic";
export const GET = handler(async (req) => {
  await ensureSchema();
  const idea_id = new URL(req.url).searchParams.get("idea_id");
  return json(await q("select * from comments where idea_id=? order by created_at", [idea_id]));
});
export const POST = handler(async (req) => {
  await ensureSchema();
  const b = await req.json();
  if (!b.idea_id || !b.author || !b.body) return json({ error: "idea_id/author/body required" }, 400);
  const id = randomUUID();
  const sentiment = b.sentiment === "pos" || b.sentiment === "neg" ? b.sentiment : null;
  const parent_id = b.parent_id || null;
  await q("insert into comments (id,idea_id,parent_id,author,body,sentiment,created_at) values (?,?,?,?,?,?,UTC_TIMESTAMP(6))",
    [id, b.idea_id, parent_id, b.author, b.body, sentiment]);
  const r = await q("select * from comments where id=?", [id]);
  return json(r[0]);
});
