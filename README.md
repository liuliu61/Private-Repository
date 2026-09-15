# 个人渠道记账 / 代理商财务记账与返点结算系统

面向广告代理行业的资金管理、返点与结算系统。本项目为独立实现，不直接修改“灵犀引擎”原系统代码。

## 技术栈

当前实际使用（未在下方列出的技术，请勿在文档或代码注释中宣称使用）：

- 前端：Next.js 15、React 19、TypeScript、Ant Design 5、Tailwind CSS 4
- 后端：NestJS 11、TypeScript、Passport JWT、class-validator、bcrypt
- 数据库：PostgreSQL
- ORM：Prisma 6（`@prisma/client`、`prisma`）
- 包管理：npm。根目录 `package.json` 使用 `npm --prefix backend/frontend` 脚本；仓库当前未提交 lockfile，也未配置 pnpm workspace

## 正式开发目录

```text
D:\Documents\个人渠道记账
```

`D:\agent-finance-system` 是历史临时副本，不再作为正式开发目录。所有后端、前端、Prisma schema、migration、DTO、Service、Controller、测试、README 和配置都在中文正式目录中修改。

## GitHub 主仓库

```text
https://github.com/liuliu61/Private-Repository.git
```

`main` 为当前代码主基线。分支与提交规范见「Git 开发规范」。

## 本地启动

```text
cd D:\Documents\个人渠道记账
docker compose up -d postgres
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run start:dev
```

另开终端启动前端：

```text
cd D:\Documents\个人渠道记账\frontend
npm install
npm run dev
```

前端地址 `http://localhost:3000`，后端地址 `http://localhost:3001`。初始化账号 `admin / Admin@123456` 为开发默认值，上线前必须更换。

## 金额与数据约定

- 金额使用 PostgreSQL `NUMERIC(20,2)` 与 Prisma `Decimal`，返点比例使用 `NUMERIC(10,4)`。
- 禁止使用 JavaScript 浮点数参与最终财务金额计算；最终金额保留两位小数并四舍五入。
- 账户余额只能通过正式流水变更：人民币资金走 `Transaction`，账户币走 `PromotionTransaction`，钱包调整走 `CustomerWalletTransaction`。
- 正式流水不可修改、不可删除；纠错必须通过反向流水或调整单据完成。
- 历史 `Voucher` / `VoucherEntry` 模型保留，但不参与当前资金业务。

## 当前开发状态

### 已具备的核心能力

- 登录与权限基础（JWT + 角色 / 权限）
- 组织与数据隔离基础（组织树、服务端数据范围校验）
- 客户 / 供应商基础
- 返点政策及版本快照（客户返点政策、供应商成本返点政策、`PolicyResolverService`）
- 外采订单基础（草稿 → 待确认 → 已确认 → 已结算 / 已取消）
- 资金流水（CNY `Transaction`）
- 客户钱包基础（`FINANCE_V` 与 `EXTERNAL_PROCUREMENT` 两类钱包）
- 收款 / 银行流水基础
- 入账
- 服务费明细
- 退款
- 发票基础
- 财务对账基础
- 审计基础

### 部分完成 / 待后续真实业务规则确认

以下内容尚未完成真实业务规则验证，不得在文档或代码中被描述为“已完整实现”：

- 外采订单“草稿修改”后的完整反向钱包流水：部分完成
- 外采订单“删除”后的完整反向钱包流水：部分完成
- 伙伴钱包人工调整：待确认
- 伙伴独立钱包明细页面：待确认
- 充值付款完整资金执行链路：待确认
- 发票实际上传完成链路：部分完成
- 红字发票 / 作废的完整真实业务流程：待确认
- 银行交易“忽略”操作接口、银行接口自动同步、自动候选匹配：待确认

## 已核对的关键业务规则

以下规则来自已完成的页面 / 接口真实实测采集，优先级高于旧设计说明。

### 收款

银行流水“保存”不会立即生成收款记录。正确流程为：

```text
银行流水保存
→ 状态“确认中”
→ 点击“确认到账”
→ 生成收款记录
```

收款记录初始状态为：入账状态“未入账”、已入账金额 `0`、开票状态“未开票”。收款记录的客户归属来自银行流水绑定的客户，收款记录本身没有“修改客户”入口。

### 入账

入账时必须在同一个数据库事务内原子更新：

- 收款记录
- 公司资金流水
- 财务 V 钱包
- 开票额度
- 入账记录（`ReceivePosting`）

钱包金额与可开票金额必须使用两个独立口径，不得复用同一个字段：

```text
walletCreditAmount    = paymentAmount - serviceFeeAmount
invoiceEligibleAmount = paymentAmount
```

即钱包实际增加金额需扣除服务费，开票额度按付款全额计算。这是当前实测得到的原系统行为，不要擅自修改。

### 服务费

- 入账服务费来自收款入账时人工添加的服务费明细（`ReceiveServiceFee`）。
- 服务费配置只用于业务提示，不会自动按客户政策计算，也不因存在配置而自动填充。
- 入账弹窗默认服务费为 `0`，只有操作人员主动添加才产生服务费。
- 服务费对账以收款单 / 银行流水为数据来源，不以订单运营费作为主要来源。

### 退款

- 可退款金额上限 = 已入账 V 钱包金额（`postedAmount`），不是原始银行流水金额。
- 例：交易 `30000`、服务费 `2000`、已入账 `28000`，则最多只能退 `28000`；退 `29000` 必须由后端拒绝，并提示“可退款金额不足”。
- 退款成功时同时：客户 V 钱包减少退款金额、收款记录已入账金额减少、收款记录退款金额增加、生成退款记录。
- 即使全部退款导致已入账金额为 `0`，收款记录的入账状态仍保持“已入账”，不会自动改回“未入账”。

### 钱包

必须严格区分两类客户钱包：

- `FINANCE_V`：财务 V 钱包，用于收款入账、红冲蓝补、授信、垫款、退款
- `EXTERNAL_PROCUREMENT`：外采钱包，用于外采订单

两者是独立余额，同一客户的两个余额互不影响，不得聚合成一个总余额，也不能依赖页面名称区分。外采业务不能误扣财务 V 钱包。

### 外采订单计算

已确认的计算规则：

```text
customerCash = coinAmount / (1 + customerPolicyRate)
supplierCash = coinAmount / (1 + supplierPolicyRate)
grossProfit  = supplierCash - customerCash
```

例：充值币 `10000`，客户政策 10%，伙伴政策 5%，则客户现金 `9090.91`、伙伴现金 `9523.81`、毛利 `432.90`。

- 客户返点与伙伴成本返点是两套独立政策，禁止用 `客户比例 - 伙伴比例` 直接计算利润。
- 利润必须来源于真实资金金额：客户实际收入减伙伴实际成本，再减实际费用。
- 外采客户钱包属于独立外采钱包；伙伴使用独立 CNY 钱包 / 账户体系，不与财务 V 钱包混用。
- 订单保存客户与伙伴的政策、比例、计算方向和金额快照，历史订单不随政策变化漂移。

## 业务规则来源

本项目不是直接修改“灵犀引擎”原系统代码，而是独立从零实现。真实业务行为以已完成的页面 / 接口实测采集结果为最高优先级。发生冲突时优先级如下：

1. 最新真实实测结果
2. 已确认的业务规则采集文档
3. 当前代码实现
4. README / 旧设计说明

README 不是业务规则的唯一来源，不能用来推翻实测结论。遇到未确认的财务规则时应标注“待确认”，不得自行猜测或为了跑通代码而发明规则。

## 已提供接口

除登录接口外，业务接口均要求 `Authorization: Bearer <JWT>`。

### 认证与基础

- `POST /api/auth/login`：登录并返回 JWT。
- `GET /api/dashboard`、`GET /api/audit-logs`：工作台统计与审计日志。
- `GET/POST /api/organizations`、`POST /api/organizations/assign-user`：组织与数据范围。
- `GET/POST /api/accounts`、`GET /api/accounts/:id/balance`、`GET /api/accounts/:id/balance/check`：资金账户与余额校验。
- `POST /api/transactions`、`GET /api/transactions`：创建和查询资金流水。

### 客户、供应商与政策

- `GET/POST /api/customers`、`GET/POST /api/suppliers`：客户与外采伙伴。
- `GET /api/customers/:customerId/rebate-policy`、`GET/POST /api/customers/:customerId/rebate-policies`、`POST /api/customers/:customerId/rebate-policies/:id/disable`：客户返点政策。
- `GET /api/suppliers/:supplierId/rebate-policy`、`GET/POST /api/suppliers/:supplierId/rebate-policies`、`POST /api/suppliers/:supplierId/rebate-policies/:id/disable`：供应商成本返点政策。
- `GET/POST /api/ad-subjects`、`GET/POST /api/ad-accounts`：广告主体与广告账户。
- `GET/POST /api/suppliers/:supplierId/accounts`：一级代理商资金账户。
- `GET/POST /api/customers/:customerId/promotion-accounts`、`GET/POST /api/suppliers/:supplierId/promotion-accounts`：账户币推广账户。

### 返点计算

- `GET/POST /api/rebate-rules`、`POST /api/rebates/calculate`：返点规则与 Decimal 计算。
- `POST /api/rebates/:id/confirm`：确认返点并原子生成 `REBATE` 流水。

### 外采订单

- `GET/POST /api/purchase-orders`、`GET /api/purchase-orders/:id`：外采订单。
- `POST /api/purchase-orders/import/validate`：导入校验。
- `POST /api/purchase-orders/:id/submit|confirm|cancel|settle`：订单状态流转。
- `POST /api/purchase-orders/:id/customer-payment`、`POST /api/purchase-orders/:id/supplier-payment`：实际客户收款与一级代理付款。
- `POST /api/purchase-orders/:id/customer-credit`：确认客户账户币到账。
- `GET /api/sourcing/setting`、`POST /api/sourcing/setting`：外采“使用客户钱包”等配置。

### 收款管理

- `GET /api/bank-transactions`、`GET /api/bank-transactions/:id`：查询银行交易。
- `POST /api/bank-transactions/import`：批量导入银行原始交易，按账户和原始交易编号幂等。
- `POST /api/bank-transactions/:id/confirm`：确认到账并生成收款记录。
- `POST /api/bank-transactions/:id/match`、`POST /api/bank-transactions/:id/unmatch`：匹配或取消匹配客户 / 订单。
- `GET /api/receive-records`、`GET /api/receive-records/:id`：查询收款记录。
- `POST /api/receive-records`：根据已确认到账的银行交易创建收款记录。
- `POST /api/receive-records/:id/confirm`：收款入账，原子更新收款记录、资金流水、V 钱包、开票额度和入账记录。
- `POST /api/receive-records/:id/refund`：按已入账 V 钱包金额发起退款。

### 客户钱包

- `GET/POST /api/customer-wallets`、`GET /api/customer-wallets/:id`：查询和创建客户钱包。
- `GET /api/customer-wallets/:id/transactions`：钱包明细。
- `GET /api/customer-wallets/:id/balance/check`：校验钱包余额与流水是否一致。
- `POST /api/customer-wallets/:id/opening-balance`：录入期初余额并生成期初流水。
- `POST /api/customer-wallets/:id/adjust`：红冲、蓝补或手工调整。
- `POST /api/customer-wallets/:id/credit`、`POST /api/customer-wallets/:id/advance`：维护授信与垫款配置并记录审计。

### 退款

- `POST /api/purchase-orders/:id/refunds`、`GET /api/purchase-orders/:id/refunds`：订单退款申请与查询。
- `GET /api/refunds`、`GET /api/refunds/:id`：退款列表与详情。
- `POST /api/refunds/:id/approve|reject|execute`：退款审批与执行。

### 结算

- `GET/POST /api/settlements`、`POST /api/settlements/:id/confirm`：通用结算单。
- `GET/POST /api/customer-settlements`、`POST /api/customer-settlements/generate`、`POST /api/customer-settlements/:id/confirm|cancel`：客户结算。
- `GET/POST /api/supplier-settlements`、`POST /api/supplier-settlements/generate`、`POST /api/supplier-settlements/:id/confirm|cancel`：一级代理结算。

### 对账与调整

- `GET /api/reconciliations`、`GET /api/reconciliations/:id`、`POST /api/reconciliations/generate`、`POST /api/reconciliations/:id/check|confirm`：财务对账中心。
- `POST /api/reconciliations/preview`、`POST /api/reconciliations`、`POST /api/reconciliations/:id/complete`：业务对账。
- `GET/POST /api/financial-adjustments`、`GET /api/financial-adjustments/:id`、`POST /api/financial-adjustments/:id/approve|reject|execute`：财务调整中心。

### 发票

- `GET /api/invoices`、`GET /api/invoices/:id`：发票列表与详情。
- `POST /api/invoices`、`POST /api/invoices/:id`：创建发票草稿与修改草稿非核心信息。
- `POST /api/invoices/:id/process|confirm|void`：提交开票中、确认开票、作废。
- `GET /api/customers/:customerId/invoice-balance`：客户业务来源金额、已开票金额和未开票金额。

### 财务核算与服务费对账

- `GET /api/finance/overview`：公司 CNY 账户概览。
- `GET /api/finance/customers/:customerId`、`GET /api/finance/suppliers/:supplierId`：客户 / 一级代理资金概览。
- `GET /api/finance/orders/profit`：订单实际收入、成本、运营费和利润汇总。
- `GET /api/service-fee-reconciliation`、`GET /api/service-fee-reconciliation/:id`、`GET /api/service-fee-reconciliation/export`：服务费对账查询、详情与导出。

## 权限与组织隔离

- 所有业务接口执行 JWT 认证、服务端权限校验和组织数据范围隔离，不允许仅依赖前端隐藏入口。
- 非超级管理员通过组织树访问本组织及下级组织数据，禁止通过修改 ID 越权访问。
- 返点政策查看使用 `FINANCE_REBATE_VIEW`，新增版本与停用使用 `FINANCE_REBATE_POLICY_EDIT`。
- 财务核算使用 `FINANCE_VIEW`；财务调整使用 `FINANCE_ADJUST_VIEW`、`FINANCE_ADJUST_CREATE`、`FINANCE_ADJUST_APPROVE`、`FINANCE_ADJUST_EXECUTE`。
- 收款管理使用 `FINANCE_BANK_TRANSACTION_VIEW`、`FINANCE_BANK_TRANSACTION_IMPORT`、`FINANCE_BANK_TRANSACTION_MATCH`、`FINANCE_RECEIVE_VIEW`、`FINANCE_RECEIVE_CREATE`、`FINANCE_RECEIVE_CONFIRM`。
- 钱包使用 `FINANCE_WALLET_VIEW`、`FINANCE_WALLET_ADJUST`、`FINANCE_WALLET_OPENING_BALANCE`。
- 发票使用 `FINANCE_INVOICE_VIEW`、`FINANCE_INVOICE_CREATE`、`FINANCE_INVOICE_EDIT`、`FINANCE_INVOICE_CONFIRM`、`FINANCE_INVOICE_VOID`。
- 结算使用 `FINANCE_SETTLEMENT_VIEW`、`FINANCE_SETTLEMENT_CREATE`、`FINANCE_SETTLEMENT_CONFIRM`、`FINANCE_SETTLEMENT_CANCEL`。
- 对账使用 `FINANCE_RECONCILIATION_VIEW`、`FINANCE_RECONCILIATION_CREATE`、`FINANCE_RECONCILIATION_CONFIRM`。
- 外采订单使用 `PROCUREMENT_VIEW`、`PROCUREMENT_CREATE`、`PROCUREMENT_CONFIRM`、`PROCUREMENT_CANCEL`、`PROCUREMENT_SETTLE`。
- 超级管理员拥有全部权限。

## Git 开发规范

1. `main` 作为稳定主分支。
2. 新功能不要长期直接开发在 `main`。
3. 每个独立任务创建独立分支，命名建议 `feature/<功能名>`，例如 `feature/recharge-payment`。
4. Bug 修复使用 `fix/<问题名>`。
5. 每完成一个独立任务必须提交 commit。
6. commit message 使用清晰、可追踪的英文格式，例如：
   - `feat: implement recharge payment workflow`
   - `fix: correct receiving wallet posting`
   - `test: add receiving business rule tests`
   - `docs: update business rules`
7. 一个 commit 尽量只对应一个逻辑任务。
8. 不要把无关的代码格式化、重构混进业务 commit。
9. 完成任务后先验证，再合并到 `main`。
10. 不允许对 `main` 强制推送（force push）。
11. 不允许修改已发布的历史 commit 来掩盖错误。

## Codex 开发原则

后续每个 Codex 任务：

- 一次只处理一个独立任务
- 开始前先读取现有代码和相关业务规则
- 不允许猜测未确认的财务规则
- 遇到业务规则缺失时必须明确标注“待确认”
- 完成当前任务后停止
- 报告实际修改文件
- 报告测试情况
- 报告数据库 / migration 是否变更
- 报告是否存在未解决问题
- 不得顺手开发下一模块

## 当前未实现

机器人、OCR、广告平台 / 银行接口自动对接、自动充值、生产部署和完整验收联调暂不包含在当前版本。导出能力目前仅服务费对账支持。
