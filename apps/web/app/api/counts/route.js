import { q, json, handler, ensureSchema } from "@/lib/db";
export const dynamic = "force-dynamic";
export const GET = handler(async (req) => {
  await ensureSchema();
  const me = new URL(req.url).searchParams.get("me");
  const cc = await q("select idea_id, count(*) c from comments group by idea_id");
  const pc = await q("select idea_id, count(*) c from comments where sentiment='pos' group by idea_id");
  const nc = await q("select idea_id, count(*) c from comments where sentiment='neg' group by idea_id");
  const fc = await q("select idea_id, count(*) c from comments where sentiment='coffee' group by idea_id");
  const lc = await q("select idea_id, count(*) c from likes where kind='like' group by idea_id");
  const mine = me ? await q("select distinct idea_id from likes where voter=? and kind='like'", [me]) : [];
  return json({
    commentCounts: Object.fromEntries(cc.map((r) => [r.idea_id, Number(r.c)])),
    posCounts: Object.fromEntries(pc.map((r) => [r.idea_id, Number(r.c)])),
    negCounts: Object.fromEntries(nc.map((r) => [r.idea_id, Number(r.c)])),
    coffeeCounts: Object.fromEntries(fc.map((r) => [r.idea_id, Number(r.c)])), // 댓글의 '커피' 태그 수
    likeCounts: Object.fromEntries(lc.map((r) => [r.idea_id, Number(r.c)])),
    myLikes: mine.map((r) => r.idea_id),
  });
});
