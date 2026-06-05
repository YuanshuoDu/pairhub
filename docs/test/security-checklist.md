# StudyBuddy — 安全清单 v1.0

> **状态**：v1.0
> **作者**：@OpenClaw
> **生效日期**：2026-06-05
> **关联**：
> - 架构：[`../architecture.md`](../architecture.md) §安全与合规
> - 测试计划：[`test-plan-v1.0.md`](./test-plan-v1.0.md)
> - 路线图：[`../../studybuddy-plan/cto-roadmap-v1.0.md`](../../studybuddy-plan/cto-roadmap-v1.0.md) §5 Q3（UGC 审核）+ R5（GDPR）

---

## 0. 目的

建立 StudyBuddy 的**安全基线**。本文档：
1. 覆盖 **OWASP Top 10 (2021)** 全部 10 项，每项至少 1 个 check + 实现方法
2. 定义**数据加密**（传输 / 存储）标准
3. 定义**鉴权**（JWT 过期、刷新、撤销）规则
4. 定义**内容安全**（UGC 接入微信内容安全 API）
5. 定义**GDPR / 数据合规**（用户数据导出、删除 API）
6. 定义**第三方依赖**审计流程

任何 PR 改动安全相关代码必须**先过本文档**。

---

## 1. OWASP Top 10 (2021) 覆盖

### A01:2021 — Broken Access Control（失效的访问控制）

**风险**：用户越权访问他人数据、垂直越权、水平越权。

**Check 列表**：
- [ ] 每个 endpoint 在路由层强制鉴权（`@fastify/authenticate`）
- [ ] 每个 resource 拉取后校验 owner（`req.user.id === resource.userId`）
- [ ] 越权测试：用户 A 尝试 GET / DELETE 用户 B 的资源应返回 403
- [ ] 鉴权缺失的 endpoint CI 自动扫描：`tsc` + 自研 `tests/security/missing-auth.test.ts`

**实现方法**：
```typescript
// server/src/plugins/auth.ts
fastify.decorate('authenticate', async (req, reply) => {
  try {
    await req.jwtVerify();
  } catch (err) {
    return reply.code(401).send({ type: 'about:blank', title: 'Unauthorized' });
  }
});

// 路由用法
fastify.get('/api/activities/:id', { onRequest: [fastify.authenticate] }, handler);
```

**自动化测试**（`tests/security/access-control.test.ts`）：
- ✅ 用户 A 创建活动 → 用户 B 尝试修改 → 403
- ✅ 未登录用户访问 `/api/users/me` → 401
- ✅ 用户 A 取消用户 B 的报名 → 403

---

### A02:2021 — Cryptographic Failures（加密失败）

**风险**：明文存储敏感数据、HTTPS 配置错误、弱算法。

**Check 列表**：
- [ ] 传输层：全站强制 HTTPS（HSTS、HTTP→HTTPS 301）
- [ ] 存储层：敏感字段加密（手机号、身份证、refresh token hash）
- [ ] 算法：JWT HS256 → **RS256**（公私钥分离）；password hash 用 **bcrypt**（cost ≥ 12）或 **argon2id**
- [ ] 随机数：`crypto.randomBytes(32)`，不用 `Math.random`
- [ ] TLS 1.2+（禁用 SSLv3 / TLS 1.0 / 1.1）

**实现方法**：
- TLS：Nginx / Cloudflare 强制 301 + HSTS 头
- 字段加密：`server/src/lib/crypto.ts` 用 `crypto.createCipheriv('aes-256-gcm', key, iv)`
- password hash：`pnpm add argon2` + `argon2.hash(pwd, { type: argon2.argon2id })`
- JWT：私钥存 Vault，签发 15min access + 7d refresh

**自动化测试**：
- ✅ 扫描 DB 中所有 `phone` / `email` 字段，确认非明文（PR 阶段 `tests/security/encryption.test.ts`）
- ✅ CI 用 `testssl.sh` 扫 TLS 配置

---

### A03:2021 — Injection（注入）

**风险**：SQL 注入、NoSQL 注入、命令注入、模板注入。

**Check 列表**：
- [ ] **所有 DB 查询走 Prisma ORM**（参数化），禁止模板字符串拼接 SQL
- [ ] 用户输入**不直接拼**到 `pg_query` / Redis 命令 / OS 命令
- [ ] 搜索 / 筛选字段用 Prisma 的 `where: { title: { contains: q, mode: 'insensitive' } }`
- [ ] 错误信息不回显原始 SQL（Prisma 默认已脱敏）

**实现方法**：
```typescript
// ✅ 安全
const activity = await prisma.activity.findFirst({
  where: { id, creatorId: req.user.id },
});

// ❌ 禁止
const activity = await prisma.$queryRaw`SELECT * FROM "Activity" WHERE id = ${id}`;
```

**自动化测试**：
- ✅ `tests/security/injection.test.ts`：尝试 `' OR 1=1--` / `"; DROP TABLE` 等
- ✅ CI 跑 `semgrep --config=p/owasp-top-ten server/src`

---

### A04:2021 — Insecure Design（不安全设计）

**风险**：业务逻辑缺陷（如报名事务中忘记检查人数上限）、缺少威胁建模。

**Check 列表**：
- [ ] **报名事务**必须在数据库 transaction 中完成：扣减名额 + 插入 signup 记录
- [ ] **状态机迁移**必须有合法迁移白名单（`[created → open, open → full, ...]`）
- [ ] 限流：报名 / 创建活动 / 登录 都有 rate limit
- [ ] 关键流程有架构 ADR（已写：`docs/adr/0004-state-machine-for-activity.md`）
- [ ] 威胁建模：每季度对核心流程跑 STRIDE

**实现方法**：
```typescript
// server/src/modules/signup/transaction.ts
await prisma.$transaction(async (tx) => {
  const activity = await tx.activity.findUniqueOrThrow({ where: { id } });
  if (activity.status === 'full') throw new ConflictError('Activity is full');
  const count = await tx.signup.count({ where: { activityId: id, status: 'approved' } });
  if (count >= activity.maxParticipants) {
    await tx.activity.update({ where: { id }, data: { status: 'full' } });
    throw new ConflictError('Activity is full');
  }
  return tx.signup.create({ data: { activityId: id, userId, status: 'approved' } });
});
```

**自动化测试**：
- ✅ 报名事务并发 100 抢 1 席，最终 approved 只能 1 个
- ✅ 状态机非法迁移（如 `cancelled → open`）必须抛错

---

### A05:2021 — Security Misconfiguration（安全配置错误）

**风险**：默认密码、debug 模式开启、不必要端口暴露。

**Check 列表**：
- [ ] `.env.example` 不含真实 secret（仅占位）
- [ ] `NODE_ENV=production` 时关闭 Fastify 详细错误（`app.setErrorHandler` 自定义）
- [ ] CORS 白名单（仅 `*.studybuddy.app` / 微信小程序后端）
- [ ] Security headers（`helmet` 插件）：CSP / X-Frame-Options / X-Content-Type-Options / Referrer-Policy
- [ ] Docker 镜像以非 root 用户运行
- [ ] `/health` 公开，`/ready` / `/metrics` 仅内网

**实现方法**：
```typescript
import helmet from '@fastify/helmet';
await fastify.register(helmet, {
  contentSecurityPolicy: {
    directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"] },
  },
});
```

**自动化测试**：
- ✅ `tests/security/headers.test.ts`：响应头包含 `Strict-Transport-Security` / `X-Content-Type-Options: nosniff`
- ✅ Trivy 扫 Docker 镜像

---

### A06:2021 — Vulnerable and Outdated Components（脆弱和过时的组件）

**风险**：第三方依赖含已知漏洞。

**Check 列表**：
- [ ] **CI 跑** `pnpm audit --prod --audit-level=high`（high/critical 阻断 PR）
- [ ] **Dependabot** 自动开 PR（已配置）
- [ ] **每月 1 号** 跑 `pnpm outdated`，升级 minor / patch
- [ ] **重大升级**（如 fastify v4 → v5）单独排期
- [ ] 锁定 `pnpm-lock.yaml`，CI 用 `--frozen-lockfile`

**实现方法**（`.github/dependabot.yml`）：
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/server"
    schedule: { interval: "weekly" }
    open-pull-requests-limit: 5
  - package-ecosystem: "npm"
    directory: "/miniprogram"
    schedule: { interval: "weekly" }
  - package-ecosystem: "pub"
    directory: "/app"
    schedule: { interval: "weekly" }
```

**CI 集成**（`backend-ci.yml` 增补）：
```yaml
- name: Security audit
  run: pnpm audit --prod --audit-level=high
  continue-on-error: false
```

**阻断规则**：
- high / critical 漏洞 **阻断 PR**
- 0-day 公告 24h 内响应

---

### A07:2021 — Identification and Authentication Failures（认证失败）

**风险**：弱密码、credential stuffing、session 泄漏。

**Check 列表**：
- [ ] password 至少 8 位 + 复杂度（不强求，**微信 / Apple / Google 登录不暴露密码**）
- [ ] 登录失败 5 次 → 锁定 15 分钟（Redis 计数）
- [ ] JWT access token 有效期 **15 分钟**，refresh token **7 天**
- [ ] refresh token 一次性使用（用过后作废，签发新的）
- [ ] JWT 撤销：黑名单存 Redis（`SET jti:blocked:<jti> 1 EX 900`）
- [ ] 关键操作（改密码、删除账号）需要二次验证

**实现方法**：
```typescript
// 登录限流
fastify.post('/api/auth/wechat', {
  config: {
    rateLimit: { max: 10, timeWindow: '1 minute' },
  },
}, handler);
```

**自动化测试**：
- ✅ 6 次连续错误密码 → 11 次请求返回 429
- ✅ 用过的 refresh token 再用 → 401
- ✅ JWT 过期后访问受保护资源 → 401

详见 [`test-cases/auth/login.test.md`](./test-cases/auth/login.test.md)。

---

### A08:2021 — Software and Data Integrity Failures（软件和数据完整性失败）

**风险**：CI/CD 投毒、未签名更新、自动更新漏洞。

**Check 列表**：
- [ ] 所有 PR 必须有 CODEOWNERS 审批
- [ ] GitHub Actions 用 pinned SHA（不 `@v4` 而 `@v4.1.7`）
- [ ] Docker 镜像签名（cosign）
- [ ] 数据库 migration 必须可回滚（每个 `migrate dev` 配 `migrate resolve --rolled-back` 文档）
- [ ] 客户端 OTA / 热更新走签名验证（小程序强制 HTTPS + 微信后台校验）

**实现方法**：
- Dependabot 自动开 PR → CODEOWNERS 审批
- PR 必须 1+ approve + CI 绿

**自动化测试**：
- ✅ `actionlint` 扫 workflow 中是否有未固定 SHA 的 step

---

### A09:2021 — Security Logging and Monitoring Failures（日志和监控失败）

**风险**：攻击发生无告警、无审计。

**Check 列表**：
- [ ] 关键事件必记录：登录 / 登出 / 失败登录 / 鉴权失败 / 状态机迁移 / GDPR 操作
- [ ] 日志结构化（pino JSON）
- [ ] 告警：错误率突增 5 倍 → Slack；P0 事件 → PagerDuty
- [ ] 日志保留 ≥ 90 天，**绝不记录敏感字段**（password、token、phone 明文）
- [ ] Sentry 接入前后端

**实现方法**：
```typescript
import pino from 'pino';
export const logger = pino({
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.phone'],
});
```

**事件清单**（必须打日志）：
| 事件 | 字段 |
|------|------|
| `auth.login.success` | userId, provider, ip |
| `auth.login.fail` | reason, ip, userAgent |
| `auth.logout` | userId |
| `activity.create` | activityId, userId |
| `signup.create` | activityId, userId |
| `signup.cancel` | activityId, userId |
| `gdpr.export` | userId |
| `gdpr.delete` | userId |
| `auth.token.refresh` | userId, jti |
| `auth.token.revoked` | userId, jti, reason |
| `rate_limit.exceeded` | ip, endpoint |

---

### A10:2021 — Server-Side Request Forgery (SSRF)（服务端请求伪造）

**风险**：用户传入 URL，服务器被骗访问内网。

**Check 列表**：
- [ ] 服务器**不直接接受用户 URL**（活动封面图走客户端上传 + 后端转存 OSS）
- [ ] 任何 fetch 外部资源用 URL 白名单（仅 `api.weixin.qq.com`、`apis.map.qq.com`）
- [ ] 内部服务用 VPC / 私有网络，**禁止从公网访问**
- [ ] outbound 流量经 egress 代理 + 日志

**实现方法**：
```typescript
// server/src/lib/http.ts
const ALLOWED_HOSTS = new Set(['api.weixin.qq.com', 'apis.map.qq.com']);

export async function safeFetch(url: string, opts: RequestInit) {
  const u = new URL(url);
  if (!ALLOWED_HOSTS.has(u.hostname)) throw new Error('Forbidden host');
  return fetch(url, opts);
}
```

**自动化测试**：
- ✅ 用户传入 `http://localhost:6379` → 拒绝
- ✅ 用户传入 `http://169.254.169.254/...`（AWS metadata）→ 拒绝

---

## 2. 数据加密

### 2.1 传输层

| 场景 | 标准 |
|------|------|
| 客户端 → 后端 | **HTTPS**（TLS 1.2+），HSTS 1 年 |
| 后端 → 微信 / 地图 / 推送 | HTTPS |
| 后端 → DB | SSL（`DATABASE_URL=postgresql://?sslmode=require`） |
| 后端 → Redis | `rediss://`（TLS） |
| 后端 → OSS | HTTPS，签名 URL（短期） |

**强制**：Nginx 301 HTTP→HTTPS；证书自动续期（Let's Encrypt / 腾讯云 SSL）。

### 2.2 存储层

| 字段 | 加密方式 | 备注 |
|------|----------|------|
| `User.phone` | AES-256-GCM | key 存 KMS，IV 随机 |
| `User.wechat` | AES-256-GCM | 同上 |
| `User.email` | AES-256-GCM | 同上 |
| `password`（如有） | **argon2id** hash | cost ≥ 12 |
| `refresh_token` | SHA-256 hash | DB 存 hash，对比时再 hash |
| `access_token` | 不存（JWT 自带签名） | - |
| `payment_*` | **不做**（MVP 无支付，v1.1 再加 PCI DSS） | - |
| `Activity.location` | 明文（公开信息） | 坐标可模糊化到 100m |
| `Message.content` | 客户端加密（端到端，v2） | MVP 明文，但 DB 加密 at-rest |
| 备份 | AES-256 + 异地 | - |

**at-rest 加密**：DB 用云厂商加密盘（腾讯云 / AWS KMS），备份同。

### 2.3 密钥管理

- **不在代码 / 仓库** 提交任何 secret
- 运行时从环境变量 / Vault / AWS Secrets Manager 读
- JWT 私钥用 RSA 4096 位，每 90 天轮换
- 字段加密 key 存 KMS，永不出明文到应用

---

## 3. 鉴权（JWT）

### 3.1 Token 设计

| 类型 | 有效期 | 用途 | 存储 |
|------|--------|------|------|
| **access token** | 15 min | API 调用 | 客户端内存 / 安全 storage |
| **refresh token** | 7 天 | 换 access | 客户端 secure storage + DB hash |
| **ID token**（OIDC） | 1 hour | 第三方登录身份 | 一次性，验完销毁 |

**JWT Payload**：
```json
{
  "sub": "user_123",
  "jti": "uuid-xxx",
  "iat": 1717590000,
  "exp": 1717590900,
  "scope": ["user"],
  "provider": "wechat"
}
```

### 3.2 刷新流程

```
[Client]  access token 过期
   ↓
[Client]  POST /api/auth/refresh { refreshToken }
   ↓
[Server]  校验 refreshToken hash 在 DB 中存在
   ↓
[Server]  作废旧 refreshToken（标记 used_at = now）
   ↓
[Server]  签发新 access + 新 refresh
   ↓
[Client]  替换本地存储
```

**关键**：refresh token **一次性**使用，被用过的 token 再出现 → 撤销整个用户的所有 token。

### 3.3 撤销

| 触发 | 行为 |
|------|------|
| 用户主动登出 | 撤销当前 refreshToken；access 等到自然过期 |
| 用户改密码 | 撤销该用户所有 token |
| 管理员封号 | 撤销所有 token + 加入黑名单 |
| 怀疑泄漏 | 全量撤销 + 强制重新登录 |

**实现**：维护 `revoked_jti` Redis set（TTL = 剩余有效期），每次请求检查。

### 3.4 多端登录

- 同一用户多端可同时在线
- 每端独立 refresh token（`device_id` 区分）
- 用户中心可查看活跃设备并主动踢出

---

## 4. 内容安全（UGC）

### 4.1 范围

需接入**微信内容安全 API**：
- 活动 `title` / `description` / `tags`
- 活动评论 / 群消息
- 用户昵称 / 头像

### 4.2 实现

```typescript
// server/src/plugins/wechat-content-security.ts
import { safeFetch } from '../lib/http';

export async function checkContent(text: string): Promise<boolean> {
  const url = `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${await getAccessToken()}`;
  const res = await safeFetch(url, {
    method: 'POST',
    body: JSON.stringify({ content: text }),
  });
  const data = await res.json();
  return data.errcode === 0;  // 0 = 通过
}
```

### 4.3 触发点

- `POST /api/activities` → 检查 title + description
- `POST /api/messages` → 检查 content
- 用户更新昵称 → 异步检查

### 4.4 失败处理

- API 失败 → **拒绝写入**（fail-closed），不让裸 UGC 进 DB
- 命中违规 → 返回 422 + 错误码 `CONTENT_BLOCKED`，记录日志
- 用户可申诉（工单）

### 4.5 灰度

- 上线前对存量 1K 历史数据跑一次回扫，标记可疑
- 7 天后清退违规内容

详见 [`test-cases/safety/ugc-audit.test.md`](./test-cases/safety/ugc-audit.test.md)（M2 输出）。

---

## 5. GDPR / 数据合规

### 5.1 用户权利

| 权利 | 实现 API | SLA |
|------|----------|-----|
| **访问权** | `GET /api/users/me/export` | 异步生成 7 天内发邮件 |
| **删除权** | `DELETE /api/users/me` | 立即软删 + 30 天后硬删 |
| **更正权** | `PATCH /api/users/me` | 实时 |
| **数据可携** | `GET /api/users/me/export?format=json` | JSON / CSV |
| **拒绝权** | `POST /api/users/me/restrict-processing` | 立即生效（功能受限） |

### 5.2 数据导出实现

```typescript
// server/src/modules/user/gdpr.ts
async function exportUserData(userId: string): Promise<Buffer> {
  const [user, activities, signups, messages, reviews] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.activity.findMany({ where: { creatorId: userId } }),
    prisma.signup.findMany({ where: { userId } }),
    prisma.message.findMany({ where: { userId } }),
    prisma.review.findMany({ where: { fromUserId: userId } }),
  ]);
  return Buffer.from(JSON.stringify({ user, activities, signups, messages, reviews }, null, 2));
}
```

**生成的文件**：
- 存 OSS 私有 bucket，URL 签名 7 天过期
- 通过注册邮箱发送下载链接 + 短信通知

### 5.3 数据删除实现（两阶段）

**T+0 软删**：
- `User.deletedAt = now()`
- 用户无法登录
- 数据保留 30 天（误删恢复）

**T+30 硬删**：
- cron job 每日 03:00 跑：
  - 删 User 行
  - 删 User 相关 Signup（保留活动）
  - 删 User 相关 Message
  - 删 User 相关 Review
  - 删 OSS 上传的头像
  - 删埋点数据（按 userId hash 删）
- 写一条不可变审计日志（"user X deleted at Y, request Z"）

**保留例外**：
- 财务记录（如有支付）→ 保留 7 年
- 法务要求 → 按地区合规要求保留

### 5.4 隐私政策

- 微信小程序后台：必须展示《隐私政策》和《用户协议》
- 用户首次启动弹窗 → 同意后才上报埋点 / 申请位置
- iOS App Store / Google Play 隐私清单

### 5.5 Cookie / 追踪

- 不用第三方追踪 cookie
- 埋点 SDK 全部 server-side 配置 opt-in / opt-out

---

## 6. 第三方依赖审计

### 6.1 流程

| 时机 | 操作 | 阻断 |
|------|------|------|
| PR 推送 | `pnpm audit --prod --audit-level=high` | high/critical 阻断 |
| Dependabot 周一开 PR | 自动 review + merge | - |
| 每月 1 号 | 跑 `pnpm outdated` 会议 | minor 1 周内升级 |
| 重大 CVE 公告 | 24h 内响应 | 阻断 release |
| 每年 Q4 | 大版本升级（如 fastify 4→5） | 排期 |

### 6.2 工具链

- **npm/pnpm audit** — 内置，0 成本
- **Dependabot** — GitHub 原生
- **Snyk**（可选）— 商业，更深
- **Socket.dev**（可选）— 检测恶意包

### 6.3 包准入

新增依赖前检查：
- [ ] GitHub stars ≥ 100 且周下载 ≥ 1K
- [ ] 维护活跃（最近 6 个月有 commit）
- [ ] 许可证兼容（MIT / Apache 2.0 / BSD）
- [ ] 无已知 high 漏洞
- [ ] 不引入超过 50MB 依赖

---

## 7. 安全事件响应

### 7.1 分级

| 等级 | 例子 | 响应 |
|------|------|------|
| **S0** | 数据泄漏 / RCE | 立即：CTO + 全员 + 4h 内通知用户 + 监管报告 |
| **S1** | 鉴权绕过 | 24h：CTO + 端 Owner + 修 + 通知用户 |
| **S2** | 限流绕过 | 72h：端 Owner + 修 |
| **S3** | 误报 / 弱安全配置 | 1 周：常规迭代 |

### 7.2 流程

```
[发现 / 报告]
   ↓
[Triage]（4h 内）
   ↓
[Containment]（隔离 / 临时修复）
   ↓
[Eradication]（根因修复 + 复测）
   ↓
[Recovery]（恢复服务）
   ↓
[Post-mortem]（24h 内写 blameless 复盘）
   ↓
[Action items]（跟进 1 周）
```

---

## 8. CI 集成（详见 [`ci-matrix.md`](./ci-matrix.md) §2.1）

| 工具 | 触发 | 阻断 |
|------|------|------|
| `pnpm audit` | PR | high/critical |
| OWASP ZAP baseline | tag | high 漏洞 |
| Semgrep (`p/owasp-top-ten`) | PR | high |
| Trivy（Docker 镜像） | tag | critical |
| testssl.sh | tag | TLS 配置 |
| `actionlint` | PR | workflow 安全 |

---

## 9. M1 出口（必完成）

- [ ] A01 / A02 / A03 / A07 在 `tests/security/` 至少各 1 个测试
- [ ] JWT 刷新 + 撤销逻辑 + 单测
- [ ] 微信内容安全 API 接入 + 失败 fail-closed
- [ ] GDPR 导出 + 删除 API（M2 端到端验证）
- [ ] pnpm audit + Dependabot + Sentry 接入
- [ ] 安全事件响应 Playbook（在 `docs/security/incident-response.md`，M2 输出）

---

## 10. 引用

- 架构：[`../architecture.md`](../architecture.md) §安全与合规
- 测试计划：[`test-plan-v1.0.md`](./test-plan-v1.0.md) §6 缺陷管理
- CI 矩阵：[`ci-matrix.md`](./ci-matrix.md) §2 安全 job
- 性能基线：[`performance-baseline.md`](./performance-baseline.md) §5 埋点
- API 规范：[`../api/conventions.md`](../api/conventions.md) 错误码
- 微信生态：[`../api/wechat.md`](../api/wechat.md) 内容安全章节
- OWASP Top 10 2021 — https://owasp.org/Top10/
- GDPR 官方 — https://gdpr-info.eu/
- CTO 路线图：[`../../studybuddy-plan/cto-roadmap-v1.0.md`](../../studybuddy-plan/cto-roadmap-v1.0.md) §5 Q3 + R5

---

> **最后更新**：2026-06-05 @OpenClaw · 任何变更请 PR 修改本文档
