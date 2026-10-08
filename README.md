# 代理商财务系统 Agent Finance

> 面向广告代理行业的全链路资金管理、返点结算与发票管理平台

[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-private-red)](#许可证)

一套专为广告代理商打造的业务财务中台，覆盖**银行流水入账 → 客户钱包 → 推广账户充值 → 返点政策 → 服务费对账 → 发票管理**的完整业务闭环，支持多级代理结算、对公对私拆分、授信垫款等行业特色功能。

---

## 📋 目录

- [核心功能](#核心功能)
- [技术架构](#技术架构)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [环境配置](#环境配置)
- [业务规则](#业务规则)
- [API 概览](#api-概览)
- [部署指南](#部署指南)
- [安全建议](#安全建议)
- [开发规范](#开发规范)

---

## 核心功能

### 🏦 资金管理中台

| 模块 | 功能说明 |
|------|----------|
| **银行流水** | 支持手工录入、文件导入、接口同步、银行直连四种来源；自动匹配客户付款账户，匹配后人工确认 |
| **收款入账** | 对公/对私拆分入账，一笔流水可拆分为多行；对公自动生成发票任务，对私不进入发票管理 |
| **收款单退款** | 部分退款审批流程，退款后收款单状态不变；退款金额不可超过已入账金额；退款部分不再需要开票 |
| **客户钱包** | 财务V钱包、外采钱包双类型；支持充值、退款、调整、期初、授信、垫款、还款、豁免 |
| **推广账户** | 客户推广平台账号管理；充值支持客户钱包扣款，价内返点自动计算打款金额与利润；退款退回客户钱包 |
| **资金流水** | 整合资金账户、客户钱包、推广账户三类流水，统一视图查询与导出 |
| **财务调整** | 支持调整单审批流程，经审批后执行资金变动 |

### 👥 客户与合同

| 模块 | 功能说明 |
|------|----------|
| **客户管理** | 客户基础信息维护，支持部门级数据权限隔离（A部门看不到B部门客户） |
| **客户合同** | 合同全生命周期管理，支持审批流程、到期提醒、一个客户多合同、附件上传 |
| **打款账户** | 一个客户可绑定多个付款账户，银行流水自动匹配后人工确认入账 |
| **开票信息** | 一个客户可维护多条开票抬头（抬头、税号、地址、电话、开户行、账号），发票任务创建时快照保存 |

### 💱 返点与结算

| 模块 | 功能说明 |
|------|----------|
| **返点政策** | 客户返点政策三维度配置，支持政策变更审批流程，审批后立即生效 |
| **端口管理** | 自定义端口与对公/对私双返点政策，推广账户充值选端口自动带出成本点 |
| **服务费对账** | 服务费自动扣除入账，算额外收入；对公需开票、对私不开票；弹窗确认 |
| **多级结算** | 客户结算、一级代理结算，支持外采订单结算流程 |

### 🧾 发票管理

| 模块 | 功能说明 |
|------|----------|
| **发票任务** | 全流程状态流转：待开票 → 审核中 → 待完成开票 → 已完成；审核不通过可编辑重提，创建人可撤回 |
| **人工开票** | 手工记录实际发票号码、代码、开票日期、发票类型、发票金额，支持附件上传 |
| **额度控制** | 可开票金额 = 对公入账金额 - 已开票金额；收款单退款后相应扣减可开票额度 |
| **不接税务** | 本系统只负责流程管理与记录，不调用税务接口、不自动OCR、不自动发邮件 |

### 🔐 系统管理

| 模块 | 功能说明 |
|------|----------|
| **部门管理** | 树形部门结构，支持数据权限范围配置 |
| **角色权限** | 菜单级 + 按钮级权限控制，预置超级管理员、财务、商务等角色 |
| **用户管理** | 用户CRUD、重置密码、分配角色、部门归属、手机号/邮箱 |
| **修改密码** | 用户自助修改密码，验证旧密码，bcrypt加密存储 |

---

## 技术架构

### 技术栈

```
┌─────────────────────────────────────────────────────────┐
│                        前端层                             │
│  Next.js 15 + React 19 + TypeScript + Ant Design 5     │
│  Tailwind CSS 4 + 液态玻璃UI风格                         │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTPS / REST API
┌──────────────────────────▼──────────────────────────────┐
│                        后端层                             │
│  NestJS 11 + TypeScript + Passport JWT + class-validator│
│  全局异常过滤器 + CORS 配置 + 业务单号生成工具            │
└──────────────────────────┬──────────────────────────────┘
                           │ Prisma 6 ORM
┌──────────────────────────▼──────────────────────────────┐
│                       数据层                              │
│  PostgreSQL 16 + Docker 容器化部署                        │
└─────────────────────────────────────────────────────────┘
```

### 核心设计原则

- **金额精确性**：所有金额使用 PostgreSQL `NUMERIC(20,2)` + Prisma `Decimal`，禁止使用 JS 浮点数参与最终财务计算
- **流水不可篡改**：正式流水不可修改、不可删除，纠错必须通过反向流水或调整单据完成
- **服务端权限校验**：所有接口执行 JWT 认证 + 服务端权限校验 + 组织数据范围隔离，不依赖前端隐藏入口
- **快照机制**：发票任务创建时快照保存客户开票信息，后续客户资料变更不影响历史任务

---

## 项目结构

```
agent-finance/
├── backend/                          # 后端 NestJS
│   ├── src/
│   │   ├── auth/                     # 认证模块（JWT登录、修改密码）
│   │   ├── business/                 # 核心业务模块
│   │   │   ├── customer.*            # 客户管理
│   │   │   ├── customer-wallet.*     # 客户钱包
│   │   │   ├── promotion-account.*   # 推广账户
│   │   │   ├── bank-transaction.*    # 银行流水
│   │   │   ├── receive-record.*       # 收款记录
│   │   │   ├── invoice-task.*         # 发票任务
│   │   │   ├── invoice-profile.*      # 客户开票信息
│   │   │   └── ...
│   │   ├── business-ext/             # 业务扩展模块
│   │   │   ├── customer-contract.*   # 客户合同
│   │   │   ├── payment-account.*     # 打款账户
│   │   │   ├── service-fee-config.*  # 服务费配置
│   │   │   ├── policy-change.*        # 政策变更
│   │   │   └── receive-refund.*       # 收款单退款
│   │   ├── system/                   # 系统管理模块
│   │   │   ├── department.*           # 部门管理
│   │   │   ├── role.*                 # 角色权限
│   │   │   └── user.*                 # 用户管理
│   │   ├── cashflow/                 # 资金流水
│   │   ├── rebate/                   # 返点政策
│   │   ├── consumption/              # 消耗分析
│   │   ├── channel/                  # 渠道/端口管理
│   │   ├── common/                   # 公共模块
│   │   │   ├── filters/               # 全局异常过滤器
│   │   │   └── utils/business-no.ts  # 业务单号生成
│   │   └── prisma/                   # Prisma 客户端
│   ├── prisma/
│   │   └── schema.prisma             # 数据库模型定义
│   └── test/                         # 测试文件
├── frontend/                         # 前端 Next.js
│   └── app/
│       ├── page.tsx                  # 主应用（一二级菜单 + 内容框架）
│       ├── layout.tsx                # 根布局
│       ├── globals.css               # 全局样式（液态玻璃风格）
│       ├── login/                    # 登录页
│       ├── customers/                # 客户管理
│       ├── customer-wallets/         # 客户钱包
│       ├── customer-contracts/       # 客户合同
│       ├── promotion-accounts/       # 推广账户
│       ├── receiving/                # 收款管理
│       ├── receive-refunds/          # 收款单退款
│       ├── invoices/                 # 发票管理
│       ├── rebates/                  # 返点政策
│       ├── financial-adjustments/    # 财务调整
│       ├── service-fee-reconciliation/ # 服务费对账
│       ├── settlements/              # 结算管理
│       ├── service-orders/           # 服务订单
│       ├── consumption/              # 消耗分析
│       ├── suppliers/                # 供应商管理
│       ├── purchase-orders/          # 外采订单
│       ├── system/                   # 系统管理
│       ├── settings/                 # 个人设置
│       ├── components/               # 公共组件
│       └── utils/api.ts              # API 请求统一封装
├── services/
│   └── ocr-service/                  # 发票OCR辅助服务（PaddleOCR，可选）
├── docker-compose.yml                # PostgreSQL 容器编排
├── ecosystem.config.js               # PM2 进程配置
└── README.md
```

---

## 快速开始

### 环境要求

| 依赖 | 版本要求 |
|------|----------|
| Node.js | >= 20 |
| npm | >= 9 |
| PostgreSQL | >= 14（或使用 Docker） |
| 操作系统 | Linux / macOS / Windows |

### 1. 启动数据库

```bash
# 使用 Docker 启动 PostgreSQL
docker compose up -d postgres
```

### 2. 启动后端

```bash
cd backend

# 安装依赖
npm install

# 生成 Prisma Client
npm run prisma:generate

# 执行数据库迁移
npm run prisma:migrate

# 初始化种子数据（默认管理员账号）
npm run prisma:seed

# 启动开发服务器
npm run start:dev
```

后端运行在 `http://localhost:3001`

### 3. 启动前端

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端运行在 `http://localhost:3000`

### 默认登录账号

```
用户名：admin
密码：Admin@123456
```

> ⚠️ **重要**：上线前必须修改默认密码，并配置强 JWT Secret。

---

## 环境配置

### 后端环境变量（backend/.env）

```env
# ========== 数据库 ==========
DATABASE_URL="postgresql://finance:your_password@localhost:5432/agent_finance?schema=public"

# ========== JWT 认证 ==========
JWT_SECRET="your-strong-jwt-secret-key-please-change-in-production"
JWT_EXPIRES_IN="7d"

# ========== 服务端口 ==========
PORT=3001

# ========== CORS 跨域 ==========
# 可选，限制允许的域名，多个用逗号分隔；不配置则允许所有来源
CORS_ORIGINS="http://localhost:3000,https://your-domain.com"

# ========== OCR 服务（可选） ==========
OCR_SERVICE_URL="http://localhost:8000"
```

### 前端环境变量（frontend/.env）

```env
# 后端 API 地址
NEXT_PUBLIC_API_URL="http://localhost:3001/api"
```

---

## 业务规则

### 💰 金额计算规则

- **价内返点公式**（推广账户充值）：
  ```
  打款金额 = 充值金额 ÷ (1 + 客户返点%)
  代理商成本 = 充值金额 ÷ (1 + 成本返点%)
  利润 = 打款金额 - 代理商成本 - 额外费用 - 运营费用
  ```

- **金额精度**：所有金额使用 `NUMERIC(20,2)`，最终金额保留两位小数并四舍五入
- **禁止浮点**：禁止使用 JavaScript 浮点数参与最终财务金额计算

### 🧾 发票额度规则

```
可开票金额 = 对公入账金额 - 已开票金额
```

- 对公入账自动生成发票任务，对私入账不生成
- 服务费算额外收入，对公需开票、对私不开票
- 收款单部分退款后，退款部分不再需要开票，剩余部分仍需开票
- 发票任务创建时快照保存客户开票信息，后续客户资料变更不影响历史任务

### 🔐 数据权限规则

- **部门级隔离**：A部门用户看不到B部门的客户、收款、发票等数据
- **角色级按钮权限**：财务、商务等角色拥有不同的操作权限
- **服务端校验**：所有接口在服务端进行权限校验，不依赖前端隐藏入口
- **超级管理员**：拥有全部权限，不受数据范围限制

### 🏦 钱包变动规则

- 账户余额只能通过正式流水变更：
  - 人民币资金 → `Transaction`
  - 推广账户币 → `PromotionTransaction`
  - 客户钱包 → `CustomerWalletTransaction`
- 正式流水不可修改、不可删除
- 纠错必须通过反向流水或调整单据完成

---

## API 概览

### 认证接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 用户登录 |
| POST | `/api/auth/change-password` | 修改密码 |

### 客户相关

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/customers` | 客户列表 / 创建客户 |
| GET/PUT/DELETE | `/api/customers/:id` | 客户详情 / 修改 / 删除 |
| GET/POST | `/api/customers/:id/invoice-profiles` | 客户开票信息 |
| GET/POST | `/api/customer-wallets` | 客户钱包 |
| POST | `/api/customer-wallets/:id/credit` | 钱包充值 |
| POST | `/api/customer-wallets/:id/refund` | 钱包退款 |
| POST | `/api/customer-wallets/:id/advance/repay` | 垫款还款 |
| POST | `/api/customer-wallets/:id/advance/waive` | 垫款豁免 |

### 收款相关

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/bank-transactions` | 银行流水 |
| POST | `/api/bank-transactions/:id/match` | 匹配客户 |
| GET/POST | `/api/receive-records` | 收款记录 |
| POST | `/api/receive-records/:id/confirm` | 确认入账 |
| GET/POST | `/api/receive-refunds` | 收款单退款 |
| POST | `/api/receive-refunds/:id/approve` | 审批退款 |
| POST | `/api/receive-refunds/:id/execute` | 执行退款 |

### 发票相关

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/invoice-tasks` | 发票任务列表 / 创建 |
| POST | `/api/invoice-tasks/:id/submit` | 提交审核 |
| POST | `/api/invoice-tasks/:id/approve` | 审核通过 |
| POST | `/api/invoice-tasks/:id/reject` | 审核驳回 |
| POST | `/api/invoice-tasks/:id/revoke` | 撤回 |
| POST | `/api/invoice-tasks/:id/complete` | 完成开票 |

### 系统管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/departments` | 部门管理 |
| GET/POST | `/api/roles` | 角色管理 |
| PUT | `/api/roles/:id/permissions` | 分配权限 |
| GET/POST | `/api/users` | 用户管理 |
| PUT | `/api/users/:id/password` | 重置密码 |

> 完整 API 文档请启动后端后访问 `http://localhost:3001/api`（如配置了 Swagger）

---

## 部署指南

### 生产环境架构

```
                    ┌──────────────┐
                    │   用户浏览器   │
                    └──────┬───────┘
                           │ HTTPS :443
                    ┌──────▼───────┐
                    │    Nginx     │  SSL 终止 + 反向代理 + 静态缓存
                    └──┬────────┬──┘
                       │        │
              /api     │        │  /
          ┌────────────▼┐  ┌───▼─────────────┐
          │  后端 NestJS  │  │  前端 Next.js    │
          │  (PM2, :3001) │  │  (PM2, :3003)    │
          └──────┬────────┘  └──────────────────┘
                 │ Prisma
          ┌──────▼────────┐
          │  PostgreSQL 16  │  (Docker, :5432)
          └─────────────────┘
```

### 部署步骤

#### 1. 克隆代码

```bash
git clone https://github.com/liuliu61/Private-Repository.git
cd Private-Repository
```

#### 2. 安装依赖并构建

```bash
# 后端
cd backend
npm install
npm run build

# 前端
cd ../frontend
npm install
npm run build
```

#### 3. 配置环境变量

```bash
# 后端配置
cp backend/.env.example backend/.env
vim backend/.env  # 修改数据库密码、JWT Secret 等

# 前端配置
cp frontend/.env.example frontend/.env
vim frontend/.env  # 修改 API 地址
```

#### 4. 数据库迁移

```bash
cd backend
npx prisma migrate deploy
npx prisma db seed
```

#### 5. PM2 启动

```bash
# 在项目根目录
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # 开机自启
```

#### 6. Nginx 配置

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # 前端
    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 后端 API
    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 安全建议

### 上线前必做

- [ ] **修改默认 admin 密码**，使用强密码
- [ ] **配置强 JWT Secret**，使用随机字符串
- [ ] **数据库只监听本地**，配置 `bind-address=127.0.0.1`
- [ ] **SSH 禁用密码登录**，只允许密钥登录
- [ ] **配置防火墙**，只开放 80/443 端口，SSH 端口改为非默认
- [ ] **生产环境密钥不进入 Git**，使用环境变量或受保护的配置文件
- [ ] **定期检查 Docker 容器**，防止恶意容器植入挖矿程序
- [ ] **配置 fail2ban**，防止暴力破解
- [ ] **定期备份数据库**，配置自动备份策略
- [ ] **Nginx 配置 SSL**，使用 HTTPS，禁用不安全的 TLS 版本

### 服务器安全事件记录

本项目部署过程中曾遭遇服务器入侵，攻击者通过 Docker 植入 `sys-helper` 容器运行 XMRig 挖矿程序。已完成全面清理：

- 停止并删除恶意 Docker 容器及镜像
- 清理 `/tmp` 下的挖矿文件
- 封锁恶意 IP（158.220.105.179、85.215.219.126、138.197.174.121）
- 清理 rootkit（`/etc/ld.so.preload`）、后门用户、恶意 crontab

> 建议部署后定期执行 `docker ps -a` 检查容器，确保没有未知容器运行。

---

## 开发规范

### Git 分支规范

- `main`：稳定主分支，生产发布基线，禁止直接提交
- `feature/xxx`：功能开发分支
- `fix/xxx`：Bug 修复分支
- 每个独立任务从最新 `main` 创建分支，完成后通过 PR 合并

### Commit Message 规范

```
feat: 新功能
fix: 修复bug
docs: 文档更新
style: 代码格式（不影响功能）
refactor: 重构
perf: 性能优化
test: 测试相关
chore: 构建/工具/依赖相关
```

示例：
```
feat: implement recharge payment workflow
fix: correct receiving wallet posting
docs: update business rules
```

### 代码规范

- 财务规则不猜测，不确定时标注"待确认"并向产品确认
- 生产数据库变更必须通过 Prisma Migration，禁止使用 `db push`
- 密钥、密码、Token 不得提交到 Git
- 一个 commit 尽量只对应一个逻辑任务，不要混进无关的格式化或临时文件
- 不允许对 `main` 强制推送（force push）

---

## 许可证

本项目为私有项目，未经授权不得用于商业用途。

---

## 联系方式

如有问题或建议，请通过 Issue 反馈。

---

> **最后更新**：2026-10-08
