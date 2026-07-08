import { q, json, handler } from "@/lib/db";
export const dynamic = "force-dynamic";
export const GET = handler(async () => {
  const r = await q("select coalesce(round,'lab-day') round, count(*) count, max(created_at) last from ideas group by coalesce(round,'lab-day')");
  return json(r);
});
