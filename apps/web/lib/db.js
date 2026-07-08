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
