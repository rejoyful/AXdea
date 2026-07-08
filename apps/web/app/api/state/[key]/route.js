import { q, json, handler } from "@/lib/db";
export const dynamic = "force-dynamic";
export const GET = handler(async (req, { params }) => {
  const r = await q("select `value` from app_state where `key`=?", [params.key]);
  return json({ value: r[0] ? r[0].value : null });
});
export const PUT = handler(async (req, { params }) => {
  const b = await req.json();
  await q("insert into app_state (`key`,`value`) values (?,?) on duplicate key update `value`=values(`value`)", [params.key, b.value]);
  return json({ ok: true });
});
