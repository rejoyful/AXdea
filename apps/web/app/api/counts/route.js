import { q, json, handler } from "@/lib/db";
export const dynamic = "force-dynamic";
export const GET = handler(async (req) => {
  const me = new URL(req.url).searchParams.get("me");
  const cc = await q("select idea_id, count(*) c from comments group by idea_id");
  const lc = await q("select idea_id, count(*) c from likes group by idea_id");
  const mine = me ? await q("select idea_id from likes where voter=?", [me]) : [];
  return json({
    commentCounts: Object.fromEntries(cc.map((r) => [r.idea_id, Number(r.c)])),
    likeCounts: Object.fromEntries(lc.map((r) => [r.idea_id, Number(r.c)])),
    myLikes: mine.map((r) => r.idea_id),
  });
});
