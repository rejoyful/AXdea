// deploy.sh 가 사용하는 PM2 설정 (앱 이름 'web'). 루트에 위치.
const path = require("path");
module.exports = {
  apps: [
    {
      name: "web",
      cwd: path.join(__dirname, "apps/web"),
      script: "npm",
      args: "start",
      env: { PORT: process.env.PORT || 5114, HOSTNAME: "0.0.0.0", NODE_ENV: "production" },
      autorestart: true,
      max_restarts: 15,
      restart_delay: 3000,
      max_memory_restart: "400M",
    },
  ],
};
