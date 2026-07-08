import { q, json, handler, ensureSchema } from "@/lib/db";
export const dynamic = "force-dynamic";
export const GET = handler(async () => { await q("select 1"); await ensureSchema(); return json({ ok: true }); });
