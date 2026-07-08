import { q, json, handler } from "@/lib/db";
import { randomUUID } from "node:crypto";
export const dynamic = "force-dynamic";
export const GET = handler(async (req) => {
  const sp = new URL(req.url).searchParams;
  if (sp.get("rounds")) {
    const arr = sp.get("rounds").split(",").filter(Boolean);
    if (!arr.length) return json([]);
    return json(await q(`select * from ideas where coalesce(round,'lab-day') in (${arr.map(() => "?").join(",")}) order by created_at`, arr));
  }
  if (sp.get("round")) return json(await q("select * from ideas where coalesce(round,'lab-day')=? order by created_at", [sp.get("round")]));
  return json(await q("select * from ideas order by created_at"));
});
export const POST = handler(async (req) => {
  const b = await req.json();
  if (!b.title || !b.author) return json({ error: "title/author required" }, 400);
  const id = randomUUID();
  await q("insert into ideas (id,title,body,category,color,avatar_style,avatar_seed,author,created_at,round,status) values (?,?,?,?,?,?,?,?,UTC_TIMESTAMP(6),?,?)",
    [id, b.title, b.body || "", b.category || "etc", b.color || "#22e3ff", b.avatar_style || "bottts", b.avatar_seed || id, b.author, b.round || "lab-day", b.status || "open"]);
  const r = await q("select * from ideas where id=?", [id]);
  return json(r[0]);
});
