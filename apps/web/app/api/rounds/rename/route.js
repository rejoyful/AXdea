import { pool, json, handler } from "@/lib/db";
export const dynamic = "force-dynamic";
export const POST = handler(async (req) => {
  const { from, to } = await req.json();
  if (!from || !to) return json({ error: "from/to required" }, 400);
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    await c.query("update ideas set round=? where coalesce(round,'lab-day')=?", [to, from]);
    await c.query("update app_state set `value`=? where `key`='active_round' and `value`=?", [to, from]);
    await c.commit();
  } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
  return json({ ok: true });
});
