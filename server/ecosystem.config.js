// pm2 설정 — 상시 구동 + 부팅 자동시작.
// 사용: cd server && pm2 start ecosystem.config.js && pm2 save
// (DB 접속정보 등은 server/.env 에서 server.js가 직접 로드합니다)
module.exports = {
  apps: [
    {
      name: 'axdea',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 15,
      restart_delay: 3000,
      max_memory_restart: '300M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
