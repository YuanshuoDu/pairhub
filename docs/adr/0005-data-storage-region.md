# ADR-0005: 数据存储地域 — 国内腾讯云 / 海外 AWS 双地域

> **状态**：✅ Accepted
> **日期**：2026-06-05
> **决策人**：@YuanshuoDu（决策人） / @Oracle Hermes（CTO 提报） / @爱马仕（腾讯生态）
> **关联**：[cto-roadmap-v1.0.md §0 Q5/Q8](../../pairhub-plan/cto-roadmap-v1.0.md) · [architecture-v1.0.md §7.4 / §9](../architecture-v1.0.md) · [ADR-0003 多端登录合并](./0003-auth-strategy.md)

## Context（背景）

Pairhub 的用户群体有清晰的地域分布：

| 群体 | 占比 | 主要国家 | 网络 |
|------|------|----------|------|
| 中国大陆留学生（在国内） | 约 60% | 中国 | 微信原生 |
| 海外华人留学生 | 约 30% | 美 / 英 / 澳 / 加 / 新 / 日 / 韩 | iOS / Android + 微信（少数） |
| 其他 | 约 10% | 东南亚 / 欧洲 | iOS / Android |

**核心矛盾**：

1. **国内法规**：所有在中国大陆收集的个人信息（手机号、位置、身份证等）**必须存储于境内服务器**，且需通过 ICP 备案
2. **海外体验**：海外用户访问腾讯云**延迟高、不稳定**，影响 App 体验
3. **GDPR / CCPA**：海外用户对其个人数据有「被遗忘权 / 导出权」，需要在地域上隔离
4. **微信小程序**：必须部署在**国内服务器**（微信侧强制要求）

**这意味着**：单地域部署无法同时满足法规 + 体验。

候选方案：

| 方案 | 合规 | 海外体验 | 复杂度 | 成本 |
|------|------|----------|--------|------|
| **A. 国内腾讯云 + 海外 AWS 双地域，按地域路由** | ✅ | ✅ | 高 | 中 |
| B. 全部腾讯云 | ✅ 国内 / ❌ 海外 | ❌ 差 | 低 | 低 |
| C. 全部 AWS | ❌ 国内不合规 | ✅ | 低 | 低 |
| D. Cloudflare + 自建多地域 | ⚠️ 中 | ✅ | 极高 | 高 |

## Decision（决策）

**采用方案 A：国内腾讯云 + 海外 AWS，按用户地域路由到对应后端集群。**

### 1. 地域定义

| 地域标识 | 服务范围 | 云厂商 | 部署位置 | 主要用户 |
|----------|----------|--------|----------|----------|
| `CN` | 中国大陆 | 腾讯云 | 上海 / 广州（多 AZ） | 国内留学生 |
| `GLOBAL` | 海外 | AWS | 东京 / 新加坡 / 法兰克福（按用户分布选） | 海外华人 + 其他 |

### 2. 路由策略

#### 2.1 微信小程序（强制国内）

- 小程序后端 **100% 部署在腾讯云 CN 地域**
- 微信侧强制要求 + ICP 备案约束，**无路由选择**

#### 2.2 Flutter App（按用户 IP 路由）

```
请求进入 → Cloudflare / DNSPod 智能解析
  → CN IP → 腾讯云 CLB（CN 地域）
  → 非 CN IP → AWS ALB（GLOBAL 地域）
```

**实现**：
- 客户端**不感知地域** — DNS 解析时按出口 IP 分配
- 客户端登录后，**根据返回的 JWT payload 中 `region` 字段**（CN / GLOBAL）决定后续 API 域名
- 跨地域迁移（用户在海外登录国内账号）：**通过 link-provider 触发数据迁移**（见下）

### 3. 数据隔离

#### 3.1 物理隔离

| 资源 | CN 地域 | GLOBAL 地域 |
|------|---------|-------------|
| PostgreSQL | 腾讯云 PG（主从） | AWS RDS PG（多 AZ） |
| Redis | 腾讯云 Redis | AWS ElastiCache |
| 对象存储 | 腾讯云 COS | AWS S3 |
| 监控 | 腾讯云监控 + Grafana | CloudWatch + Grafana |

**两套数据库 schema 一致**，但数据**不互通**。每个 `User` 在创建时绑定一个 `region`，**物理上**只存在一个地域。

#### 3.2 跨地域用户（少见但要处理）

**场景**：用户 A 在国内创建账号 → 出国后用 iOS 登录（IP 在海外）

**处理策略**：
1. **首选**：客户端通过 `link-provider` 把 Apple/Google 登录合并到原账号，**数据不迁移**
2. **次选**：用户主动发起「迁移请求」（M2 实现）→ 后台异步把该 user 全部数据从一个地域复制到另一个，**标记旧地域数据为迁移完成（不删除 30 天，保留恢复窗口）**

**实现**（M2）：
```
POST /api/users/me/migrate-region
Body: { to_region: "CN" | "GLOBAL" }
→ 202 { task_id }  // 异步任务
→ GET /api/users/me/migrate-region/:task_id → status
```

### 4. 合规清单

| 法规 | 适用 | 我们的措施 |
|------|------|------------|
| **中国《个人信息保护法》** | CN 地域 | 数据落地腾讯云；不向境外提供；用户协议明示 |
| **ICP 备案** | CN 地域域名 | 部署前由 @爱马仕 完成（默认 placeholder） |
| **微信小程序运营规范** | 微信侧 | 后端必须国内；隐私协议链接必须可访问 |
| **GDPR** | GLOBAL 地域 | 数据落地 AWS EU/Asia；支持「被遗忘」接口；30 天硬删除 |
| **CCPA** | GLOBAL 地域（加州用户） | 同 GDPR；额外支持「不出售我的数据」声明 |
| **网络安全法** | CN 地域 | 日志留存 6 个月；实名认证字段预留 |

### 5. 实施时间表

| 阶段 | CN 地域 | GLOBAL 地域 |
|------|---------|-------------|
| M1 | 腾讯云部署（v0.2 已就位） | **同集群**（M1 阶段海外用户走 CN，**临时方案**） |
| M2 | GA | AWS 部署 + 智能解析 |
| M3 | GA | GA |
| v1.1 | 跨地域迁移功能 | 跨地域迁移功能 |

**M1 阶段说明**：海外用户走 CN 集群会有 200-500ms 延迟，**可接受**（M1 阶段用户量 < 100）。M2 上 AWS 后再优化。

### 6. 路由与降级

#### 6.1 健康检查

```
Cloudflare Health Check:
  - 腾讯云 /health → 200 ✅
  - AWS /health → 200 ✅
  - 任一 5xx → 自动切 DNS（Cloudflare 智能解析）
```

#### 6.2 降级策略

| 故障 | 降级 |
|------|------|
| CN 集群挂 | 微信小程序暂不可用（强制 CN），App 用户切 GLOBAL |
| GLOBAL 集群挂 | App 海外用户切 CN，**明确提示「当前在境内节点，延迟较高」** |
| 跨地域数据迁移失败 | 任务回滚到原地域，告警 |

### 7. 部署清单（占位 — DevOps track 落实）

```yaml
# infra/region/cn/main.tf
provider: tencentcloud
region: ap-shanghai
resources:
  - cvm (Fastify × 2 + Cron × 1)
  - postgres (主从)
  - redis (sentinel × 3)
  - cos (bucket: pairhub-cn)

# infra/region/global/main.tf
provider: aws
region: ap-northeast-1  # 东京，亚洲延迟最优
resources:
  - ec2 (Fastify × 2 + Cron × 1)
  - rds (postgres, multi-az)
  - elasticache (redis)
  - s3 (bucket: pairhub-global)
```

## Consequences（影响 / 代价）

### ✅ 收益

- **合规**：CN / GLOBAL 各满足当地法规
- **海外体验**：海外用户延迟从 500ms 降到 < 100ms
- **可扩展**：未来加新地域（欧洲 GDPR 专用）只需复制一套
- **故障隔离**：CN 挂了不影响 GLOBAL

### ⚠️ 代价与风险

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| **R1：双地域成本** | 高 | 中 | M1 用 CN 单集群临时方案；M2 评估成本 vs 收益 |
| **R2：跨地域数据迁移一致性** | 中 | 高 | 异步任务 + 30 天回滚窗口 + 双写校验 |
| **R3：DNS 解析误判**（用户出差 / VPN） | 中 | 中 | 客户端缓存 `region` 30 天；异常时引导用户手动切 |
| **R4：两套部署运维成本** | 高 | 中 | Terraform IaC + 同一套 Docker 镜像 + ArgoCD |
| **R5：ICP 备案被卡** | 中 | 高 | M1 末由 @爱马仕 申请；如卡，转用「境外主体」海外集群 |
| **R6：海外用户无法用微信小程序** | 中 | 低 | 海外用户走 App，**App 是主战场** |
| **R7：审计日志双地域同步** | 中 | 中 | M2 引入集中式审计（只读副本） |

### 🔁 不可逆性评估

- **中不可逆**：一旦部署两个地域，**回退到单地域成本高**（需数据合并 + 用户重新绑定）
- **关键决策点**：M2 上 AWS 前必须**完成 CN 用户的 P95 监控 + 留存基线**

### 📋 决策后续

- M1：CN 部署就位（默认）；GLOBAL 暂用 CN（明确标注临时）
- M1-W4：DevOps 出 `infra/region/cn/` Terraform
- M2-W5：DevOps 出 `infra/region/global/` Terraform
- M2-W6：智能解析 + 跨地域迁移接口
- M2-W7：海外种子用户 50 人灰度

## Status

- ✅ **Accepted** — 2026-06-05
- 📅 下次 review：M2-W5（GLOBAL 部署前）
- 👥 Owner：@Oracle Hermes（CTO）/ @爱马仕（CN 部署）/ @美国hermes 兼 DevOps（GLOBAL 部署）

## 备选方案被否决的理由

- ❌ **B. 全部腾讯云**：海外用户延迟 500ms+，**直接拉低海外 NPS**；违反 GDPR 跨境传输限制
- ❌ **C. 全部 AWS**：微信小程序强制国内，**完全不可行**
- ❌ **D. Cloudflare + 自建多地域**：合规与成本都不占优，**复杂度极高**，MVP 阶段不可承受

## 交叉引用

- [architecture-v1.0.md §7.4 部署与基础设施](../architecture-v1.0.md)
- [architecture-v1.0.md §9 部署拓扑](../architecture-v1.0.md)
- [architecture-v1.0.md §8.5 GDPR 预留](../architecture-v1.0.md)
- [ADR-0003 多端登录合并](./0003-auth-strategy.md)
