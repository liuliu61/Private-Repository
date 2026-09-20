# 宝塔部署指南

本文档介绍如何在宝塔面板上从零部署本项目（NestJS 后端 + Next.js 前端 + PostgreSQL）。

---

## 一、前置要求

| 组件 | 版本要求 | 宝塔安装方式 |
|------|----------|-------------|
| Nginx | 1.18+ | 宝塔软件商店 → Nginx |
| Node.js | 18+（推荐 20） | 宝塔软件商店 → PM2管理器（自带 Node） |
| PostgreSQL | 13+ | 宝塔软件商店 → PostgreSQL 管理器 |
| Git | 任意 | 宝塔软件商店 → Git 管理，或终端自带 |

> 服务器配置建议：2核4G 以上（Next.js 构建和运行需要一定内存）。

---

## 二、准备数据库

1. 宝塔 → **数据库** → **PostgreSQL** → **添加数据库**
2. 填写：
   - 数据库名：`agent_finance`
   - 用户名：`finance`
   - 密码：**自己设置一个强密码**（记下来，后面要用）
3. 点提交

---

## 三、拉取代码

在宝塔终端执行：

```bash
cd /www/wwwroot
git clone https://github.com/liuliu61/Private-Repository.git agent-finance
cd agent-finance
```

如果是私有仓库，需要用带 token 的地址：
```bash
git clone https://你的token@github.com/liuliu61/Private-Repository.git agent-finance
```

---

## 四、配置环境变量

### 4.1 后端环境变量

```bash
cd /www/wwwroot/agent-finance/backend
cp .env.example .env
vi .env
```

修改以下内容：
- `DATABASE_URL`：把 `数据库用户名`、`数据库密码`、`数据库名` 改成你第二步设置的
- `JWT_SECRET`：改成 32 位以上随机字符串（执行 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 生成）
- `CORS_ORIGIN`：改成你的域名，如 `https://qd.yqjxa.cn`

### 4.2 前端环境变量

```bash
cd /www/wwwroot/agent-finance/frontend
cp .env.example .env
vi .env
```

修改 `NEXT_PUBLIC_API_URL` 为你的域名，如 `https://qd.yqjxa.cn/api`

> ⚠️ 注意：Prisma 读取的是 `backend/.env`，不是项目根目录的 `.env`。务必确保 `backend/.env` 存在且配置正确。

---

## 五、安装依赖 + 构建

### 5.1 后端

```bash
cd /www/wwwroot/agent-finance/backend
npm install
npm run build
```

### 5.2 数据库迁移 + 初始化

```bash
npx prisma migrate deploy
npx prisma db seed
```

> `prisma db seed` 会创建默认管理员账号：`admin / Admin@123456`

### 5.3 前端

```bash
cd /www/wwwroot/agent-finance/frontend
npm install
npm run build
```

> 前端构建需要 1-2 分钟，如果内存不足可能报错。建议服务器至少 4G 内存，或临时加 swap。

---

## 六、PM2 启动

```bash
cd /www/wwwroot/agent-finance
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # 设置开机自启（按提示复制命令执行）
```

验证：
```bash
pm2 list
```

应该看到 `agent-backend` 和 `agent-frontend` 都是 `online` 状态。

测试端口：
```bash
curl http://127.0.0.1:3001/api/health   # 后端健康检查，应返回 {"status":"ok",...}
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3003/   # 前端，应返回 200
```

---

## 七、Nginx 配置

### 7.1 复制配置模板

```bash
cp /www/wwwroot/agent-finance/deploy/nginx.conf.example /www/server/panel/vhost/nginx/你的域名.conf
```

### 7.2 修改域名

编辑 `/www/server/panel/vhost/nginx/你的域名.conf`，把所有 `qd.yqjxa.cn` 替换成你的域名（共 6 处）。

如果前端或后端端口不是默认的 3003/3001，同步修改 `proxy_pass` 对应的端口。

### 7.3 申请 SSL 证书

宝塔 → **网站** → 你的域名 → **SSL** → **Let's Encrypt** → 勾选域名 → **申请**。

证书申请成功后，确认证书文件存在：
```bash
ls /www/server/panel/vhost/ssl/你的域名/
# 应看到 fullchain.pem 和 privkey.pem
```

### 7.4 重载 Nginx

```bash
nginx -t && nginx -s reload
```

---

## 八、验证部署

1. 浏览器访问 `https://你的域名`，应看到登录页
2. 用 `admin / Admin@123456` 登录
3. **登录后立即修改密码**（右上角 → 修改密码）

---

## 九、更新代码（后续迭代）

```bash
cd /www/wwwroot/agent-finance
git pull

# 后端重新构建
cd backend
npm install   # 如果 package.json 有变动
npm run build
npx prisma migrate deploy   # 如果有数据库迁移
cd ..

# 前端重新构建
cd frontend
npm install   # 如果 package.json 有变动
npm run build
cd ..

# 重启服务
pm2 restart agent-backend agent-frontend
```

> ⚠️ 如果修改了 `ecosystem.config.js`，必须用 delete + start，不能用 restart：
> ```bash
> pm2 delete agent-backend agent-frontend
> pm2 start ecosystem.config.js
> ```

---

## 十、常见问题排查

### 10.1 502 Bad Gateway

**原因**：Nginx 连不上后端或前端。

**排查步骤**：
```bash
# 1. 检查 PM2 进程状态
pm2 list

# 2. 检查端口是否在监听
netstat -tlnp | grep -E "3001|3003"

# 3. 直接测试端口
curl http://127.0.0.1:3001/api/health
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3003/

# 4. 看 Nginx 错误日志
tail -20 /www/wwwlogs/你的域名.error.log
```

**常见原因**：
- 进程没启动或崩溃 → `pm2 logs agent-backend` 看错误
- 端口被其他项目占用 → 改 `ecosystem.config.js` 端口，delete 后重新 start
- Nginx 配置里 proxy_pass 端口不对 → 检查配置文件

### 10.2 EADDRINUSE 端口被占用

```bash
# 查看哪个进程占用了端口
netstat -tlnp | grep 3003

# 改端口（以 3004 为例）
FRONTEND_PORT=3004 pm2 start ecosystem.config.js
# 或修改 ecosystem.config.js 里的默认端口，然后 delete + start
```

### 10.3 PM2 restart 后配置不生效

`pm2 restart` 不会重新读取 `ecosystem.config.js` 的修改。必须：
```bash
pm2 delete agent-backend agent-frontend
pm2 start ecosystem.config.js
pm2 save
```

### 10.4 DATABASE_URL not found

Prisma 读取的是 `backend/.env`，不是项目根目录的 `.env`。
```bash
# 确认 backend/.env 存在
ls -la /www/wwwroot/agent-finance/backend/.env

# 如果没有，从模板复制
cp /www/wwwroot/agent-finance/backend/.env.example /www/wwwroot/agent-finance/backend/.env
# 然后编辑填写数据库信息
```

### 10.5 HTTPS 访问 502 但 HTTP 正常

Nginx 配置缺少 443（HTTPS）server 块。宝塔申请 SSL 后不一定自动写入 443 配置。

**解决**：用本项目的 `deploy/nginx.conf.example` 完整模板替换配置文件，确保同时有 80 和 443 两个 server 块。

### 10.6 前端构建失败（内存不足）

```bash
# 查看内存
free -h

# 如果内存不足，临时加 swap
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile

# 然后重新构建
cd /www/wwwroot/agent-finance/frontend
npm run build
```

### 10.7 后端启动失败

```bash
# 看后端错误日志
pm2 logs agent-backend --err --lines 30

# 常见原因：
# - 数据库连不上：检查 backend/.env 的 DATABASE_URL
# - 端口被占用：改端口
# - 缺少 dist 目录：重新 npm run build
```

---

## 十一、日志位置

| 日志 | 路径 |
|------|------|
| 后端 stdout | `/www/wwwlogs/pm2/agent-backend-out.log` |
| 后端 stderr | `/www/wwwlogs/pm2/agent-backend-error.log` |
| 前端 stdout | `/www/wwwlogs/pm2/agent-frontend-out.log` |
| 前端 stderr | `/www/wwwlogs/pm2/agent-frontend-error.log` |
| Nginx access | `/www/wwwlogs/你的域名.log` |
| Nginx error | `/www/wwwlogs/你的域名.error.log` |

实时查看日志：
```bash
pm2 logs agent-backend          # 后端实时日志
pm2 logs agent-frontend         # 前端实时日志
tail -f /www/wwwlogs/你的域名.error.log   # Nginx 错误日志
```

---

## 十二、默认账号

- 用户名：`admin`
- 密码：`Admin@123456`

> ⚠️ 登录后请立即修改密码！

---

## 十三、项目结构

```
agent-finance/
├── backend/                 # NestJS 后端
│   ├── src/
│   ├── prisma/              # 数据库 schema 和迁移
│   ├── .env.example         # 后端环境变量模板
│   └── package.json
├── frontend/                # Next.js 前端
│   ├── app/
│   ├── .env.example         # 前端环境变量模板
│   └── package.json
├── deploy/
│   └── nginx.conf.example   # 宝塔 Nginx 配置模板
├── ecosystem.config.js      # PM2 配置
├── DEPLOY.md                # 本文档
└── README.md
```
