# 代理商财务系统（Agent Finance System）

面向广告代理行业的全链路资金管理、返点结算与发票管理系统。覆盖从银行流水入账、客户钱包、推广账户充值、返点政策、服务费对账到发票开具的完整业务闭环。

> 本项目为独立实现，参考行业主流系统的业务规则，不依赖任何第三方商业系统代码。

---

## ✨ 核心特性

### 💰 资金管理
- **银行流水管理**：支持手工录入、文件导入、接口同步，自动匹配客户付款账户
- **收款确认入账**：对公/对私拆分入账，对公自动生成发票任务，对私不进入发票管理
- **收款单退款**：支持部分退款审批流程，退款后收款单状态不变，退款金额不超过已入账金额
- **客户钱包**：财务V钱包、外采钱包，支持充值、退款、调整、期初、授信、垫款
- **推广账户充值**：支持客户钱包扣款，价内返点自动计算打款金额与利润
- **资金流水**：整合资金账户、客户钱包、推广账户三类流水，统一视图

### 📊 业务运营
- **服务订单**：订单全生命周期管理
- **消耗分析**：推广消耗数据统计与经分
- **服务费对账**：服务费自动扣除入账，对公需开票、对私不开票
- **客户结算 / 一级代理结算**：多级代理结算体系

### 🧾 发票管理
- **发票任务全流程**：待开票 → 审核中 → 待完成开票 → 已完成
- **客户多开票信息**：一个客户可维护多条开票抬头，任务创建时快照保存
- **人工完成开票**：手工记录实际发票号码、代码、日期、金额，支持附件上传
- **不接入税务系统**：本系统只负责流程管理与记录，不调用税务接口、不自动发邮件

### 👥 客户中心
- **客户管理**：客户基础信息、部门数据权限隔离
- **客户合同**：合同审批流程、到期提醒、一个客户多合同、附件上传
- **客户打款账户**：一个客户绑定多个付款账户，银行流水自动匹配后人工确认
- **推广账户管理**：客户推广平台账号管理，支持充值/退款与钱包联动
- **返点政策**：客户返点政策三维度配置，政策变更审批流程，审批后立即生效
- **端口管理**：自定义端口与对公/对私双返点政策，充值选端口自动带出成本点

### 🔐 系统管理
- **部门管理**：树形部门结构，支持数据权限（A部门看不到B部门客户）
- **角色权限**：菜单级 + 按钮级权限控制，预置财务、商务等角色
- **用户管理**：用户CRUD、重置密码、分配角色、部门归属
- **修改密码**：用户自助修改密码

---

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Next.js 15 + React 19 + TypeScript |
| UI 组件 | Ant Design 5 + Tailwind CSS 4 |
| 后端框架 | NestJS 11 + TypeScript |
| 认证 | Passport JWT + bcrypt |
| 数据库 | PostgreSQL 16 |
| ORM | Prisma 6 |
| 进程管理 | PM2 |
| Web 服务器 | Nginx |
| 容器化 | Docker（PostgreSQL） |

---

## 📁 项目结构

```
agent-finance/
├── backend/                    # 后端 NestJS
│   ├── src/
│   │   ├── auth/               # 认证（JWT登录、修改密码）
│   │   ├── business/           # 核心业务（客户、收款、发票、钱包等）
│   │   ├── business-ext/       # 业务扩展（合同、打款账户、退款、政策变更）
│   │   ├── system/             # 系统管理（部门、角色、用户）
│   │   ├── cashflow/           # 资金流水
│   │   ├── rebate/             # 返点政策
│   │   ├── consumption/        # 消耗分析
│   │   ├── channel/            # 渠道管理
│   │   ├── common/             # 公共模块（异常过滤器、工具函数）
│   │   └── prisma/             # Prisma Schema
│   └── prisma/schema.prisma    # 数据库模型定义
├── frontend/                   # 前端 Next.js
│   └── app/
│       ├── page.tsx            # 主应用（菜单+内容框架）
│       ├── login/              # 登录页
│       ├── customers/          # 客户管理
│       ├── customer-wallets/   # 客户钱包
│       ├── customer-contracts/ # 客户合同
│       ├── promotion-accounts/ # 推广账户
│       ├── receiving/          # 收款管理
│       ├── receive-refunds/    # 收款单退款
│       ├── invoices/           # 发票管理
│       ├── rebates/            # 返点政策
│       ├── financial-adjustments/ # 财务调整
│       ├── service-fee-reconciliation/ # 服务费对账
│       ├── system/             # 系统管理
│       ├── components/         # 公共组件
│       └── utils/api.ts        # API 请求工具
├── services/
│   └── ocr-service/            # 发票OCR辅助服务（PaddleOCR，可选）
└── docker-compose.yml          # PostgreSQL 容器编排
```

---

## 🚀 快速开始

### 环境要求

- Node.js >= 20
- PostgreSQL >= 14（或使用 Docker）
- npm >= 9

### 1. 启动数据库

```bash
docker compose up -d postgres
```

### 2. 后端启动

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run start:dev
```

后端运行在 `http://localhost:3001`

### 3. 前端启动

```bash
cd frontend
npm install
npm run dev
```

前端运行在 `http://localhost:3000`

### 默认账号

```
用户名：admin
密码：Admin@123456
```

> ⚠️ 上线前必须修改默认密码。

---

## ⚙️ 环境变量配置

### 后端（backend/.env）

```env
# 数据库
DATABASE_URL="postgresql://finance:password@localhost:5432/agent_finance?schema=public"

# JWT
JWT_SECRET="your-jwt-secret-key"
JWT_EXPIRES_IN="7d"

# 端口
PORT=3001

# CORS（可选，限制允许的域名）
CORS_ORIGINS="http://localhost:3000,https://your-domain.com"

# OCR 服务（可选）
OCR_SERVICE_URL="http://localhost:8000"
```

### 前端（frontend/.env）

```env
NEXT_PUBLIC_API_URL="http://localhost:3001/api"
```

---

## 📐 核心业务规则

### 金额计算
- 所有金额使用 PostgreSQL `NUMERIC(20,2)`，禁止使用 JavaScript 浮点数参与最终财务计算
- 价内返点公式：`打款金额 = 充值金额 ÷ (1 + 客户返点%)`，`代理商成本 = 充值金额 ÷ (1 + 成本返点%)`
- 利润 = 打款金额 - 代理商成本 - 额外费用 - 运营费用

### 发票额度
- 可开票金额 = 对公入账金额 - 已开票金额
- 服务费算额外收入，对公需开票、对私不开票
- 收款单部分退款后，退款部分不再需要开票，剩余部分仍需开票

### 数据权限
- 部门级数据隔离：A部门用户看不到B部门客户
- 角色级按钮权限：财务、商务等角色拥有不同操作权限
- 所有接口服务端校验，不依赖前端隐藏入口

---

## 🔌 主要 API 接口

### 认证
- `POST /api/auth/login` - 登录
- `POST /api/auth/change-password` - 修改密码

### 客户
- `GET/POST /api/customers` - 客户列表/创建
- `GET/PUT/DELETE /api/customers/:id` - 客户详情/修改/删除

### 收款
- `GET/POST /api/bank-transactions` - 银行流水
- `POST /api/bank-transactions/:id/match` - 匹配客户
- `POST /api/receive-records/:id/confirm` - 确认入账

### 发票
- `GET/POST /api/invoice-tasks` - 发票任务列表/创建
- `POST /api/invoice-tasks/:id/submit|approve|reject|revoke|complete` - 任务流程

### 系统管理
- `GET/POST /api/departments` - 部门管理
- `GET/POST /api/roles` - 角色管理
- `GET/POST /api/users` - 用户管理

---

## 📦 部署指南

### 生产环境架构

```
用户 → Nginx（443/SSL）→ 前端 Next.js（PM2, :3003）
                           → 后端 NestJS（PM2, :3001）→ PostgreSQL（Docker, :5432）
```

### 部署步骤

1. **克隆代码**
```bash
git clone https://github.com/liuliu61/Private-Repository.git
cd Private-Repository
```

2. **安装依赖并构建**
```bash
cd backend && npm install && npm run build
cd ../frontend && npm install && npm run build
```

3. **数据库迁移**
```bash
cd backend
npx prisma migrate deploy
npx prisma db seed
```

4. **PM2 启动**
```bash
pm2 start ecosystem.config.js
```

5. **Nginx 配置反向代理**
- `/` → 前端 `http://127.0.0.1:3003`
- `/api` → 后端 `http://127.0.0.1:3001`

---

## 🔒 安全建议

- [ ] 修改默认 admin 密码
- [ ] 配置强 JWT Secret
- [ ] 数据库只监听本地（bind-address=127.0.0.1）
- [ ] SSH 禁用密码登录，只允许密钥登录
- [ ] 配置防火墙，只开放 80/443 端口
- [ ] 定期检查 Docker 容器，防止恶意容器植入
- [ ] 生产环境密钥不进入 Git，使用环境变量

---

## 📄 许可证

本项目为私有项目，未经授权不得用于商业用途。

---

## 🤝 开发规范

- 每个独立功能从 `main` 创建 `feature/xxx` 分支
- Commit Message 格式：`feat: xxx` / `fix: xxx` / `docs: xxx`
- 财务规则不猜测，不确定时标注"待确认"
- 生产数据库变更必须通过 Prisma Migration
- 密钥、密码、Token 不得提交到 Git
