import { q, json, handler } from "@/lib/db";
export const dynamic = "force-dynamic";
const ALLOW = ["title", "body", "category", "color", "author", "round", "status"];
export const PATCH = handler(async (req, { params }) => {
  const b = await req.json();
  const cols = Object.keys(b).filter((k) => ALLOW.includes(k));
  if (!cols.length) return json({ updated: 0 });
  const r = await q(`update ideas set ${cols.map((c) => `\`${c}\`=?`).join(",")} where id=?`, [...cols.map((c) => b[c]), params.id]);
  return json({ updated: r.affectedRows });
});
export const DELETE = handler(async (req, { params }) => {
  const r = await q("delete from ideas where id=?", [params.id]);
  return json({ ok: true, deleted: r.affectedRows });
});
