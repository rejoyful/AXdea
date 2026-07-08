import { q, json, handler, ensureSchema } from "@/lib/db";
export const dynamic = "force-dynamic";
export const GET = handler(async (req) => {
  await ensureSchema();
  const me = new URL(req.url).searchParams.get("me");
  const cc = await q("select idea_id, count(*) c from comments group by idea_id");
  const lc = await q("select idea_id, count(*) c from likes where kind='like' group by idea_id");
  const fc = await q("select idea_id, count(*) c from likes where kind='coffee' group by idea_id");
  const mine = me ? await q("select distinct idea_id from likes where voter=? and kind='like'", [me]) : [];
  const mineCoffee = me ? await q("select distinct idea_id from likes where voter=? and kind='coffee'", [me]) : [];
  return json({
    commentCounts: Object.fromEntries(cc.map((r) => [r.idea_id, Number(r.c)])),
    likeCounts: Object.fromEntries(lc.map((r) => [r.idea_id, Number(r.c)])),
    coffeeCounts: Object.fromEntries(fc.map((r) => [r.idea_id, Number(r.c)])),
    myLikes: mine.map((r) => r.idea_id),
    myCoffees: mineCoffee.map((r) => r.idea_id),
  });
});
