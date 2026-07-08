import { q, json, handler } from "@/lib/db";
export const dynamic = "force-dynamic";
export const GET = handler(async () => { await q("select 1"); return json({ ok: true }); });
