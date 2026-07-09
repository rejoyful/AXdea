import { q, json, handler } from "@/lib/db";
export const dynamic = "force-dynamic";
// 라운드 삭제: 해당 라운드의 아이디어 전체 삭제(댓글·좋아요/커피는 FK로 연쇄 삭제). 활성 라운드는 보호.
export const POST = handler(async (req) => {
  const { round } = await req.json();
  if (!round) return json({ error: "round required" }, 400);
  const act = await q("select `value` v from app_state where `key`='active_round'");
  const active = act[0] ? act[0].v : null;
  if (round === active) return json({ error: "활성(진행 중) 라운드는 삭제할 수 없습니다." }, 400);
  const r = await q("delete from ideas where coalesce(round,'lab-day')=?", [round]);
  return json({ ok: true, deleted: r.affectedRows });
});
