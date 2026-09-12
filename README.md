# 代理商财务记账与返点结算系统

这是一个面向广告代理业务的企业级资金管理系统，采用 Next.js、NestJS、PostgreSQL 和 Prisma 构建。

## 启动

正式开发目录已恢复为中文项目目录：`D:\刘欣\Documents\个人渠道记账`。

```text
cd D:\刘欣\Documents\个人渠道记账
docker compose up -d postgres
cd backend
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
pnpm start:dev
```

另开终端启动前端：

```text
cd D:\刘欣\Documents\个人渠道记账\frontend
pnpm install
pnpm dev
```

前端地址：`http://localhost:3000`；后端地址：`http://localhost:3001`。初始化账号：`admin / Admin@123456`。

## 数据设计

金额统一使用 PostgreSQL `NUMERIC(20,2)` 与 Prisma Decimal，返点比例使用 `NUMERIC(10,4)`。资金账户余额只能通过正式资金流水变更，流水记录变动前余额、变动金额和变动后余额。历史 `Voucher`、`VoucherEntry` 模型保留，但不参与当前资金业务。

当前业务链路：

`业务单据 -> 返点规则快照 -> 资金流水 -> 账户余额 -> 结算/对账`。

政策解析统一由 `PolicyResolverService` 完成。业务时间由业务单据传入，解析结果会保存政策ID、版本ID、返点类型和返点比例快照；后续政策修改不会影响已经保存的业务快照。

返点计算方向与返点类型分开保存。`CASH_TO_CREDIT` 表示人民币换算账户币，公式为 `creditAmount = cashAmount × (1 + rate / 100)`；`CREDIT_TO_CASH` 表示账户币倒推人民币，公式为 `cashAmount = creditAmount ÷ (1 + rate / 100)`。两种方向均使用 Prisma Decimal 并保留两位小数，负返点继续按渠道计算器规则支持。利润统一按实际人民币收入减实际人民币成本和实际费用计算，不使用客户返点率与成本返点率直接相减。

系统严格区分 `CNY` 人民币资金与 `ACCOUNT_CREDIT` 推广账户币。公司 `Account` 继续用于人民币资金；一级代理 `SupplierAccount` 可记录人民币或账户币单位，但单个账户只能有一个单位；客户推广账户使用独立的 `PromotionAccount` 和 `PromotionTransaction`，不能用人民币 `Transaction` 冒充账户币流水。客户实际付款与客户账户币到账分开处理，付款成功不会自动生成账户币到账。

例如目标为 10000 账户币，客户政策为 10% 的 `CREDIT_TO_CASH`，客户现金金额为 `9090.91`；供应商政策为 8% 的 `CREDIT_TO_CASH`，供应商现金成本为 `9259.26`，未计其他费用时真实毛利为 `-168.35`，状态为亏损。外采订单保存客户和供应商的政策版本、返点类型、计算方向、客户现金收入、供应商现金成本、成本比例和真实毛利快照；重新打开订单不会重新解析当前政策。供应商成本金额由 `SupplierCostCalculator` 委托统一返点计算器完成，不把成本优惠金额当成利润。

核心新增模型包括组织与用户组织授权、对账单、客户、供应商、广告主体、广告账户、采购单、结算单和审计日志。非超级管理员通过组织树访问本组织及下级组织数据。

## 已提供接口

- `POST /api/auth/login`：登录并返回 JWT。
- `POST /api/transactions`、`GET /api/transactions`：创建和查询资金流水。
- `GET /api/accounts`、`POST /api/accounts`、`GET /api/accounts/:id/balance`：账户管理和余额读取。
- `GET /api/accounts/:id/balance/check`：校验缓存余额与流水汇总余额。
- `GET/POST /api/rebate-rules`、`POST /api/rebates/calculate`：返点规则与 Decimal 计算。
- `POST /api/rebates/:id/confirm`：确认返点并原子生成 `REBATE` 流水。
- `GET/POST /api/organizations`、`POST /api/organizations/assign-user`：组织及数据范围。
- `GET/POST /api/customers`、`GET/POST /api/suppliers`：客户与外采伙伴。
- `GET /api/customers/:customerId/rebate-policy`：按业务时间查询客户当前有效返点政策。
- `GET /api/customers/:customerId/rebate-policies`：分页查询客户返点政策历史版本。
- `POST /api/customers/:customerId/rebate-policies`：新增客户返点政策版本，不覆盖历史版本。
- `POST /api/customers/:customerId/rebate-policies/:id/disable`：停用客户返点政策。
- `GET /api/purchase-orders`、`GET /api/purchase-orders/:id`：分页查询和查看外采订单。
- `POST /api/purchase-orders`：创建外采订单草稿，并按业务时间保存客户与供应商政策快照。
- `POST /api/purchase-orders/:id/submit`、`POST /api/purchase-orders/:id/confirm`：提交和确认外采订单，不产生资金流水。
- `POST /api/purchase-orders/:id/cancel`、`POST /api/purchase-orders/:id/settle`：取消或标记订单状态，不执行结算金额计算。
- `GET/POST /api/suppliers/:supplierId/accounts`：查询或创建一级代理商的人民币资金账户。
- `POST /api/purchase-orders/:id/customer-payment`：录入客户实际人民币收款，流水类型为 `CUSTOMER_PAYMENT`。
- `POST /api/purchase-orders/:id/supplier-payment`：录入向一级代理商实际人民币付款，同时写入公司账户负流水和一级代理商账户正流水。
- `GET/POST /api/customers/:customerId/promotion-accounts`：查询或创建客户 `ACCOUNT_CREDIT` 推广账户。
- `GET/POST /api/suppliers/:supplierId/promotion-accounts`：查询或创建一级代理商 `ACCOUNT_CREDIT` 推广账户。
- `POST /api/purchase-orders/:id/customer-credit`：确认客户推广账户币到账，支持分批到账、幂等和到账上限校验。
- `GET /api/suppliers/:supplierId/rebate-policy`：按业务时间、平台、主体和账户匹配当前有效供应商成本返点政策。
- `GET /api/suppliers/:supplierId/rebate-policies`：分页查询供应商成本返点政策版本。
- `POST /api/suppliers/:supplierId/rebate-policies`：新增供应商成本返点政策版本，自动递增版本号。
- `POST /api/suppliers/:supplierId/rebate-policies/:id/disable`：停用供应商成本返点政策。
- `GET/POST /api/ad-subjects`、`GET/POST /api/ad-accounts`：广告主体与广告账户。
- `GET/POST /api/settlements`、`POST /api/settlements/:id/confirm`：结算单。
- `POST /api/reconciliations/preview`、`POST /api/reconciliations`、`POST /api/reconciliations/:id/complete`：业务对账。
- `GET /api/dashboard`、`GET /api/audit-logs`：工作台统计和审计日志。
- `GET /api/finance/overview`：公司 CNY 账户今日、本月收入与支出概览。
- `GET /api/finance/customers/:id`：客户累计付款、账户币到账和推广账户余额。
- `GET /api/finance/suppliers/:id`：一级代理 CNY 账户、成本付款和账户币账户概览。
- `GET /api/finance/orders/profit`：订单实际收入、成本、运营费和利润分页汇总。
- `GET/POST /api/customer-wallets`：查询和创建客户账户币钱包。
- `GET /api/customer-wallets/:id`、`GET /api/customer-wallets/:id/transactions`：查看钱包汇总和钱包明细。
- `GET /api/customer-wallets/:id/balance/check`：校验钱包直接余额与钱包流水是否一致。
- `POST /api/customer-wallets/:id/opening-balance`：录入钱包期初余额并生成期初流水。
- `POST /api/customer-wallets/:id/adjust`：执行红冲、蓝补或手工调整。
- `POST /api/customer-wallets/:id/credit`、`POST /api/customer-wallets/:id/advance`：维护授信和垫款配置并记录审计。
- `GET /api/invoices`、`GET /api/invoices/:id`：分页查询发票及查看发票详情。
- `POST /api/invoices`：创建发票草稿，必须关联一个订单或一笔已确认收款记录。
- `POST /api/invoices/:id`：仅修改发票草稿的非核心信息。
- `POST /api/invoices/:id/process`：将草稿提交为开票中。
- `POST /api/invoices/:id/confirm`、`POST /api/invoices/:id/void`：确认开票或作废发票。
- `GET /api/customers/:customerId/invoice-balance`：查询客户业务来源金额、已开票金额和未开票金额。

除登录接口外，业务接口均要求 `Authorization: Bearer <JWT>`。正式资金流水没有修改和删除接口，错误流水必须通过反向调整流水处理。

客户返点政策和供应商成本返点政策查看需要 `FINANCE_REBATE_VIEW`，新增版本和停用政策需要 `FINANCE_REBATE_POLICY_EDIT`；超级管理员拥有全部权限。两套政策分别按客户或供应商所属组织隔离，未配置有效政策时不会使用默认返点比例。政策配置本身不产生金额和资金流水；创建外采订单时，系统按政策快照计算客户现金收入、供应商现金成本和真实毛利。

财务核算中心查询需要 `FINANCE_VIEW` 权限。查询实时读取数据库，不使用 Redis 缓存；审计只记录操作人、查询接口和查询范围，不保存金额快照。所有查询继续执行 JWT、权限和组织数据范围校验。

外采订单使用现有 `PurchaseOrder` 模型，接口层将 `orderNo` 展示为 `procurementNo`。订单状态按草稿、待确认、已确认、已结算、已取消流转；客户和供应商政策一旦保存为订单快照，后续政策版本修改不会影响历史订单。外采订单权限使用 `PROCUREMENT_VIEW`、`PROCUREMENT_CREATE`、`PROCUREMENT_CONFIRM`、`PROCUREMENT_CANCEL`、`PROCUREMENT_SETTLE`。

### 退款与冲正

客户退款以 `Refund` 申请单管理，退款上限只依据订单实际客户收款 `customerPaidAmount`，并扣除待审批、已审批和已执行的退款金额；不会使用客户账户币额度，也不会回滚原订单毛利或账户币到账记录。退款接口为：`POST /api/purchase-orders/:id/refunds`、`GET /api/refunds`、`GET /api/refunds/:id`、`GET /api/purchase-orders/:id/refunds`、`POST /api/refunds/:id/approve`、`POST /api/refunds/:id/reject`、`POST /api/refunds/:id/execute`。

退款执行时通过 `CashflowService` 在同一数据库事务中创建负向 `CUSTOMER_REFUND` 资金流水并更新公司人民币账户；正式退款流水不可删除。退款权限为 `FINANCE_REFUND_VIEW`、`FINANCE_REFUND_CREATE`、`FINANCE_REFUND_APPROVE`，并按组织隔离和服务端权限校验。

### 客户与一级代理结算

结算中心复用 `Settlement` 和 `SettlementItem` 模型，通过 `settlementType` 区分客户结算与一级代理结算。结算周期采用 `[periodStart, periodEnd)`，只读取外采订单已保存的金额、政策和利润快照，不重新解析当前返点政策。客户结算额外汇总实际执行退款、净收款和实际到账账户币；供应商结算汇总现金成本、账户币和实际付款，结算金额与实际付款保持分离。结算同时保留订单历史毛利 `grossProfit` 与扣除本期退款后的 `realizedProfit`，不会覆盖原订单快照。

接口包括：`GET/POST /api/customer-settlements`、`GET /api/customer-settlements/:id`、`POST /api/customer-settlements/generate`、`POST /api/customer-settlements/:id/confirm`、`POST /api/customer-settlements/:id/cancel`，以及对应的 `/api/supplier-settlements` 接口。结算权限为 `FINANCE_SETTLEMENT_VIEW`、`FINANCE_SETTLEMENT_CREATE`、`FINANCE_SETTLEMENT_CONFIRM`、`FINANCE_SETTLEMENT_CANCEL`。本模块不创建资金流水、不修改账户余额、不执行对账和导出。

### 财务对账中心
对账中心复用并扩展已有 `Reconciliation` 模型，支持 CNY 资金账户和独立的 `ACCOUNT_CREDIT` 推广账户。对账期间统一采用 `[periodStart, periodEnd)`，服务端分别汇总对应流水、计算期初余额与期末余额，并比较缓存余额与流水重算结果。对账不会修改账户余额、创建流水、修改订单或重新读取历史政策。状态为 `DRAFT -> CHECKING -> PASSED/FAILED -> CONFIRMED`，确认只允许通过检查的记录。接口包括：`GET /api/reconciliations`、`GET /api/reconciliations/:id`、`POST /api/reconciliations/generate`、`POST /api/reconciliations/:id/check`、`POST /api/reconciliations/:id/confirm`。权限为 `FINANCE_RECONCILIATION_VIEW`、`FINANCE_RECONCILIATION_CREATE`、`FINANCE_RECONCILIATION_CONFIRM`。

### 财务调整中心
财务调整使用 `FinancialAdjustment` 单据，状态为 `DRAFT -> APPROVED -> EXECUTED`，也支持草稿拒绝。执行时必须在同一个数据库事务中调用 `CashflowService`：CNY 调整生成 `Transaction`，`ACCOUNT_CREDIT` 调整生成 `PromotionTransaction`，并通过 `adjustmentId` 建立可追溯关联。调整金额始终使用 Decimal，收入调整生成正数流水，支出调整生成负数流水。接口包括：`GET/POST /api/financial-adjustments`、`GET /api/financial-adjustments/:id`、`POST /api/financial-adjustments/:id/approve`、`POST /api/financial-adjustments/:id/reject`、`POST /api/financial-adjustments/:id/execute`。权限为 `FINANCE_ADJUST_VIEW`、`FINANCE_ADJUST_CREATE`、`FINANCE_ADJUST_APPROVE`、`FINANCE_ADJUST_EXECUTE`。调整单不会直接修改余额，所有状态变化均写入审计日志。

客户实际收款和一级代理商实际付款与订单的计算结果分离保存，支持分次支付。每次支付使用 `idempotencyKey` 防止重复入账，并在一个数据库事务内完成资金流水、账户余额、支付记录和审计日志写入。当前账户模型允许合法负余额，因此向一级代理付款暂不因公司账户余额不足而拒绝；如后续启用余额不足控制，应在 `CashflowService` 的统一入口增加明确配置。

### 客户钱包
客户钱包是客户账户币业务余额的聚合视图，与公司 CNY 资金账户、一级代理商 CNY 账户分离。`PromotionAccount` 继续表示客户的具体推广账户，`CustomerWallet` 表示客户总钱包；钱包总余额为钱包直接余额与客户名下全部 `ACCOUNT_CREDIT` 推广账户余额之和，不会只取某一个推广账户。CNY 与 `ACCOUNT_CREDIT` 不混算，客户人民币付款仍进入公司 `Account` 的 `Transaction`，客户账户币到账仍进入对应 `PromotionAccount` 的 `PromotionTransaction`。

钱包期初余额、红冲、蓝补和手工调整只通过 `CustomerWalletTransaction` 形成不可删除的明细，并在数据库事务中更新钱包直接余额。红冲为负数流水，蓝补为正数流水；幂等键防止重复操作。授信可用余额为 `creditLimit - creditUsed`，垫款未还单独保存，不会伪装成普通钱包余额。钱包停用后禁止新的充值或调整，但历史钱包和明细仍可查询。相关操作使用 `FINANCE_WALLET_VIEW`、`FINANCE_WALLET_ADJUST`、`FINANCE_WALLET_OPENING_BALANCE` 权限，并按客户所属组织隔离。

客户账户币到账同样使用数据库事务锁定订单和推广账户，原子写入 `PromotionTransaction`、更新推广账户余额、写入到账记录和更新订单到账状态。支持 `PENDING -> PARTIAL -> PAID`，累计到账不得超过订单的 `customerCreditAmount`。推广账户币标准案例：客户支付 `50000.00 CNY`，10% `CASH_TO_CREDIT` 得到 `55000.00 ACCOUNT_CREDIT`；供应商成本按 15% `CREDIT_TO_CASH` 为 `47826.09 CNY`，毛利为 `2173.91 CNY`。

## 对账规则

对账期间统一采用左闭右开区间 `[periodStart, periodEnd)`，系统余额按期初余额加期间流水重新计算。收款、充值、返点、扣款、退款、调账按业务类型统计，不以金额正负简单代替业务分类。

### 收款管理中心
收款管理将银行原始交易、收款记录和客户钱包/资金流水分开保存：`BankTransaction` 表示银行侧原始事实，`ReceiveRecord` 表示业务收款记录，确认收款后才通过 `CashflowService` 生成公司的 CNY `Transaction`。银行交易导入不会自动创建收款，也不会自动增加客户钱包；客户钱包仍由既有钱包和推广账户业务独立维护。

接口包括：

- `GET /api/bank-transactions`、`GET /api/bank-transactions/:id`：查询银行交易。
- `POST /api/bank-transactions/import`：批量导入银行原始交易，按账户和原始交易编号幂等。
- `POST /api/bank-transactions/:id/match`、`POST /api/bank-transactions/:id/unmatch`：匹配或取消匹配客户/订单，不直接产生资金变化。
- `GET /api/receive-records`、`GET /api/receive-records/:id`：查询收款记录。
- `POST /api/receive-records`：根据银行交易创建收款记录。
- `POST /api/receive-records/:id/confirm`：确认收款，在同一数据库事务中生成 `CUSTOMER_PAYMENT` CNY 流水；重复确认幂等，不会重复入账。

收款权限包括 `FINANCE_BANK_TRANSACTION_VIEW`、`FINANCE_BANK_TRANSACTION_IMPORT`、`FINANCE_BANK_TRANSACTION_MATCH`、`FINANCE_RECEIVE_VIEW`、`FINANCE_RECEIVE_CREATE` 和 `FINANCE_RECEIVE_CONFIRM`。接口均使用 JWT、组织数据范围和服务端权限检查，并对导入、匹配、取消匹配、创建及确认动作写入审计日志。确认后的银行交易和收款记录不提供修改或删除接口，纠错应通过既有调整/冲销体系处理。

当前版本暂不支持一笔银行交易拆分为多笔收款，收款金额必须等于银行原始收入金额；这一规则是为避免在业务口径未确认前产生错误分摊。银行交易“忽略”状态已保留，但忽略操作接口、银行接口自动同步、发票关联和自动候选匹配规则仍待业务确认。

本任务新增 migration 文件但未执行；未安装依赖、未启动 Docker、未运行测试。由于当前环境没有 `node_modules`，本次只补充了自动化测试代码，不能报告为测试通过。

### 发票管理中心
发票管理使用单一 `Invoice` 模型，支持草稿、开票中、已开票和已作废状态。发票必须关联一个明确的 `PurchaseOrder` 或一笔已确认的 `ReceiveRecord`，支持无水单按订单创建发票草稿；当前不支持一张发票拆分多个业务来源。订单和收款记录均保留组织、客户、账户及业务编号关联，详情页可查看审计记录。

后端按订单客户现金金额/客户应收金额/订单基准金额，或收款记录金额，减去已确认退款和非作废历史发票，使用 Prisma Decimal 计算本次可开票额度。创建和确认时都会重新校验 `本次开票金额 <= 未开票金额`，并对订单、收款记录和发票执行数据库事务及行锁。作废只改变发票状态，不删除历史、不修改订单、不创建资金流水，也不会增加客户钱包余额。

发票权限包括 `FINANCE_INVOICE_VIEW`、`FINANCE_INVOICE_CREATE`、`FINANCE_INVOICE_EDIT`、`FINANCE_INVOICE_CONFIRM` 和 `FINANCE_INVOICE_VOID`。创建、草稿修改、确认和作废均写入审计日志，并执行 JWT 与组织隔离。税率、税额、红字发票以及“收款与开票先后关系”在功能清单中未形成明确可执行口径，本阶段没有自行增加税务计算或红冲流程。

## 当前未实现

机器人、OCR、广告平台/银行接口、自动充值、Excel/PDF 导出、生产部署和完整验收联调暂不包含在当前版本。
