/**
 * PM2 部署配置
 *
 * 使用方式：
 *   pm2 start ecosystem.config.js           # 启动全部
 *   pm2 start ecosystem.config.js --only agent-backend   # 只启动后端
 *
 * 端口配置（可选，默认 3001/3003）：
 *   BACKEND_PORT=3001 FRONTEND_PORT=3003 pm2 start ecosystem.config.js
 *
 * ⚠️ 重要：修改本文件后，必须 delete 后重新 start，restart 不会重新读取配置：
 *   pm2 delete agent-backend agent-frontend
 *   pm2 start ecosystem.config.js
 */

const path = require('path');

const projectRoot = __dirname;
const logDirectory = process.env.PM2_LOG_DIR || '/www/wwwlogs/pm2';

const backendPort = process.env.BACKEND_PORT || 3001;
const frontendPort = process.env.FRONTEND_PORT || 3003; // 默认避开 3000/3002，减少与其他项目冲突

module.exports = {
  apps: [
    {
      name: 'agent-backend',
      cwd: path.join(projectRoot, 'backend'),
      script: 'dist/src/main.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      restart_delay: 3000,
      min_uptime: 10000,
      max_restarts: 10,
      max_memory_restart: '300M', // 内存超过 300M 自动重启，防止 OOM
      env: {
        NODE_ENV: 'production',
        PORT: String(backendPort),
        BACKEND_PORT: String(backendPort),
        BACKEND_HOST: '127.0.0.1',
      },
      out_file: path.join(logDirectory, 'agent-backend-out.log'),
      error_file: path.join(logDirectory, 'agent-backend-error.log'),
      time: true,
    },
    {
      name: 'agent-frontend',
      cwd: path.join(projectRoot, 'frontend'),
      script: 'node_modules/next/dist/bin/next',
      args: `start --hostname 127.0.0.1 --port ${frontendPort}`,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      restart_delay: 3000,
      min_uptime: 10000,
      max_restarts: 10,
      max_memory_restart: '400M', // Next.js 内存上限 400M
      env: {
        NODE_ENV: 'production',
        PORT: String(frontendPort),
      },
      out_file: path.join(logDirectory, 'agent-frontend-out.log'),
      error_file: path.join(logDirectory, 'agent-frontend-error.log'),
      time: true,
    },
  ],
};
