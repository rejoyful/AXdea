// deploy.sh 가 사용하는 PM2 설정 (앱 이름 'web'). 루트에 위치.
// 루트 .env 를 여기서 직접 읽어 앱 프로세스 환경변수로 주입한다
// (deploy.sh 의 --update-env 전달에 의존하지 않아 DB 비밀번호 누락을 방지).
const path = require("path");
const fs = require("fs");

const env = { NODE_ENV: "production", HOSTNAME: "0.0.0.0" };
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2];
  }
}
env.PORT = process.env.PORT || env.PORT || "5114";

module.exports = {
  apps: [
    {
      name: "web",
      cwd: path.join(__dirname, "apps/web"),
      script: "npm",
      args: "start",
      env,
      autorestart: true,
      max_restarts: 15,
      restart_delay: 3000,
      max_memory_restart: "400M",
    },
  ],
};
