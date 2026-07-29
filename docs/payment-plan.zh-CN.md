# AI Marketing 支付方案

> 状态：设计与实施基线
>
> 更新日期：2026-07-29
>
> 当前策略：暂时关闭 PayPal 新订阅入口；优先建设支付宝一次性积分充值。

## 1. 方案结论

系统采用两条独立业务链路：

1. **订阅会员**：按周期续费，提供套餐权益和周期积分。当前保留 Stripe，暂时关闭 PayPal 新订阅入口。
2. **一次性积分充值**：用户不需要开通会员，直接购买积分包。第一阶段接入 Z-Pay 的支付宝通道。

不要把支付宝一次性支付直接塞进现有订阅 checkout。当前 billing-kit 的核心流程围绕订阅、续费、升级和订阅切换设计；一次性充值应使用独立的支付订单、回调和积分发放流程。

~~~text
用户登录
  ├─ 订阅会员：选择套餐 → 选择可用支付方式 → 周期性获得权益
  └─ 积分充值：选择积分包 → 选择可用支付方式 → 支付成功后获得积分
~~~

## 2. 当前代码基线

当前项目已经具备积分账户和积分账本，但还没有完整的一次性充值能力：

- `modules/billing-kit/core/provider.ts` 目前只把 `stripe` 和 `paypal` 作为 billing provider。
- `modules/billing-kit/core/checkout.ts` 的 checkout 逻辑包含订阅重复购买、订阅切换和计划升级判断。
- `modules/billing-kit/server/stripe-webhook-route.ts` 和 `modules/billing-kit/server/paypal-webhook-route.ts` 主要处理订阅状态及周期积分发放。
- `AI_MARKETING_credit_accounts` 已有 `purchased_balance` 字段，但目前没有对应的支付订单和充值回调流程。
- `AI_MARKETING_credit_ledger` 已支持 `grant` 和幂等键，可复用于充值成功后的积分入账。
- 当前套餐价格模型主要是美元；支付宝充值需要增加明确的人民币价格，不应在客户端临时换算汇率。

相关入口：

- `modules/billing-kit/core/provider.ts`
- `modules/billing-kit/core/checkout.ts`
- `modules/billing-kit/core/plans.ts`
- `modules/billing-kit/server/subscription-route.ts`
- `modules/billing-kit/server/stripe-webhook-route.ts`
- `modules/billing-kit/server/paypal-webhook-route.ts`
- `modules/billing-kit/ui/pricing-cards.tsx`
- `app/api/billing/credits/route.ts`

## 3. 产品模型

### 3.1 订阅会员

订阅会员属于 `subscription` 产品：

- 有套餐代码，例如 `starter`、`creator`、`studio`。
- 使用 Stripe 等支持订阅的支付渠道。
- 有订阅状态、周期开始/结束时间、取消和续费。
- 订阅成功或续费成功后发放 `monthly_grant_balance`。
- 订阅取消后，按照周期结束时间处理会员权益。

### 3.2 一次性积分充值

一次性充值属于 `one_time` 产品：

- 不创建会员订阅记录。
- 不需要 `plan_code` 对应会员权益。
- 创建独立的支付订单。
- 支付成功后增加 `purchased_balance`。
- 充值订单和积分入账必须支持幂等。
- 默认不设置自动续费。
- 不区分套餐席位：所有工作区成员数量不限，成员加入与权限仍由企业管理员治理。
- 充值卡片需要沿用套餐的勾选式特性展示，但明确标注为积分消耗能力；它不解锁订阅专属模型、会员权益或周期积分。

当前阶段只上线一个积分包（人民币固定价，不自动随汇率变化）：

| 产品代码 | 积分 | 人民币价格 | 说明 |
|---|---:|---:|---|
| `credits_1000` | 1,000 | ¥19.9 | 当前唯一充值商品 |

定价依据：

- 当前 Starter：3,000 积分 / $9.90，约 $0.00330/积分。
- 当前 Creator：10,000 积分 / $19.90，约 $0.00199/积分。
- 当前 Studio：35,000 积分 / $59.90，约 $0.00171/积分。
- 一次性充值不包含会员等级、团队席位、会员功能或自动续费，因此单积分价格应略高于 Creator/Studio 的套餐内积分。
- 后续增加更大积分包前，应先观察 1,000 积分包的购买、消耗和退款数据，再确定阶梯折扣。

这些价格是产品定价，不是实时汇率换算结果。正式上线前由产品和财务确认人民币价格、税费展示、退款规则和 Z-Pay 商户允许的金额精度。服务端必须保存固定的 `price_cny_fen`，前端只展示服务端返回的商品信息。Z-Pay 的 `money` 金额币种和精度需要以商户文档和实测结果为准；不要默认把美元分转换成同数值的人民币分。

### 3.3 成员与存储策略

- 套餐暂不限制工作区成员数量，不显示或计算套餐席位上限。
- 成员总数、活跃状态、角色和功能权限仍保留管理与审计能力；这属于组织治理，不是付费席位配额。
- 套餐暂不设置存储空间配额，避免在缺少真实用量数据时制造购买阻力和复杂的超额处理。
- 存储仍必须保留技术护栏：单文件大小、允许的文件类型、单次上传数量、上传频率/并发、临时生成文件的保留周期，以及异常用量告警。
- 上线后持续记录工作区存储量、增长速度、单用户峰值和存储成本；当成本或滥用风险达到阈值时，优先增加软提醒，再评估按套餐设置硬配额。

## 4. 支付方式选择策略

采用“自动推荐 + 用户手动切换”，不采用完全隐藏式的自动路由。

优先级：

~~~text
用户本次手动选择
  > 用户最近一次选择
  > 用户账单国家/地区
  > 浏览器语言
  > 系统默认支付方式
~~~

推荐规则：

- 中国账单国家/地区：默认支付宝。
- 没有账单国家/地区时，`zh-CN` 只作为推荐信号，不作为强制路由依据。
- 非中国用户：默认 Stripe。
- PayPal 暂时不出现在新支付方式列表中。
- 当前支付方式不可用时，自动选择可用方式并给出明确提示。
- 用户主动切换后，不要在本次 checkout 中重新覆盖选择。

UI 建议：

~~~text
支付方式

● 支付宝（推荐）
○ Stripe

[立即支付]
~~~

不要为每个通道放置一个同等醒目的独立按钮。一个支付方式选择器加一个主操作按钮更容易理解，也方便以后接入微信支付或其他渠道。

支付方式列表必须由服务端返回可用性，客户端只能选择，不能自行决定某个支付渠道是否可用。

## 5. 统一支付抽象

建议区分 `BillingProvider` 和 `PaymentProvider`：

~~~ts
type PaymentProvider = "stripe" | "zpay"
type PaymentType = "subscription" | "one_time"
type PaymentOrderStatus =
  | "created"
  | "pending"
  | "paid"
  | "failed"
  | "expired"
  | "refunded"
~~~

Stripe 订阅仍然走现有订阅流程；Z-Pay 只在第一阶段用于 `one_time` 积分充值。

建议的 provider adapter 能力：

~~~ts
interface PaymentAdapter {
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>
  verifyNotification(input: VerifyNotificationInput): Promise<VerifiedPayment>
  queryPayment?(providerOrderNo: string): Promise<VerifiedPayment>
  refund?(input: RefundPaymentInput): Promise<RefundResult>
}
~~~

支付适配器只负责外部支付协议；订单状态、积分发放和用户权益由平台服务统一处理。

## 6. 数据模型

### 6.1 充值商品表

新增 `AI_MARKETING_credit_products`：

~~~text
id
code                       唯一商品代码
name
credit_amount              充值积分数
price_cny_fen              人民币价格，单位分
price_usd_cents            可选，未来 Stripe 充值使用
active
sort_order
metadata
created_at
updated_at
~~~

不要复用 `subscription_plans` 存充值商品。订阅套餐和充值商品的权益、退款、过期和价格语义不同。

### 6.2 支付订单表

新增 `AI_MARKETING_payment_orders`：

~~~text
id
order_no                   平台订单号，唯一
user_id
enterprise_id
product_type               one_time
product_code               credits_1000 等
provider                   zpay / stripe
payment_method             alipay / card 等
amount_minor               最小货币单位金额
currency                   CNY / USD
credit_amount
status
provider_trade_no
provider_payload           JSONB，必要时脱敏保存
return_url
notify_received_at
paid_at
refunded_at
expires_at
created_at
updated_at
~~~

约束和索引：

- `order_no` 唯一。
- `(provider, provider_trade_no)` 唯一或可安全去重。
- `status` 由服务端状态机控制。
- 不把支付密钥、完整敏感凭证写入 `provider_payload`。

### 6.3 积分账本

充值成功后写入现有 `credit_ledger`：

~~~text
entry_type = grant
feature_key = purchased_credits
provider = zpay
subscription_id = NULL
idempotency_key = payment-order:{order_no}
metadata = { orderNo, productCode, providerTradeNo }
~~~

同一个支付订单只能成功入账一次。事务内完成：

1. 锁定积分账户。
2. 检查订单是否已经入账。
3. 插入账本记录。
4. 增加 `balance` 和 `purchased_balance`。
5. 将订单标记为 `paid`。

### 6.3.1 当前实现落点

本次实现已对应到以下接口和代码入口：

- `GET /api/billing/credit-products?currency=CNY`：返回四个积分包和可用支付渠道。
- `POST /api/billing/credit-orders`：服务端按商品代码生成一次性 Z-Pay/支付宝订单。
- `GET /api/billing/payment-orders/:orderNo`：充值返回页查询订单状态。
- `GET/POST /api/payments/zpay/notify`：校验签名、金额和商户号后幂等入账。
- `modules/billing-kit/migrations/add-billing-credit-topup-schema.sql`：创建支付订单和积分商品表并初始化积分包。

积分包商品和积分账本没有过期字段；API 对积分过期时间固定返回 `null`。支付订单的 `expires_at` 只用于限制未完成支付订单的有效期，不会使已到账积分失效。

### 6.4 积分消耗顺序

建议：

1. 先消耗即将过期的周期积分。
2. 再消耗永久有效的购买积分。

这样可以减少周期积分过期浪费。若产品决定购买积分也有有效期，必须把过期时间记录在账本或批次表中，不能只维护一个总余额。

## 7. API 设计

### 7.1 获取充值商品

~~~http
GET /api/billing/credit-products?currency=CNY
~~~

返回：

~~~json
{
  "products": [
    {
      "code": "credits_5000",
      "creditAmount": 5000,
      "amountMinor": 4900,
      "currency": "CNY",
      "availableProviders": ["zpay"]
    }
  ]
}
~~~

### 7.2 创建充值订单

~~~http
POST /api/billing/credit-orders
Content-Type: application/json
~~~

请求只接受：

~~~json
{
  "productCode": "credits_5000",
  "provider": "zpay",
  "paymentMethod": "alipay"
}
~~~

服务端必须重新读取商品、价格、用户和支付渠道可用性。不能接受前端传入的金额或积分数作为最终值。

返回：

~~~json
{
  "orderNo": "...",
  "provider": "zpay",
  "paymentUrl": "https://z-pay.cn/submit.php?...",
  "expiresAt": "..."
}
~~~

### 7.3 Z-Pay 异步通知

~~~http
POST /api/payments/zpay/notify
~~~

通知处理顺序：

1. 读取原始通知参数。
2. 按 Z-Pay 规则生成待签名字符串并验签。
3. 校验 `pid`、平台订单号、金额、支付类型和支付状态。
4. 必要时调用 Z-Pay 查询接口二次确认。
5. 开启数据库事务处理订单和积分入账。
6. 对重复通知返回成功，不重复发放积分。
7. 按 Z-Pay 文档要求返回成功响应。

`return_url` 只负责把用户带回网站展示结果，不能作为发放积分的依据。

### 7.4 查询订单

~~~http
GET /api/billing/payment-orders/{orderNo}
~~~

用于前端支付返回后的状态轮询，也用于用户关闭支付页面后重新查看订单。前端展示成功前，应以服务端订单状态为准。

## 8. Z-Pay 接入方案

附件 [pay.txt](/Users/beihuang/Downloads/node/pay.txt) 展示了以下参数：

~~~text
pid
money
name
notify_url
out_trade_no
return_url
sitename
type = alipay
~~~

签名示例是：

~~~text
将非空参数按规则排序
排除 sign 和 sign_type
拼接为 key=value&key=value
待签名字符串末尾拼接商户 key
MD5 得到 sign
~~~

正式接入前必须从商户文档确认：

- 异步通知字段名称。
- 成功状态字段和值。
- 通知成功响应文本。
- 金额币种和小数/分精度。
- 订单查询接口。
- 签名排序和 URL 编码细节。
- 是否支持退款。
- 是否支持周期自动扣款。

当前文档页面需要登录后才能访问，因此不能仅凭 demo 推断上述回调细节。生产上线前必须使用 Z-Pay 沙箱或小额真实订单完成联调。

服务端环境变量建议：

~~~env
ZPAY_PID=
ZPAY_KEY=
ZPAY_SUBMIT_URL=https://z-pay.cn/submit.php
ZPAY_NOTIFY_URL=https://www.aimarketingsite.com/api/payments/zpay/notify
ZPAY_RETURN_URL=https://www.aimarketingsite.com/dashboard/billing
ZPAY_ENABLED=false
~~~

`ZPAY_KEY`、`ZPAY_PID` 只在服务端使用，不能通过公开 API 返回给浏览器。

## 9. 订阅与一次性充值的状态边界

### 9.1 一次性充值不创建订阅

充值成功时：

- 不插入 `AI_MARKETING_user_subscriptions`。
- 不改变用户当前会员套餐。
- 不触发订阅升级/切换逻辑。
- 只增加积分账户余额和充值账本记录。

### 9.2 订阅仍然可以独立存在

有会员的用户也可以充值积分；没有会员的用户也可以充值积分。两者的余额和权益计算必须明确区分。

### 9.3 会员开关

如果暂时不开启会员订阅，仍然可以保留一次性充值入口。会员订阅开关和充值开关应分开：

~~~env
BILLING_PAID_PLANS_ENABLED=false
ZPAY_ENABLED=true
~~~

## 10. PayPal 暂停策略

当前已将本地 `.env` 中的配置改为：

~~~env
BILLING_PAYPAL_SUBSCRIPTIONS_ENABLED=false
~~~

这表示：

- 不再展示新的 PayPal 订阅入口。
- 新的 PayPal checkout API 返回 disabled。
- 不删除 PayPal 代码、数据库字段或 webhook 路由。
- 已存在的 PayPal 订阅仍应继续接收 webhook 和续费事件，避免存量会员状态错误。

部署环境必须同步设置同名变量为 `false`。由于 `.env` 被 gitignore 忽略，修改本地文件不会自动修改 Railway、Vercel 或其他生产环境变量。

如果未来要完全停止已有 PayPal 订阅扣款，必须另行设计远程订阅取消、用户通知、剩余周期和退款处理，不能只关闭这个开关。

## 11. 安全与一致性要求

- 不信任前端金额、积分数、订单状态和支付成功参数。
- 所有订单必须由服务端生成唯一订单号。
- 支付回调必须验签。
- 支付回调必须幂等。
- 订单金额必须和商品当前价格匹配。
- 回调处理必须使用数据库事务和行锁。
- 订单状态只能单向推进，退款是受控的反向业务操作。
- 日志中不得打印 Z-Pay key、完整支付凭证或敏感个人信息。
- 对回调接口增加请求体大小、超时、频率和异常日志保护。
- 前端支付返回页必须展示“处理中”状态，轮询服务端订单，不要立即假设成功。

## 12. 退款和人工处理

第一阶段可以先支持人工退款，但数据模型必须预留：

- `refunded` 订单状态。
- `refunded_at`。
- 退款金额。
- 退款原因。
- 退款操作人。
- 对应的 `refund` 积分账本记录。

若充值积分已经消费，不能简单把余额改成负数。应进入人工审核，按照退款规则决定是否扣回其他余额或拒绝退款。

## 13. 监控和对账

至少记录以下指标：

- 创建订单数。
- 支付页面打开数。
- 支付成功数。
- 支付失败数。
- 支付回调延迟。
- 重复回调数。
- 回调验签失败数。
- 订单已支付但积分未入账数。
- 充值金额与支付渠道对账差异。

每天执行对账：

~~~text
平台 paid 订单
对比
Z-Pay/Stripe 渠道成功订单
对比
credit_ledger purchased_credits 入账记录
~~~

发现“渠道已成功但平台未入账”时，使用订单号补偿，不直接手工修改余额。

## 14. 实施顺序

### 阶段一：关闭 PayPal 新入口

- 设置 `BILLING_PAYPAL_SUBSCRIPTIONS_ENABLED=false`。
- 验证套餐 API 不返回 PayPal 可用计划。
- 验证 PayPal 创建订阅 API 返回 disabled。
- 保留已有 PayPal webhook 处理。

### 阶段二：一次性充值基础设施

- 增加 `credit_products` 表。
- 增加 `payment_orders` 表。
- 增加订单状态和支付 provider 类型。
- 增加积分充值账本入账服务。
- 增加订单查询接口。

### 阶段三：Z-Pay 支付适配器

- 实现参数构建和签名。
- 实现创建订单。
- 实现异步通知验签。
- 实现订单查询和补偿。
- 增加回调事件日志和幂等处理。

### 阶段四：前端充值入口

- 在余额组件增加“充值积分”。
- 展示积分包、价格和到账数量。
- 增加支付方式选择器。
- 中国用户默认支付宝，允许手动切换。
- 支付返回后轮询订单状态。

### 阶段五：联调和发布

- 沙箱成功支付。
- 用户关闭支付页后回到订单页。
- 重复发送同一回调。
- 回调先于用户返回。
- 金额篡改。
- 签名错误。
- 渠道成功但回调延迟。
- 订单过期。
- 退款和积分已消费场景。
- 部署环境变量和 HTTPS 回调地址检查。

## 15. 验收标准

方案完成后必须满足：

- 用户可以不订阅会员直接购买积分。
- 支付成功只增加一次积分。
- 刷新或重复打开支付返回页不会重复入账。
- 前端传入错误金额不能创建错误订单。
- 回调验签失败不会改变订单和余额。
- Z-Pay 支付成功但用户没有回到网站时，积分仍能到账。
- PayPal 不出现在新用户支付方式中。
- 已有 PayPal 订阅仍能正常同步状态和续费积分。
- 订阅会员和一次性充值不会互相覆盖状态。
- 订单、支付渠道、积分账本可以通过订单号完整追踪。
