// MySQL 접속 풀 (HMR/재요청에도 재사용되도록 globalThis에 캐시)
import mysql from "mysql2/promise";

const g = globalThis;
export const pool =
  g.__axdeaPool ||
  (g.__axdeaPool = mysql.createPool({
    host: process.env.DB_HOST || "192.168.100.76",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "axdea",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "axdea",
    charset: "utf8mb4",
    timezone: "Z", // DB datetime을 UTC로 취급 → JSON은 ISO Z
    flags: ["FOUND_ROWS"], // UPDATE affectedRows = 매칭된 행 수
    waitForConnections: true,
    connectionLimit: 8,
  }));

export async function q(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

// 배포 시 자동 스키마 보강 (comments: 대댓글 parent_id + 긍정/부정 sentiment)
export async function ensureSchema() {
  if (g.__axdeaSchemaReady) return;
  const cols = await q(
    "select column_name from information_schema.columns where table_schema=database() and table_name='comments'"
  );
  const has = new Set(cols.map((c) => c.COLUMN_NAME || c.column_name));
  if (!has.has("parent_id")) {
    await q("alter table comments add column parent_id char(36) null after idea_id");
    try { await q("alter table comments add index idx_comments_parent (parent_id)"); } catch (e) {}
    try { await q("alter table comments add constraint fk_comments_parent foreign key (parent_id) references comments(id) on delete cascade"); } catch (e) {}
  }
  if (!has.has("sentiment")) {
    await q("alter table comments add column sentiment varchar(16) null after body");
  }
  // likes: 반응 종류(kind: like/coffee) + 누적 카운트(같은 사람이 여러 번 눌러도 쌓이게 복합 PK 제거)
  const lcols = await q(
    "select column_name from information_schema.columns where table_schema=database() and table_name='likes'"
  );
  const lhas = new Set(lcols.map((c) => c.COLUMN_NAME || c.column_name));
  if (!lhas.has("kind")) {
    await q("alter table likes add column kind varchar(16) not null default 'like' after voter");
  }
  if (!lhas.has("id")) {
    // 복합 PK(idea_id,voter) 제거 전, FK가 참조하는 idea_id 인덱스를 먼저 보존
    try { await q("alter table likes add index idx_likes_idea (idea_id)"); } catch (e) {}
    try { await q("alter table likes drop primary key"); } catch (e) {}
    try { await q("alter table likes add column id bigint unsigned not null auto_increment primary key first"); } catch (e) {}
    try { await q("alter table likes add index idx_likes_idea_kind (idea_id, kind)"); } catch (e) {}
  }
  // ideas: 선정→복제 출처 추적(source_id)
  const icols = await q(
    "select column_name from information_schema.columns where table_schema=database() and table_name='ideas'"
  );
  const ihas = new Set(icols.map((c) => c.COLUMN_NAME || c.column_name));
  if (!ihas.has("source_id")) {
    await q("alter table ideas add column source_id char(36) null after status");
    try { await q("alter table ideas add index idx_ideas_source (source_id)"); } catch (e) {}
  }
  g.__axdeaSchemaReady = true;
}
export const json = (data, status) => Response.json(data, status ? { status } : undefined);
// 라우트 핸들러 공통 래퍼: 예외 → 500 JSON
export const handler = (fn) => async (req, ctx) => {
  try {
    return await fn(req, ctx);
  } catch (e) {
    console.error("[API]", e && e.message);
    return Response.json({ error: String((e && e.message) || e) }, { status: 500 });
  }
};
