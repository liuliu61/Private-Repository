const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const projectRoot = __dirname;
const nodeBinary = '/www/server/nvm/versions/node/v20.20.2/bin/node';
const logDirectory = '/www/wwwlogs/pm2';

function loadEnvironment(filePath) {
  const environment = {};

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    environment[key] = value;
  }

  return environment;
}

function buildDatabaseUrl(environment) {
  const databaseHost = execFileSync(
    '/usr/bin/docker',
    [
      'inspect',
      '--format',
      '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',
      'qd-yqjxa-postgres',
    ],
    { encoding: 'utf8' },
  ).trim();

  if (!databaseHost) {
    throw new Error('Unable to resolve the qd-yqjxa-postgres container address.');
  }

  return `postgresql://${encodeURIComponent(environment.POSTGRES_USER)}:${encodeURIComponent(
    environment.POSTGRES_PASSWORD,
  )}@${databaseHost}:5432/${encodeURIComponent(environment.POSTGRES_DB)}?schema=public`;
}

const serverEnvironment = loadEnvironment(path.join(projectRoot, '.env'));
const backendEnvironment = {
  ...serverEnvironment,
  NODE_ENV: 'production',
  PORT: '3001',
  BACKEND_PORT: '3001',
  BACKEND_HOST: '127.0.0.1',
  DATABASE_URL: buildDatabaseUrl(serverEnvironment),
};

module.exports = {
  apps: [
    {
      name: 'qd-backend',
      cwd: path.join(projectRoot, 'backend'),
      script: 'dist/src/main.js',
      interpreter: nodeBinary,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      restart_delay: 3000,
      min_uptime: 10000,
      max_restarts: 10,
      env: backendEnvironment,
      out_file: path.join(logDirectory, 'qd-backend-out.log'),
      error_file: path.join(logDirectory, 'qd-backend-error.log'),
      time: true,
    },
    {
      name: 'qd-frontend',
      cwd: path.join(projectRoot, 'frontend'),
      script: 'node_modules/next/dist/bin/next',
      interpreter: nodeBinary,
      args: 'start --hostname 127.0.0.1',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      restart_delay: 3000,
      min_uptime: 10000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: '3002',
      },
      out_file: path.join(logDirectory, 'qd-frontend-out.log'),
      error_file: path.join(logDirectory, 'qd-frontend-error.log'),
      time: true,
    },
  ],
};
