import { q, json, handler } from "@/lib/db";
export const dynamic = "force-dynamic";
export const PATCH = handler(async (req, { params }) => {
  const b = await req.json();
  const r = await q("update comments set body=? where id=?", [b.body, params.id]);
  return json({ updated: r.affectedRows });
});
export const DELETE = handler(async (req, { params }) => {
  const r = await q("delete from comments where id=?", [params.id]);
  return json({ ok: true, deleted: r.affectedRows });
});
